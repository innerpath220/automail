import crypto from "crypto";
import express from "express";
import path from "path";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import Stripe from "stripe";
import { createServer as createViteServer } from "vite";
import { initializeApp, getApp, getApps } from "firebase-admin/app";
import { getAuth, DecodedIdToken } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import firebaseConfig from "./firebase-applet-config.json";
import type {
  CampaignContext,
  EnrichedLead,
  Lead,
  EmailServiceConnectionInput,
  EmailServiceType,
  PlanId,
  SmtpProviderId,
  SubscriptionStatus,
  UserProfile,
} from "./src/types";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

const firebaseApp = getApps().length === 0
  ? initializeApp({ projectId: firebaseConfig.projectId })
  : getApp();

const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
db.settings({ ignoreUndefinedProperties: true });

const OWNER_EMAIL = "innerpathbusiness@gmail.com";

const PLAN_LIMITS: Record<PlanId, number> = {
  free: 20,
  starter: 200,
  pro: 2000,
  owner: 999999,
};

const PLAN_PRICE_ENV = {
  starter: "STRIPE_PRICE_STARTER_MONTHLY",
  pro: "STRIPE_PRICE_PRO_MONTHLY",
} as const;

type PaidPlanId = keyof typeof PLAN_PRICE_ENV;

type StoredEmailService = {
  serviceType: EmailServiceType;
  displayName: string;
  senderName?: string;
  senderEmail?: string;
  smtpProvider?: SmtpProviderId | null;
  smtpHost?: string;
  smtpPort?: string;
  smtpUser?: string;
  encryptedSecrets: string;
  isActive: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
  dailyCount?: number;
  dailyKey?: string;
  monthlyCount?: number;
  monthlyKey?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastFailureReason?: string;
};

type DecryptedSecrets = {
  publicKey?: string;
  privateKey?: string;
  serviceId?: string;
  templateId?: string;
  apiKey?: string;
  smtpPassword?: string;
};

type NormalizedService = StoredEmailService & {
  id: string;
  dailyCount: number;
  dailyKey: string;
  monthlyCount: number;
  monthlyKey: string;
};

type AiProvider = "groq";

type GroqChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
};

function trimOptionalString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function getNow() {
  return new Date();
}

function getDayKey(date = getNow()) {
  return date.toISOString().slice(0, 10);
}

function getMonthKey(date = getNow()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getMonthBounds(date = getNow()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { start, end };
}

function getNextUtcDay(date = getNow()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
}

function getPlanLimit(planId: PlanId) {
  return PLAN_LIMITS[planId] || PLAN_LIMITS.free;
}

function getStripeClient() {
  const secretKey = trimOptionalString(process.env.STRIPE_SECRET_KEY);
  if (!secretKey) {
    return null;
  }

  return new Stripe(secretKey);
}

function getStripeWebhookSecret() {
  return trimOptionalString(process.env.STRIPE_WEBHOOK_SECRET);
}

function getStripePriceId(planId: PaidPlanId) {
  return trimOptionalString(process.env[PLAN_PRICE_ENV[planId]]);
}

function getBaseAppUrl() {
  return trimOptionalString(process.env.APP_URL) || "http://localhost:3000";
}

function getStripeBillingConfig() {
  const stripe = getStripeClient();
  return {
    ready: Boolean(stripe),
    checkoutEnabled: Boolean(stripe && getStripePriceId("starter") && getStripePriceId("pro")),
    portalEnabled: Boolean(stripe),
    plans: {
      starter: Boolean(getStripePriceId("starter")),
      pro: Boolean(getStripePriceId("pro")),
    },
  };
}

function getEncryptionKey() {
  const secret = trimOptionalString(process.env.SMTP_SETTINGS_ENCRYPTION_KEY);
  if (!secret) {
    throw new Error("SMTP_SETTINGS_ENCRYPTION_KEY is missing.");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptSecrets(payload: Record<string, unknown>) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

function decryptSecrets(payload: string): DecryptedSecrets {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as DecryptedSecrets;
}

function buildDefaultProfile(planId: PlanId = "free", subscriptionStatus: SubscriptionStatus = "active"): UserProfile {
  const now = getNow();
  const { start, end } = getMonthBounds(now);
  const monthlyGenerationLimit = getPlanLimit(planId);
  return {
    planId,
    subscriptionStatus,
    monthlyGenerationLimit,
    usedGenerationsThisPeriod: 0,
    remainingGenerations: monthlyGenerationLimit,
    currentPeriodStart: start.toISOString(),
    currentPeriodEnd: end.toISOString(),
  };
}

function toProfileDocument(profile: UserProfile) {
  return {
    planId: profile.planId,
    subscriptionStatus: profile.subscriptionStatus,
    monthlyGenerationLimit: profile.monthlyGenerationLimit,
    usedGenerationsThisPeriod: profile.usedGenerationsThisPeriod,
    remainingGenerations: profile.remainingGenerations,
    currentPeriodStart: profile.currentPeriodStart,
    currentPeriodEnd: profile.currentPeriodEnd,
    ...(profile.stripeCustomerId ? { stripeCustomerId: profile.stripeCustomerId } : {}),
    ...(profile.stripeSubscriptionId ? { stripeSubscriptionId: profile.stripeSubscriptionId } : {}),
    ...(profile.lastCheckoutSessionId ? { lastCheckoutSessionId: profile.lastCheckoutSessionId } : {}),
  };
}

async function ensureUserProfile(userId: string, email?: string) {
  const isOwner = email === OWNER_EMAIL;
  const ref = db.doc(`users/${userId}/profile/main`);
  const snap = await ref.get();
  
  if (!snap.exists) {
    const profile = buildDefaultProfile(isOwner ? "owner" : "free");
    await ref.set({
      ...toProfileDocument(profile),
      updatedAt: new Date().toISOString(),
    });
    return profile;
  }

  const data = snap.data() as Partial<UserProfile> & { updatedAt?: string };
  const now = getNow();
  const { start, end } = getMonthBounds(now);
  const currentPeriodEnd = trimOptionalString(data.currentPeriodEnd) || end.toISOString();
  let planId = (trimOptionalString(data.planId) || "free") as PlanId;
  
  if (isOwner) {
    planId = "owner";
  } else if (!(planId in PLAN_LIMITS)) {
    planId = "free";
  }
  
  let usedGenerationsThisPeriod = typeof data.usedGenerationsThisPeriod === "number" ? data.usedGenerationsThisPeriod : 0;
  let currentPeriodStart = trimOptionalString(data.currentPeriodStart) || start.toISOString();
  let nextPeriodEnd = currentPeriodEnd;
  let shouldWrite = false;

  if (isOwner && data.planId !== "owner") {
    shouldWrite = true;
  }

  if (new Date(currentPeriodEnd).getTime() <= now.getTime()) {
    usedGenerationsThisPeriod = 0;
    currentPeriodStart = start.toISOString();
    nextPeriodEnd = end.toISOString();
    shouldWrite = true;
  }

  const monthlyGenerationLimit = isOwner 
    ? PLAN_LIMITS.owner 
    : typeof data.monthlyGenerationLimit === "number"
      ? data.monthlyGenerationLimit
      : getPlanLimit(planId);
      
  const profile: UserProfile = {
    planId,
    subscriptionStatus: (trimOptionalString(data.subscriptionStatus) || "active") as SubscriptionStatus,
    monthlyGenerationLimit,
    usedGenerationsThisPeriod,
    remainingGenerations: Math.max(0, monthlyGenerationLimit - usedGenerationsThisPeriod),
    currentPeriodStart,
    currentPeriodEnd: nextPeriodEnd,
    stripeCustomerId: trimOptionalString(data.stripeCustomerId) || undefined,
    stripeSubscriptionId: trimOptionalString(data.stripeSubscriptionId) || undefined,
    lastCheckoutSessionId: trimOptionalString(data.lastCheckoutSessionId) || undefined,
  };

  if (shouldWrite) {
    await ref.set({
      ...toProfileDocument(profile),
      updatedAt: now.toISOString(),
    }, { merge: true });
  }

  return profile;
}

async function saveUserProfile(userId: string, profile: UserProfile) {
  await db.doc(`users/${userId}/profile/main`).set({
    ...toProfileDocument(profile),
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}

function normalizeServiceUsage(docId: string, data: StoredEmailService): NormalizedService {
  const now = getNow();
  const dayKey = getDayKey(now);
  const monthKey = getMonthKey(now);
  return {
    ...data,
    id: docId,
    dailyCount: data.dailyKey === dayKey ? (data.dailyCount || 0) : 0,
    dailyKey: dayKey,
    monthlyCount: data.monthlyKey === monthKey ? (data.monthlyCount || 0) : 0,
    monthlyKey: monthKey,
  };
}

function getServiceLimit(service: Pick<NormalizedService, "serviceType" | "smtpProvider">) {
  if (service.serviceType === "emailjs") {
    return { limit: 200, period: "month" as const };
  }
  if (service.serviceType === "brevo") {
    return { limit: 300, period: "day" as const };
  }
  if (service.serviceType === "sendgrid") {
    return { limit: 100, period: "day" as const };
  }
  if (service.serviceType === "resend") {
    return { limit: 100, period: "day" as const };
  }
  if (service.smtpProvider === "gmail") {
    return { limit: 500, period: "day" as const };
  }
  if (service.smtpProvider === "outlook") {
    return { limit: 300, period: "day" as const };
  }
  if (service.smtpProvider === "yahoo") {
    return { limit: 500, period: "day" as const };
  }
  return { limit: 500, period: "day" as const };
}

function getServiceLabel(service: Pick<StoredEmailService, "serviceType" | "smtpProvider" | "displayName">) {
  if (service.serviceType === "smtp") {
    if (service.displayName) {
      return service.displayName;
    }
    if (service.smtpProvider === "gmail") return "Gmail SMTP";
    if (service.smtpProvider === "outlook") return "Outlook SMTP";
    if (service.smtpProvider === "yahoo") return "Yahoo SMTP";
    return "SMTP";
  }
  return service.displayName;
}

function buildUsageSnapshot(service: NormalizedService) {
  const definition = getServiceLimit(service);
  const used = definition.period === "day" ? service.dailyCount : service.monthlyCount;
  const remaining = Math.max(0, definition.limit - used);
  const resetAt = definition.period === "day"
    ? getNextUtcDay().toISOString()
    : getMonthBounds().end.toISOString();
  return {
    used,
    limit: definition.limit,
    remaining,
    period: definition.period,
    resetAt,
  };
}

function summarizeService(service: NormalizedService) {
  const usage = buildUsageSnapshot(service);
  const secrets = service.encryptedSecrets ? decryptSecrets(service.encryptedSecrets) : {};
  const health = !service.isActive
    ? "inactive"
    : usage.remaining <= 0
      ? "exhausted"
      : service.lastFailureReason
        ? "error"
        : "ready";

  return {
    id: service.id,
    serviceType: service.serviceType,
    displayName: getServiceLabel(service),
    senderName: service.senderName,
    senderEmail: service.senderEmail,
    smtpProvider: service.smtpProvider || null,
    smtpHost: service.smtpHost,
    smtpPort: service.smtpPort,
    isActive: service.isActive,
    hasCredentials: Boolean(service.encryptedSecrets),
    health,
    lastFailureReason: service.lastFailureReason,
    lastSuccessAt: service.lastSuccessAt,
    createdAt: service.createdAt,
    updatedAt: service.updatedAt,
    priority: service.priority,
    usage,
    secretStatus: {
      hasEmailJsPrivateKey: service.serviceType === "emailjs" ? Boolean(trimOptionalString(secrets.privateKey)) : undefined,
    },
    revealedSecrets: {
      publicKey: trimOptionalString(secrets.publicKey) || undefined,
      privateKey: trimOptionalString(secrets.privateKey) || undefined,
      serviceId: trimOptionalString(secrets.serviceId) || undefined,
      templateId: trimOptionalString(secrets.templateId) || undefined,
      apiKey: trimOptionalString(secrets.apiKey) || undefined,
      smtpPassword: trimOptionalString(secrets.smtpPassword) || undefined,
    },
  };
}

async function listUserServices(userId: string) {
  const snap = await db.collection(`users/${userId}/emailServices`).get();
  const normalized = snap.docs
    .map((doc) => normalizeServiceUsage(doc.id, doc.data() as StoredEmailService))
    .sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.createdAt.localeCompare(b.createdAt);
    });

  await Promise.all(normalized.map(async (service) => {
    await db.doc(`users/${userId}/emailServices/${service.id}`).set({
      dailyCount: service.dailyCount,
      dailyKey: service.dailyKey,
      monthlyCount: service.monthlyCount,
      monthlyKey: service.monthlyKey,
    }, { merge: true });
  }));

  return normalized;
}

function sanitizeConnectionInput(payload: Partial<EmailServiceConnectionInput>, existing?: StoredEmailService) {
  const serviceType = (trimOptionalString(payload.serviceType) || existing?.serviceType || "") as EmailServiceType;
  if (!["emailjs", "brevo", "sendgrid", "resend", "smtp"].includes(serviceType)) {
    throw new Error("A valid email service type is required.");
  }

  const displayName = trimOptionalString(payload.displayName) || existing?.displayName || "";
  if (!displayName) {
    throw new Error("Display name is required.");
  }

  const smtpProvider = (trimOptionalString(payload.smtpProvider) || existing?.smtpProvider || "custom") as SmtpProviderId;
  const senderEmail = trimOptionalString(payload.senderEmail) || existing?.senderEmail || "";
  const senderName = trimOptionalString(payload.senderName) || existing?.senderName || "";
  const smtpHost = trimOptionalString(payload.smtpHost) || existing?.smtpHost || "";
  const smtpPort = trimOptionalString(payload.smtpPort) || existing?.smtpPort || "587";
  const smtpUser = trimOptionalString(payload.smtpUser) || existing?.smtpUser || "";
  const isActive = typeof payload.isActive === "boolean" ? payload.isActive : existing?.isActive ?? true;
  const priority = typeof payload.priority === "number" ? payload.priority : existing?.priority ?? 0;
  const secrets = payload.secrets || {};

  if (senderEmail && !isValidEmail(senderEmail)) {
    throw new Error("Sender email is invalid.");
  }

  if (serviceType === "emailjs") {
    if (!trimOptionalString(secrets.publicKey) && !existing) throw new Error("EmailJS public key is required.");
    if (!trimOptionalString(secrets.serviceId) && !existing) throw new Error("EmailJS service ID is required.");
    if (!trimOptionalString(secrets.templateId) && !existing) throw new Error("EmailJS template ID is required.");
  }

  if (serviceType === "brevo" || serviceType === "sendgrid" || serviceType === "resend") {
    if (!trimOptionalString(secrets.apiKey) && !existing) {
      throw new Error(`${serviceType} API key is required.`);
    }
  }

  if (serviceType === "smtp") {
    if (!smtpUser) {
      throw new Error("SMTP email address is required.");
    }
    if (!isValidEmail(smtpUser)) {
      throw new Error("SMTP email address is invalid.");
    }
    if (!trimOptionalString(secrets.smtpPassword) && !existing) {
      throw new Error("SMTP app password is required.");
    }
  }

  return {
    serviceType,
    displayName,
    senderName,
    senderEmail,
    smtpProvider: serviceType === "smtp" ? smtpProvider : null,
    smtpHost: serviceType === "smtp" ? smtpHost : "",
    smtpPort: serviceType === "smtp" ? smtpPort : "",
    smtpUser: serviceType === "smtp" ? smtpUser : "",
    isActive,
    priority,
    secrets: {
      publicKey: trimOptionalString(secrets.publicKey),
      privateKey: trimOptionalString(secrets.privateKey),
      serviceId: trimOptionalString(secrets.serviceId),
      templateId: trimOptionalString(secrets.templateId),
      apiKey: trimOptionalString(secrets.apiKey),
      smtpPassword: trimOptionalString(secrets.smtpPassword),
    },
  };
}

function mergeSecrets(existing: DecryptedSecrets | null, incoming: ReturnType<typeof sanitizeConnectionInput>["secrets"]) {
  return {
    publicKey: incoming.publicKey || existing?.publicKey || "",
    privateKey: incoming.privateKey || existing?.privateKey || "",
    serviceId: incoming.serviceId || existing?.serviceId || "",
    templateId: incoming.templateId || existing?.templateId || "",
    apiKey: incoming.apiKey || existing?.apiKey || "",
    smtpPassword: incoming.smtpPassword || existing?.smtpPassword || "",
  };
}

async function resolveAuthFromRequest(req: express.Request) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Missing authentication token.");
  }
  const token = authHeader.slice("Bearer ".length);
  return auth.verifyIdToken(token);
}

function toSentence(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function buildOfferLine(campaign: CampaignContext) {
  const company = campaign.sender_company?.trim() || "our company";
  const offer = campaign.offer.trim();

  if (!offer) {
    return `At ${company}, we help businesses like yours improve follow-up.`;
  }

  if (/^we\s+/i.test(offer) || /^i\s+/i.test(offer)) {
    return toSentence(offer);
  }

  if (/^help\b/i.test(offer)) {
    const sentence = toSentence(offer);
    return `At ${company}, we ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}`;
  }

  return `At ${company}, we help businesses like yours with ${toSentence(offer).replace(/[.]$/, "")}.`;
}

function buildFallbackDraft(campaign: CampaignContext, lead: Lead) {
  const company = lead.company_name?.trim() || lead.business_category?.trim() || "your business";
  const intro = lead.notes?.trim()
    ? `I noticed ${lead.notes.trim().replace(/\.$/, "")}.`
    : campaign.sender_context.trim() || `I came across ${company} and thought there might be a fit.`;
  const sender = campaign.sender_name?.trim() || "A teammate";

  return {
    subject: `${company}: quick idea`,
    message: [
      `Hi ${company} team,`,
      "",
      intro,
      buildOfferLine(campaign),
      toSentence(campaign.cta.trim()),
      "",
      `If this is not relevant, reply and I'll stop reaching out.`,
      "",
      `Best,`,
      sender,
    ].join("\n"),
  };
}

function normalizeLead(raw: unknown, index: number, campaign: CampaignContext, sourceLead?: Lead): EnrichedLead {
  const item = (raw && typeof raw === "object") ? raw as Record<string, unknown> : {};
  const confidenceValue = Number(item.category_confidence);
  const email = typeof item.email === "string"
    ? item.email.trim()
    : (typeof item.email_address === "string" ? item.email_address.trim() : "");
  const skipReason = typeof item.skip_reason === "string" ? item.skip_reason.trim() : "";
  const companyName = typeof item.company_name === "string"
    ? item.company_name.trim()
    : (sourceLead?.company_name?.trim() || "");
  const subject = typeof item.subject === "string"
    ? item.subject.trim()
    : "";
  const message = typeof item.message === "string"
    ? item.message.trim()
    : "";
  const hasValidEmail = isValidEmail(email);
  const requestedSendable = typeof item.sendable === "boolean" ? item.sendable : hasValidEmail;
  const sendable = requestedSendable && hasValidEmail && Boolean(subject) && Boolean(message);

  return {
    lead_id: typeof item.lead_id === "string" && item.lead_id.trim() ? item.lead_id : `lead-${index + 1}`,
    email,
    phone_number: typeof item.phone_number === "string" && item.phone_number.trim() ? item.phone_number.trim() : "Not provided",
    company_name: companyName || undefined,
    business_category: typeof item.business_category === "string" && item.business_category.trim() ? item.business_category.trim() : "General business",
    category_confidence: Number.isFinite(confidenceValue) ? Math.min(1, Math.max(0, confidenceValue)) : 0,
    sendable,
    needs_review: sendable ? Boolean(item.needs_review) : true,
    skip_reason: sendable ? skipReason : skipReason || "Email missing or invalid",
    subject,
    message,
    debug_info: sendable ? undefined : "fallback validation failed",
  };
}

function buildLeadPrompt(campaign: CampaignContext, leads: Lead[]) {
  return `
You are an AI lead enrichment and email drafting assistant.
Process the following leads for the given campaign.

Campaign Context:
- Goal: ${campaign.campaign_goal}
- Offer: ${campaign.offer}
- Sender: ${campaign.sender_name} (${campaign.sender_email}) at ${campaign.sender_company}
- Sender Context: ${campaign.sender_context}
- CTA: ${campaign.cta}
${campaign.tone_preference ? `- Tone Preference: ${campaign.tone_preference}` : ""}

Rules:
1. Clean and enrich lead data. Never invent email addresses.
2. If email is missing or invalid, mark sendable=false and skip_reason="Email missing or invalid".
3. If phone_number is missing, set to "Not provided".
4. Infer business_category if missing, include category_confidence (0.0-1.0). If unsure, set to "General business".
5. Draft a human-sounding email (60-120 words). Warm, credible, low-pressure.
6. No placeholders, no filler text, exactly one clear CTA.
7. Include a polite opt-out line.
8. Every sendable lead must include a non-empty subject and message.
9. Final output must be JSON only.

Leads to process:
${JSON.stringify(leads, null, 2)}
`;
}

function getAiProvider(): AiProvider {
  const configured = trimOptionalString(process.env.AI_PROVIDER).toLowerCase();
  return configured === "groq" || !configured ? "groq" : "groq";
}

function buildFallbackLeads(campaign: CampaignContext, leads: Lead[], debugInfo: string): EnrichedLead[] {
  return leads.map((lead, index) => {
    const fallback = buildFallbackDraft(campaign, lead);
    const email = trimOptionalString(lead.email);
    const sendable = isValidEmail(email);
    return {
      lead_id: lead.lead_id || `lead-${index + 1}`,
      email,
      phone_number: trimOptionalString(lead.phone_number) || "Not provided",
      company_name: trimOptionalString(lead.company_name) || undefined,
      business_category: trimOptionalString(lead.business_category) || "General business",
      category_confidence: trimOptionalString(lead.business_category) ? 0.8 : 0.25,
      sendable,
      needs_review: true,
      skip_reason: sendable ? "" : "Email missing or invalid",
      subject: sendable ? fallback.subject : "",
      message: sendable ? fallback.message : "",
      debug_info: debugInfo,
    };
  });
}

function getGroqApiKey() {
  return trimOptionalString(process.env.GROQ_API_KEY);
}

function getGroqModel() {
  return trimOptionalString(process.env.GROQ_MODEL) || "llama-3.3-70b-versatile";
}

function extractJsonPayload(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }

  const normalized = trimmed.replace(/```json/gi, "```");
  const codeBlockMatch = normalized.match(/```([\s\S]*?)```/);
  if (codeBlockMatch?.[1]) {
    return codeBlockMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

async function generateLeadBatchWithGroq(campaign: CampaignContext, leads: Lead[]) {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    return null;
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: getGroqModel(),
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You enrich leads and draft outbound business emails.",
            "Reply with strict JSON only.",
            "Return an object with one key named leads.",
            "The leads array must have one item per input lead in the same order.",
            "Each item must contain lead_id, email, phone_number, business_category, category_confidence, sendable, needs_review, skip_reason, subject, and message.",
            "Never invent email addresses.",
          ].join(" "),
        },
        {
          role: "user",
          content: `${buildLeadPrompt(campaign, leads)}\n\nReturn only JSON in the shape {"leads":[...]}.`,
        },
      ],
    }),
  });

  const rawText = await response.text();
  let payload: GroqChatResponse | null = null;
  if (rawText.trim()) {
    try {
      payload = JSON.parse(rawText) as GroqChatResponse;
    } catch {
      if (!response.ok) {
        throw new Error(`Groq ${response.status}: ${rawText.trim()}`);
      }
    }
  }

  if (!response.ok) {
    const providerMessage = trimOptionalString(payload?.error?.message) || rawText.trim() || response.statusText;
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Groq authentication failed: ${providerMessage}`);
    }
    if (response.status === 429) {
      throw new Error(`Groq rate limit exceeded: ${providerMessage}`);
    }
    throw new Error(`Groq ${response.status}: ${providerMessage}`);
  }

  const content = payload?.choices?.[0]?.message?.content;
  const cleanedText = extractJsonPayload(typeof content === "string" ? content : "");
  if (!cleanedText) {
    throw new Error("Groq returned an empty response.");
  }

  const parsed = JSON.parse(cleanedText) as { leads?: unknown };
  if (!Array.isArray(parsed.leads)) {
    throw new Error("Groq returned invalid JSON format.");
  }

  return parsed.leads;
}

async function generateLeadBatch(campaign: CampaignContext, leads: Lead[]) {
  if (getAiProvider() === "groq") {
    return generateLeadBatchWithGroq(campaign, leads);
  }
  return null;
}

function getAiErrorStatus(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("authentication failed")) {
    return 401;
  }
  if (message.includes("rate limit exceeded")) {
    return 429;
  }
  return 500;
}

async function processLeadBatch(campaign: CampaignContext, leads: Lead[]): Promise<EnrichedLead[]> {
  const generated = await generateLeadBatch(campaign, leads);
  if (!generated) {
    return buildFallbackLeads(campaign, leads, "fallback draft used because Groq API key is not configured");
  }

  return generated.map((item, index) => normalizeLead(item, index, campaign, leads[index])).map((lead, index) => {
    if (lead.subject && lead.message) {
      return lead;
    }
    const fallback = buildFallbackDraft(campaign, leads[index]);
    return {
      ...lead,
      subject: fallback.subject,
      message: fallback.message,
      sendable: isValidEmail(lead.email),
      needs_review: true,
      skip_reason: isValidEmail(lead.email) ? "" : "Email missing or invalid",
      debug_info: "fallback draft filled missing content",
    };
  });
}

async function sendViaEmailJs(service: NormalizedService, secrets: DecryptedSecrets, payload: { to: string; subject: string; html: string; fromName: string; fromEmail: string; companyName?: string; }) {
  const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      service_id: secrets.serviceId,
      template_id: secrets.templateId,
      user_id: secrets.publicKey,
      ...(trimOptionalString(secrets.privateKey) ? { accessToken: secrets.privateKey } : {}),
      template_params: {
        to_email: payload.to,
        lead_email: payload.to,
        company_name: payload.companyName || payload.to,
        subject: payload.subject,
        message: payload.html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, ""),
        message_html: payload.html.replace(/\n/g, "<br>"),
        from_name: payload.fromName,
        from_email: payload.fromEmail,
        reply_to: payload.fromEmail,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`EmailJS ${response.status}: ${await response.text()}`);
  }
}

async function sendViaBrevo(service: NormalizedService, secrets: DecryptedSecrets, payload: { to: string; subject: string; html: string; fromName: string; fromEmail: string; }) {
  if (!trimOptionalString(service.senderEmail)) {
    throw new Error("Brevo requires a verified sender email saved in Settings.");
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "api-key": secrets.apiKey || "",
    },
    body: JSON.stringify({
      sender: {
        name: payload.fromName,
        email: trimOptionalString(service.senderEmail),
      },
      to: [{ email: payload.to }],
      subject: payload.subject,
      htmlContent: payload.html.replace(/\n/g, "<br>"),
    }),
  });

  if (!response.ok) {
    throw new Error(`Brevo ${response.status}: ${await response.text()}`);
  }
}

async function sendViaSendGrid(service: NormalizedService, secrets: DecryptedSecrets, payload: { to: string; subject: string; html: string; fromName: string; fromEmail: string; }) {
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${secrets.apiKey || ""}`,
    },
    body: JSON.stringify({
      personalizations: [{
        to: [{ email: payload.to }],
        subject: payload.subject,
      }],
      from: {
        email: payload.fromEmail,
        name: payload.fromName,
      },
      content: [{
        type: "text/html",
        value: payload.html.replace(/\n/g, "<br>"),
      }],
    }),
  });

  if (!response.ok) {
    throw new Error(`SendGrid ${response.status}: ${await response.text()}`);
  }
}

function buildMailboxAddress(name: string, email: string) {
  const cleanEmail = trimOptionalString(email);
  const cleanName = trimOptionalString(name).replace(/["<>\\\r\n]/g, "").trim();
  return cleanName ? `${cleanName} <${cleanEmail}>` : cleanEmail;
}

async function sendViaResend(service: NormalizedService, secrets: DecryptedSecrets, payload: { to: string; subject: string; html: string; fromName: string; fromEmail: string; }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${secrets.apiKey || ""}`,
    },
    body: JSON.stringify({
      from: buildMailboxAddress(payload.fromName, payload.fromEmail),
      to: [payload.to],
      subject: payload.subject,
      html: payload.html.replace(/\n/g, "<br>"),
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend ${response.status}: ${await response.text()}`);
  }
}

async function sendViaSmtp(service: NormalizedService, secrets: DecryptedSecrets, payload: { to: string; subject: string; html: string; fromName: string; fromEmail: string; }) {
  const transporter = nodemailer.createTransport({
    host: service.smtpHost,
    port: parseInt(service.smtpPort || "587", 10) || 587,
    secure: (parseInt(service.smtpPort || "587", 10) || 587) === 465,
    auth: {
      user: service.smtpUser,
      pass: secrets.smtpPassword,
    },
  });

  await transporter.sendMail({
    from: `"${payload.fromName}" <${payload.fromEmail}>`,
    to: payload.to,
    subject: payload.subject,
    text: payload.html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, ""),
    html: payload.html.replace(/\n/g, "<br>"),
  });
}

function classifySendError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/API access from non-browser environments is currently disabled/i.test(message)) {
    return {
      type: "auth",
      message: "EmailJS server API is disabled. Enable non-browser API access in EmailJS Dashboard > Account > Security.",
    };
  }
  if (/429|limit|quota|too many|rate limit/i.test(message)) {
    return { type: "quota", message };
  }
  if (/401|403|auth|invalid api key|authorization|permission/i.test(message)) {
    return { type: "auth", message };
  }
  if (/timeout|timed out|network|fetch failed/i.test(message)) {
    return { type: "timeout", message };
  }
  return { type: "other", message };
}

async function attemptSendThroughService(service: NormalizedService, payload: { to: string; subject: string; html: string; fromName: string; fromEmail: string; companyName?: string; }) {
  const secrets = decryptSecrets(service.encryptedSecrets);
  if (service.serviceType === "emailjs") {
    return sendViaEmailJs(service, secrets, payload);
  }
  if (service.serviceType === "brevo") {
    return sendViaBrevo(service, secrets, payload);
  }
  if (service.serviceType === "sendgrid") {
    return sendViaSendGrid(service, secrets, payload);
  }
  if (service.serviceType === "resend") {
    return sendViaResend(service, secrets, payload);
  }
  return sendViaSmtp(service, secrets, payload);
}

async function incrementServiceUsage(userId: string, service: NormalizedService) {
  const usage = buildUsageSnapshot(service);
  const ref = db.doc(`users/${userId}/emailServices/${service.id}`);
  const update: Partial<StoredEmailService> = {
    lastSuccessAt: new Date().toISOString(),
    lastFailureReason: "",
  };
  if (usage.period === "day") {
    update.dailyKey = service.dailyKey;
    update.dailyCount = service.dailyCount + 1;
  } else {
    update.monthlyKey = service.monthlyKey;
    update.monthlyCount = service.monthlyCount + 1;
  }
  await ref.set(update, { merge: true });
}

async function markServiceFailure(userId: string, service: NormalizedService, reason: string) {
  await db.doc(`users/${userId}/emailServices/${service.id}`).set({
    lastFailureAt: new Date().toISOString(),
    lastFailureReason: reason.slice(0, 500),
  }, { merge: true });
}

async function refundGenerationForFailedSend(userId: string, leadId: string, email?: string) {
  const normalizedLeadId = trimOptionalString(leadId);
  if (!normalizedLeadId) {
    return null;
  }

  const refundRef = db.doc(`users/${userId}/failedSendRefunds/${normalizedLeadId}`);
  const refundSnap = await refundRef.get();
  if (refundSnap.exists) {
    return ensureUserProfile(userId, email);
  }

  const profile = await ensureUserProfile(userId, email);
  const nextUsed = Math.max(0, profile.usedGenerationsThisPeriod - 1);
  const nextProfile: UserProfile = {
    ...profile,
    usedGenerationsThisPeriod: nextUsed,
    remainingGenerations: Math.min(profile.monthlyGenerationLimit, profile.remainingGenerations + 1),
  };

  await Promise.all([
    saveUserProfile(userId, nextProfile),
    refundRef.set({
      leadId: normalizedLeadId,
      refundedAt: new Date().toISOString(),
    }),
  ]);

  return nextProfile;
}

async function findUserIdByCustomerId(customerId: string) {
  const snap = await db.collectionGroup("profile")
    .where("stripeCustomerId", "==", customerId)
    .limit(1)
    .get();
  if (snap.empty) {
    return "";
  }
  return snap.docs[0].ref.parent.parent?.id || "";
}

async function applyPlanToUser(userId: string, planId: PlanId, subscriptionStatus: SubscriptionStatus, extras?: { customerId?: string; subscriptionId?: string; sessionId?: string; }) {
  const now = getNow();
  const { start, end } = getMonthBounds(now);
  const profile: UserProfile = {
    planId,
    subscriptionStatus,
    monthlyGenerationLimit: getPlanLimit(planId),
    usedGenerationsThisPeriod: 0,
    remainingGenerations: getPlanLimit(planId),
    currentPeriodStart: start.toISOString(),
    currentPeriodEnd: end.toISOString(),
    stripeCustomerId: extras?.customerId,
    stripeSubscriptionId: extras?.subscriptionId,
    lastCheckoutSessionId: extras?.sessionId,
  };
  await saveUserProfile(userId, profile);
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.post("/api/billing/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const stripe = getStripeClient();
    const webhookSecret = getStripeWebhookSecret();
    if (!stripe || !webhookSecret) {
      return res.status(503).json({ error: "Stripe webhook is not configured." });
    }

    const signature = req.headers["stripe-signature"];
    if (!signature || Array.isArray(signature)) {
      return res.status(400).json({ error: "Missing Stripe signature." });
    }

    try {
      const event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);

      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = trimOptionalString(session.metadata?.firebase_uid);
        const planId = trimOptionalString(session.metadata?.plan_id) as PlanId;
        if (userId && (planId === "starter" || planId === "pro")) {
          await applyPlanToUser(userId, planId, "active", {
            customerId: typeof session.customer === "string" ? session.customer : session.customer?.id,
            subscriptionId: typeof session.subscription === "string" ? session.subscription : session.subscription?.id,
            sessionId: session.id,
          });
        }
      }

      if (event.type === "invoice.payment_failed") {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : "";
        if (customerId) {
          const userId = await findUserIdByCustomerId(customerId);
          if (userId) {
            await applyPlanToUser(userId, "free", "past_due", {
              customerId,
            });
          }
        }
      }

      if (event.type === "customer.subscription.deleted") {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = typeof subscription.customer === "string" ? subscription.customer : "";
        if (customerId) {
          const userId = await findUserIdByCustomerId(customerId);
          if (userId) {
            await applyPlanToUser(userId, "free", "canceled", {
              customerId,
            });
          }
        }
      }

      if (event.type === "invoice.paid") {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : "";
        if (customerId) {
          const userId = await findUserIdByCustomerId(customerId);
          const planId = trimOptionalString(invoice.parent && typeof invoice.parent === "object" ? (invoice.parent as { subscription_details?: { metadata?: Record<string, string> } }).subscription_details?.metadata?.plan_id : "") as PlanId;
          if (userId && (planId === "starter" || planId === "pro")) {
            await applyPlanToUser(userId, planId, "active", { customerId });
          }
        }
      }

      return res.json({ received: true });
    } catch (error) {
      console.error("Failed to verify Stripe webhook:", error);
      return res.status(400).json({ error: "Invalid Stripe webhook signature." });
    }
  });

  app.use(express.json({ limit: "2mb" }));

  app.get("/api/billing/config", async (_req, res) => {
    return res.json(getStripeBillingConfig());
  });

  app.post("/api/billing/checkout-session", async (req, res) => {
    const stripe = getStripeClient();
    const { idToken, planId } = req.body as { idToken?: string; planId?: PaidPlanId };

    if (!stripe || !getStripeBillingConfig().checkoutEnabled) {
      return res.status(503).json({ error: "Stripe checkout is not configured yet." });
    }

    if (!idToken) {
      return res.status(401).json({ error: "Missing authentication token" });
    }

    if (!planId || !(planId in PLAN_PRICE_ENV)) {
      return res.status(400).json({ error: "A valid paid plan is required." });
    }

    try {
      const decoded = await auth.verifyIdToken(idToken);
      const priceId = getStripePriceId(planId);
      if (!priceId) {
        return res.status(400).json({ error: `Missing Stripe price for ${planId}.` });
      }

      const email = trimOptionalString(decoded.email);
      const profile = await ensureUserProfile(decoded.uid, decoded.email);

      let customerId = profile.stripeCustomerId || "";
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: email || undefined,
          metadata: {
            firebase_uid: decoded.uid,
          },
        });
        customerId = customer.id;
      }

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${getBaseAppUrl()}/?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${getBaseAppUrl()}/?billing=cancelled`,
        metadata: {
          firebase_uid: decoded.uid,
          plan_id: planId,
        },
        subscription_data: {
          metadata: {
            firebase_uid: decoded.uid,
            plan_id: planId,
          },
        },
        client_reference_id: decoded.uid,
        allow_promotion_codes: true,
      });

      if (!session.url) {
        return res.status(500).json({ error: "Stripe checkout session did not return a URL." });
      }

      await saveUserProfile(decoded.uid, {
        ...profile,
        stripeCustomerId: customerId,
      });

      return res.json({ url: session.url });
    } catch (error) {
      console.error("Failed to create Stripe checkout session:", error);
      return res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/api/billing/portal-session", async (req, res) => {
    const stripe = getStripeClient();
    const { idToken, customerId } = req.body as { idToken?: string; customerId?: string };

    if (!stripe) {
      return res.status(503).json({ error: "Stripe billing portal is not configured yet." });
    }

    if (!idToken) {
      return res.status(401).json({ error: "Missing authentication token" });
    }

    try {
      const decoded = await auth.verifyIdToken(idToken);
      const profile = await ensureUserProfile(decoded.uid, decoded.email);
      const resolvedCustomerId = trimOptionalString(customerId) || profile.stripeCustomerId || "";
      if (!resolvedCustomerId) {
        return res.status(400).json({ error: "No Stripe customer is linked to this user yet." });
      }

      const session = await stripe.billingPortal.sessions.create({
        customer: resolvedCustomerId,
        return_url: `${getBaseAppUrl()}/`,
      });

      return res.json({ url: session.url });
    } catch (error) {
      console.error("Failed to create Stripe billing portal session:", error);
      return res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get("/api/user-profile", async (req, res) => {
    try {
      const decoded = await resolveAuthFromRequest(req);
      const profile = await ensureUserProfile(decoded.uid, decoded.email);
      return res.json({ profile });
    } catch (error) {
      return res.status(401).json({ error: (error as Error).message });
    }
  });

  app.get("/api/email-services", async (req, res) => {
    try {
      const decoded = await resolveAuthFromRequest(req);
      const services = await listUserServices(decoded.uid);
      return res.json({ services: services.map(summarizeService) });
    } catch (error) {
      return res.status(401).json({ error: (error as Error).message });
    }
  });

  app.post("/api/email-services", async (req, res) => {
    try {
      const decoded = await resolveAuthFromRequest(req);
      const input = sanitizeConnectionInput(req.body as EmailServiceConnectionInput);
      const now = new Date().toISOString();
      const ref = db.collection(`users/${decoded.uid}/emailServices`).doc();
      await ref.set({
        serviceType: input.serviceType,
        displayName: input.displayName,
        senderName: input.senderName,
        senderEmail: input.senderEmail,
        smtpProvider: input.smtpProvider,
        smtpHost: input.smtpHost,
        smtpPort: input.smtpPort,
        smtpUser: input.smtpUser,
        encryptedSecrets: encryptSecrets(input.secrets),
        isActive: input.isActive,
        priority: input.priority,
        createdAt: now,
        updatedAt: now,
        dailyCount: 0,
        dailyKey: getDayKey(),
        monthlyCount: 0,
        monthlyKey: getMonthKey(),
      } satisfies StoredEmailService);
      const snap = await ref.get();
      return res.json({ service: summarizeService(normalizeServiceUsage(ref.id, snap.data() as StoredEmailService)) });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  app.patch("/api/email-services/:serviceId", async (req, res) => {
    try {
      const decoded = await resolveAuthFromRequest(req);
      const ref = db.doc(`users/${decoded.uid}/emailServices/${req.params.serviceId}`);
      const snap = await ref.get();
      if (!snap.exists) {
        return res.status(404).json({ error: "Service not found." });
      }

      const existing = snap.data() as StoredEmailService;
      const input = sanitizeConnectionInput(req.body as Partial<EmailServiceConnectionInput>, existing);
      const existingSecrets = existing.encryptedSecrets ? decryptSecrets(existing.encryptedSecrets) : null;
      const mergedSecrets = mergeSecrets(existingSecrets, input.secrets);
      await ref.set({
        serviceType: input.serviceType,
        displayName: input.displayName,
        senderName: input.senderName,
        senderEmail: input.senderEmail,
        smtpProvider: input.smtpProvider,
        smtpHost: input.smtpHost,
        smtpPort: input.smtpPort,
        smtpUser: input.smtpUser,
        encryptedSecrets: encryptSecrets(mergedSecrets),
        isActive: input.isActive,
        priority: input.priority,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      const nextSnap = await ref.get();
      return res.json({ service: summarizeService(normalizeServiceUsage(ref.id, nextSnap.data() as StoredEmailService)) });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  app.delete("/api/email-services/:serviceId", async (req, res) => {
    try {
      const decoded = await resolveAuthFromRequest(req);
      await db.doc(`users/${decoded.uid}/emailServices/${req.params.serviceId}`).delete();
      return res.json({ success: true });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/api/process-leads", async (req, res) => {
    try {
      const decoded = await resolveAuthFromRequest(req);
      const profile = await ensureUserProfile(decoded.uid, decoded.email);
      const { campaign, leads } = req.body as { campaign?: CampaignContext; leads?: Lead[] };

      if (!campaign || !Array.isArray(leads) || leads.length === 0) {
        return res.status(400).json({ error: "Campaign context and at least one lead are required." });
      }

      const generationCost = leads.length;
      if (profile.remainingGenerations < generationCost) {
        return res.status(403).json({
          error: "No AI generations left for this billing period. Upgrade to continue.",
        });
      }

      const enrichedLeads = await processLeadBatch(campaign, leads);
      const nextProfile: UserProfile = {
        ...profile,
        usedGenerationsThisPeriod: profile.usedGenerationsThisPeriod + generationCost,
        remainingGenerations: Math.max(0, profile.remainingGenerations - generationCost),
      };
      await saveUserProfile(decoded.uid, nextProfile);

      const warnings = enrichedLeads
        .filter((lead) => !lead.sendable || !lead.subject.trim() || !lead.message.trim())
        .map((lead) => `${lead.lead_id}: ${lead.debug_info || lead.skip_reason || "draft unavailable"}`);

      return res.json({ leads: enrichedLeads, warnings, profile: nextProfile });
    } catch (error) {
      console.error("Failed to process leads:", error);
      return res.status(getAiErrorStatus(error)).json({ error: (error as Error).message });
    }
  });

  app.post("/api/send-email", async (req, res) => {
    try {
      const decoded = await resolveAuthFromRequest(req);
      const { leadId, to, subject, html, from_name, from_email, preferredServiceId } = req.body as {
        leadId?: string;
        to?: string;
        subject?: string;
        html?: string;
        from_name?: string;
        from_email?: string;
        preferredServiceId?: string;
      };

      if (!isValidEmail(to)) {
        return res.status(400).json({ error: "Recipient email address is invalid." });
      }
      if (!trimOptionalString(subject) || !trimOptionalString(html)) {
        return res.status(400).json({ error: "Recipient, subject, and message are required." });
      }

      const services = await listUserServices(decoded.uid);
      if (services.length === 0 || !services.some((service) => service.isActive)) {
        return res.status(400).json({
          error: "Connect at least one email service before sending.",
          allServicesExhausted: false,
        });
      }

      const preferredId = trimOptionalString(preferredServiceId);
      const orderedServices = preferredId
        ? [...services].sort((a, b) => {
            if (a.id === preferredId) {
              return -1;
            }
            if (b.id === preferredId) {
              return 1;
            }
            return a.priority - b.priority;
          })
        : [...services];

      const statuses: Array<{ id: string; label: string; serviceType: EmailServiceType; health: "ready" | "inactive" | "error" | "exhausted"; reason?: string; remaining: number | null; resetAt: string; }> = [];
      let firstPreferred: NormalizedService | null = null;

      for (const service of orderedServices) {
        const usage = buildUsageSnapshot(service);
        const label = getServiceLabel(service);
        const exhausted = usage.remaining !== null && usage.remaining <= 0;
        if (!firstPreferred && service.isActive) {
          firstPreferred = service;
        }

        if (!service.isActive) {
          statuses.push({ id: service.id, label, serviceType: service.serviceType, health: "inactive", reason: "Service disabled in settings.", remaining: usage.remaining, resetAt: usage.resetAt });
          continue;
        }

        if (exhausted) {
          statuses.push({ id: service.id, label, serviceType: service.serviceType, health: "exhausted", reason: usage.period === "month" ? "Monthly limit reached." : "Daily limit reached.", remaining: usage.remaining, resetAt: usage.resetAt });
          continue;
        }

        const fromEmail = service.serviceType === "brevo" || service.serviceType === "resend"
          ? trimOptionalString(service.senderEmail)
          : trimOptionalString(service.senderEmail) || trimOptionalString(from_email) || trimOptionalString(service.smtpUser) || "";
        const fromName = trimOptionalString(service.senderName) || trimOptionalString(from_name) || (fromEmail ? fromEmail.split("@")[0] : "Automail User");

        if (!isValidEmail(fromEmail)) {
          const senderMessage = service.serviceType === "brevo"
            ? "Brevo needs a verified sender email saved in Settings."
            : service.serviceType === "resend"
              ? "Resend needs a verified sender email saved in Settings."
            : "Missing or invalid sender email.";
          await markServiceFailure(decoded.uid, service, senderMessage);
          statuses.push({ id: service.id, label, serviceType: service.serviceType, health: "error", reason: senderMessage, remaining: usage.remaining, resetAt: usage.resetAt });
          continue;
        }

        try {
          await attemptSendThroughService(service, {
            to,
            subject: trimOptionalString(subject),
            html: trimOptionalString(html),
            fromName,
            fromEmail,
          });
          await incrementServiceUsage(decoded.uid, service);
          const nextProfile = await ensureUserProfile(decoded.uid, decoded.email);
          return res.json({
            success: true,
            providerUsed: service.serviceType,
            providerLabel: label,
            rotatedFrom: firstPreferred && firstPreferred.id !== service.id ? firstPreferred.serviceType : undefined,
            rotatedFromLabel: firstPreferred && firstPreferred.id !== service.id ? getServiceLabel(firstPreferred) : undefined,
            remainingForProvider: Math.max(0, usage.remaining - 1),
            resetAt: usage.resetAt,
            serviceStatuses: [
              ...statuses,
              { id: service.id, label, serviceType: service.serviceType, health: "ready", remaining: Math.max(0, usage.remaining - 1), resetAt: usage.resetAt },
            ],
            allServicesExhausted: false,
            friendlyMessage: firstPreferred && firstPreferred.id !== service.id
              ? `Switched from ${getServiceLabel(firstPreferred)} to ${label} automatically because ${statuses[statuses.length - 1]?.reason || "the first service failed"}.`
              : `Sent with ${label}.`,
            profile: nextProfile,
          });
        } catch (error) {
          const classified = classifySendError(error);
          await markServiceFailure(decoded.uid, service, classified.message);
          statuses.push({
            id: service.id,
            label,
            serviceType: service.serviceType,
            health: classified.type === "quota" ? "exhausted" : "error",
            reason: classified.type === "quota"
              ? usage.period === "month" ? "Monthly limit reached." : "Daily limit reached."
              : classified.type === "auth"
                ? classified.message.slice(0, 200)
                : classified.type === "timeout"
                  ? "Connection timeout."
                  : classified.message.slice(0, 200),
            remaining: classified.type === "quota" ? 0 : usage.remaining,
            resetAt: usage.resetAt,
          });
        }
      }

      const refundedProfile = await refundGenerationForFailedSend(decoded.uid, trimOptionalString(leadId), decoded.email);
      const exhaustedReasons = statuses
        .map((status) => `${status.label}: ${status.reason || status.health}`)
        .join(" | ");

      return res.status(429).json({
        success: false,
        error: exhaustedReasons || "All connected email services are unavailable, exhausted, or misconfigured.",
        serviceStatuses: statuses,
        allServicesExhausted: true,
        friendlyMessage: exhaustedReasons || "All connected email services are unavailable, exhausted, or misconfigured. Wait for reset or connect more services.",
        profile: refundedProfile || undefined,
      });
    } catch (error) {
      console.error("Failed to send email:", error);
      return res.status(500).json({ error: (error as Error).message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

void startServer();
