import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import nodemailer from "nodemailer";
import { initializeApp, getApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import dotenv from "dotenv";
import firebaseConfig from "./firebase-applet-config.json";
import type { CampaignContext, EnrichedLead, Lead, SmtpSettings } from "./src/types";

dotenv.config();

const firebaseApp = getApps().length === 0
  ? initializeApp({ projectId: firebaseConfig.projectId })
  : getApp();

const auth = getAuth(firebaseApp);

function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }

  return new GoogleGenAI({ apiKey });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientGeminiError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /503|UNAVAILABLE|high demand|overloaded|try again later/i.test(message);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

async function generateWithModelFallback(
  ai: GoogleGenAI,
  params: {
    contents: string;
    candidateModels: string[];
    config?: Record<string, unknown>;
    primaryAttempts?: number;
    fallbackAttempts?: number;
  },
) {
  const {
    contents,
    candidateModels,
    config,
    primaryAttempts = 3,
    fallbackAttempts = 2,
  } = params;

  let text = "";
  let lastError: unknown;

  for (const [modelIndex, model] of candidateModels.entries()) {
    const maxAttempts = modelIndex === 0 ? primaryAttempts : fallbackAttempts;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents,
          config,
        });

        text = response.text || "";
        if (text.trim()) {
          return text;
        }

        throw new Error(`Gemini returned empty response for model ${model}.`);
      } catch (error) {
        lastError = error;

        if (!isTransientGeminiError(error)) {
          throw error;
        }

        if (attempt < maxAttempts) {
          await sleep(600 * attempt);
        }
      }
    }
  }

  throw new Error(
    isTransientGeminiError(lastError)
      ? "Gemini busy right now. Auto-retried and fallback used, but all attempts failed. Try again in a minute."
      : (lastError instanceof Error ? lastError.message : "Failed to process leads.")
  );
}

function buildFallbackDraft(campaign: CampaignContext, lead: Lead) {
  const company = lead.company_name?.trim() || lead.business_category?.trim() || "your business";
  const intro = lead.notes?.trim()
    ? `I noticed ${lead.notes.trim().replace(/\.$/, "")}.`
    : campaign.sender_context.trim() || `I came across ${company} and thought there might be a fit.`;
  const sender = campaign.sender_name?.trim() || "A teammate";
  const offer = campaign.offer.trim();
  const cta = campaign.cta.trim();

  return {
    subject: `${company}: quick idea for growth`,
    message: [
      `Hi ${company} team,`,
      "",
      intro,
      `At ${campaign.sender_company || "our company"}, we help businesses like yours with ${offer}.`,
      cta,
      "",
      `If this is not relevant, reply and I'll stop reaching out.`,
      "",
      `Best,`,
      sender,
    ].join("\n"),
  };
}

function buildDraftPrompt(campaign: CampaignContext, lead: Lead) {
  return `
You write cold outreach emails for a real sales workflow.

Write one email draft for this lead using the campaign strategy below.
Output JSON only with keys: subject, message.

Campaign strategy:
- Goal: ${campaign.campaign_goal}
- Offer: ${campaign.offer}
- Sender: ${campaign.sender_name} at ${campaign.sender_company}
- Sender context: ${campaign.sender_context}
- CTA: ${campaign.cta}
- Tone: ${campaign.tone_preference || "Professional"}

Lead:
${JSON.stringify(lead, null, 2)}

Requirements:
1. Subject must be specific and natural, 4-9 words.
2. Message must be 70-140 words.
3. Sound human, credible, and low-pressure.
4. Use lead context when available. Mention business or notes naturally.
5. Keep exactly one clear CTA, aligned with campaign CTA.
6. Include a short opt-out line.
7. No placeholders, no brackets, no fake claims.
8. Forbidden phrases: "I hope this email finds you well", "touching base", "just checking in", "circle back".
9. Return valid JSON only.
`;
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
    : (typeof item.email_subject === "string" ? item.email_subject.trim() : "");
  const message = typeof item.message === "string"
    ? item.message.trim()
    : (typeof item.email_body === "string"
      ? item.email_body.trim()
      : (typeof item.body === "string" ? item.body.trim() : ""));
  const hasValidEmail = isValidEmail(email);
  const requestedSendable = typeof item.sendable === "boolean" ? item.sendable : hasValidEmail;
  const sendable = requestedSendable && hasValidEmail && Boolean(subject) && Boolean(message);
  const debugInfo = [
    !email ? "missing email" : "",
    !subject ? "missing subject" : "",
    !message ? "missing message" : "",
    !requestedSendable ? "model marked unsendable" : "",
  ].filter(Boolean).join(", ");

  return {
    lead_id: typeof item.lead_id === "string" && item.lead_id.trim() ? item.lead_id : `lead-${index + 1}`,
    email,
    phone_number: typeof item.phone_number === "string" && item.phone_number.trim() ? item.phone_number.trim() : "Not provided",
    company_name: companyName || undefined,
    business_category: typeof item.business_category === "string" && item.business_category.trim() ? item.business_category.trim() : "General business",
    category_confidence: Number.isFinite(confidenceValue)
      ? Math.min(1, Math.max(0, confidenceValue))
      : 0,
    sendable,
    needs_review: sendable ? Boolean(item.needs_review) : true,
    skip_reason: sendable ? skipReason : skipReason || "Email missing or invalid",
    subject,
    message,
    debug_info: debugInfo || undefined,
  };
}

function finalizeEnrichedLeads(campaign: CampaignContext, leads: EnrichedLead[], sourceLeads: Lead[]): EnrichedLead[] {
  const sourceLeadMap = new Map(sourceLeads.map((lead, index) => [lead.lead_id || `lead-${index + 1}`, lead]));

  return leads.map((lead, index) => {
    const email = lead.email?.trim() || "";
    const hasValidEmail = isValidEmail(email);
    const hasDraft = Boolean(lead.subject.trim()) && Boolean(lead.message.trim());

    if (!hasValidEmail) {
      return {
        ...lead,
        email,
        sendable: false,
        needs_review: true,
        skip_reason: lead.skip_reason || "Email missing or invalid",
        subject: "",
        message: "",
      };
    }

    if (hasDraft) {
      return {
        ...lead,
        email,
        sendable: true,
        skip_reason: lead.skip_reason,
      };
    }

    const sourceLead = sourceLeadMap.get(lead.lead_id) || sourceLeads[index] || {
      lead_id: lead.lead_id,
      email,
      phone_number: lead.phone_number,
      company_name: lead.company_name,
      business_category: lead.business_category,
    };
    const fallbackDraft = buildFallbackDraft(campaign, sourceLead);

    return {
      ...lead,
      email,
      sendable: true,
      needs_review: true,
      skip_reason: "",
      subject: fallbackDraft.subject,
      message: fallbackDraft.message,
      debug_info: lead.debug_info || "fallback draft injected during final response sanitization",
    };
  });
}

function buildFallbackEnrichedLeads(
  campaign: CampaignContext,
  leads: Lead[],
  reason: string,
): EnrichedLead[] {
  return leads.map((lead, index) => {
    const fallbackDraft = buildFallbackDraft(campaign, lead);
    const email = typeof lead.email === "string" ? lead.email.trim() : "";
    const sendable = isValidEmail(email);

    return {
      lead_id: lead.lead_id?.trim() || `lead-${index + 1}`,
      email,
      phone_number: lead.phone_number?.trim() || "Not provided",
      company_name: lead.company_name?.trim() || undefined,
      business_category: lead.business_category?.trim() || "General business",
      category_confidence: lead.business_category?.trim() ? 0.85 : 0.25,
      sendable,
      needs_review: true,
      skip_reason: sendable ? "" : "Email missing or invalid",
      subject: sendable ? fallbackDraft.subject : "",
      message: sendable ? fallbackDraft.message : "",
      debug_info: reason,
    };
  });
}

function normalizeLeadBatch(raw: unknown, campaign: CampaignContext, sourceLeads: Lead[]): EnrichedLead[] {
  const data = Array.isArray(raw)
    ? raw
    : (raw && typeof raw === "object" && Array.isArray((raw as { leads?: unknown[] }).leads))
      ? (raw as { leads: unknown[] }).leads
      : [];

  const sourceLeadMap = new Map(sourceLeads.map((lead, index) => [lead.lead_id || `lead-${index + 1}`, lead]));

  return data.map((item, index) => {
    const leadId = (item && typeof item === "object" && typeof (item as { lead_id?: unknown }).lead_id === "string")
      ? ((item as { lead_id: string }).lead_id)
      : `lead-${index + 1}`;
    return normalizeLead(item, index, campaign, sourceLeadMap.get(leadId) || sourceLeads[index]);
  });
}

async function ensureLeadDrafts(
  ai: GoogleGenAI,
  campaign: CampaignContext,
  enrichedLeads: EnrichedLead[],
  sourceLeads: Lead[],
): Promise<EnrichedLead[]> {
  const sourceLeadMap = new Map(sourceLeads.map((lead, index) => [lead.lead_id || `lead-${index + 1}`, lead]));
  const draftModels = [
    process.env.GEMINI_DRAFT_MODEL?.trim(),
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-1.5-flash-latest",
  ].filter((model, index, models): model is string => Boolean(model) && models.indexOf(model) === index);

  const results: EnrichedLead[] = [];

  for (const lead of enrichedLeads) {
    if (!lead.email) {
      results.push(lead);
      continue;
    }

    if (lead.subject.trim() && lead.message.trim()) {
      results.push(lead);
      continue;
    }

    const sourceLead = sourceLeadMap.get(lead.lead_id) || {
      lead_id: lead.lead_id,
      email: lead.email,
      phone_number: lead.phone_number,
      company_name: lead.company_name,
      business_category: lead.business_category,
    };

    try {
      const text = await generateWithModelFallback(ai, {
        contents: buildDraftPrompt(campaign, sourceLead),
        candidateModels: draftModels,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            required: ["subject", "message"],
            properties: {
              subject: { type: Type.STRING },
              message: { type: Type.STRING },
            },
          },
        },
        primaryAttempts: 2,
        fallbackAttempts: 1,
      });

      const parsed = JSON.parse(text) as { subject?: string; message?: string };
      const subject = typeof parsed.subject === "string" ? parsed.subject.trim() : "";
      const message = typeof parsed.message === "string" ? parsed.message.trim() : "";

      if (subject && message) {
        results.push({
          ...lead,
          company_name: lead.company_name || sourceLead.company_name,
          subject,
          message,
          sendable: Boolean(lead.email),
          debug_info: "draft regenerated by AI second pass",
        });
        continue;
      }
    } catch (error) {
      console.error(`Failed to regenerate draft for ${lead.lead_id}:`, error);
    }

    const fallbackDraft = buildFallbackDraft(campaign, sourceLead);
    results.push({
      ...lead,
      company_name: lead.company_name || sourceLead.company_name,
      subject: lead.subject.trim() || fallbackDraft.subject,
      message: lead.message.trim() || fallbackDraft.message,
      sendable: Boolean(lead.email),
      needs_review: true,
      debug_info: "fallback draft used because AI draft was empty or invalid",
    });
  }

  return results;
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
    8. Forbidden phrases: "I hope this email finds you well", "I just wanted to reach out", "touching base", etc.
    9. Set needs_review=true if:
       - category_confidence < 0.7
       - contextual information (notes/website) is sparse or ambiguous
       - the drafted message feels generic due to lack of specific lead data
    10. Final output must be JSON only.
    11. Every sendable lead must include a non-empty subject and message.

    Leads to process:
    ${JSON.stringify(leads, null, 2)}
  `;
}

async function processLeadBatch(campaign: CampaignContext, leads: Lead[]): Promise<EnrichedLead[]> {
  const ai = getAiClient();
  const contents = buildLeadPrompt(campaign, leads) + "\n\nIMPORTANT: Return ONLY a valid JSON array. No markdown, no preamble.";
  const candidateModels = [
    process.env.GEMINI_MODEL?.trim(),
    "gemini-2.5-flash",
    "gemini-1.5-flash-latest",
  ].filter((model, index, models): model is string => Boolean(model) && models.indexOf(model) === index);

  const text = await generateWithModelFallback(ai, {
    contents,
    candidateModels,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          required: [
            "lead_id",
            "email",
            "phone_number",
            "business_category",
            "category_confidence",
            "sendable",
            "needs_review",
            "skip_reason",
            "subject",
            "message",
          ],
          properties: {
            lead_id: { type: Type.STRING },
            email: { type: Type.STRING },
            phone_number: { type: Type.STRING },
            business_category: { type: Type.STRING },
            category_confidence: { type: Type.NUMBER },
            sendable: { type: Type.BOOLEAN },
            needs_review: { type: Type.BOOLEAN },
            skip_reason: { type: Type.STRING },
            subject: { type: Type.STRING },
            message: { type: Type.STRING },
          },
        },
      },
    },
  });
  
  // Clean up markdown if AI includes it
  const cleanedText = text.replace(/```json/g, "").replace(/```/g, "").trim();

  if (!cleanedText) {
    return buildFallbackEnrichedLeads(campaign, leads, "fallback drafts used because AI returned an empty batch response");
  }

  try {
    const data = JSON.parse(cleanedText);
    const normalized = normalizeLeadBatch(data, campaign, leads);
    const withDrafts = await ensureLeadDrafts(ai, campaign, normalized, leads);
    return finalizeEnrichedLeads(campaign, withDrafts, leads);
  } catch (e) {
    console.error("Failed to parse AI response:", cleanedText);
    return buildFallbackEnrichedLeads(campaign, leads, "fallback drafts used because AI returned invalid batch JSON");
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  app.post("/api/process-leads", async (req, res) => {
    const { campaign, leads } = req.body as { campaign?: CampaignContext; leads?: Lead[] };

    if (!campaign || !Array.isArray(leads)) {
      return res.status(400).json({ error: "Campaign context and lead array are required." });
    }

    if (!isNonEmptyString(campaign.campaign_goal) || !isNonEmptyString(campaign.offer) || !isNonEmptyString(campaign.cta)) {
      return res.status(400).json({ error: "Campaign goal, offer, and CTA are required." });
    }

    if (leads.length === 0) {
      return res.status(400).json({ error: "At least one lead is required." });
    }

    try {
      const enrichedLeads = await processLeadBatch(campaign, leads);
      const warnings = enrichedLeads
        .filter((lead) => !lead.sendable || !lead.subject.trim() || !lead.message.trim())
        .map((lead) => `${lead.lead_id}: ${lead.debug_info || lead.skip_reason || "draft unavailable"}`);
      res.json({ leads: enrichedLeads, warnings });
    } catch (error) {
      console.error("Failed to process leads:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/api/send-email", async (req, res) => {
    const { to, subject, html, from_name, from_email, idToken, smtpSettings } = req.body as {
      to?: string;
      subject?: string;
      html?: string;
      from_name?: string;
      from_email?: string;
      idToken?: string;
      smtpSettings?: Partial<SmtpSettings> | null;
    };

    const allowGuestEmailSend = process.env.ALLOW_GUEST_EMAIL_SEND === "true";

    if (idToken === "guest-token") {
      if (!allowGuestEmailSend) {
        return res.status(403).json({
          error: "Guest mode can preview drafts only. Sign in to use SMTP sending.",
        });
      }
    } else if (!idToken) {
      return res.status(401).json({ error: "Missing authentication token" });
    }

    if (!to || !subject || !html) {
      return res.status(400).json({ error: "Recipient, subject, and message are required." });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return res.status(400).json({ error: "Recipient email address is invalid." });
    }

    try {
      if (idToken !== "guest-token") {
        await auth.verifyIdToken(idToken);
      }

      const smtpHost = smtpSettings?.smtpHost || process.env.SMTP_HOST;
      const rawPort = smtpSettings?.smtpPort || process.env.SMTP_PORT || "587";
      const smtpPort = parseInt(rawPort, 10) || 587;
      const smtpUser = smtpSettings?.smtpUser || process.env.SMTP_USER;
      const smtpPass = smtpSettings?.smtpPass || process.env.SMTP_PASS;
      
      const finalFromName = smtpSettings?.senderName || from_name || (smtpUser && smtpUser.includes('@') ? smtpUser.split('@')[0] : smtpUser) || "Business Automation";
      const finalFromEmail = smtpSettings?.senderEmail || from_email || smtpUser;

      if (!smtpHost || !smtpUser || !smtpPass) {
        return res.status(400).json({
          error: "SMTP credentials are not configured. Add them in Settings or set server SMTP env vars.",
        });
      }

      if (!finalFromEmail) {
        return res.status(400).json({ error: "A sender email address is required." });
      }

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      await transporter.sendMail({
        from: `"${finalFromName}" <${finalFromEmail}>`,
        to,
        subject,
        text: html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, ""),
        html: html.replace(/\n/g, "<br>"),
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Failed to send email:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
