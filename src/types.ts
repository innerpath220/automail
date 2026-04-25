export interface CampaignContext {
  campaign_goal: string;
  offer: string;
  sender_name: string;
  sender_company: string;
  sender_email?: string;
  sender_context: string;
  cta: string;
  tone_preference?: string;
}

export interface Lead {
  lead_id: string;
  email?: string;
  phone_number?: string;
  business_category?: string;
  company_name?: string;
  address?: string;
  website?: string;
  rating?: string;
  reviews_count?: string;
  maps_url?: string;
  review_author?: string;
  review_text?: string;
  notes?: string;
}

export interface EnrichedLead {
  lead_id: string;
  email: string;
  phone_number: string;
  company_name?: string;
  business_category: string;
  category_confidence: number;
  sendable: boolean;
  needs_review: boolean;
  skip_reason: string;
  subject: string;
  message: string;
  debug_info?: string;
}

export type EmailServiceType = 'emailjs' | 'brevo' | 'sendgrid' | 'resend' | 'smtp';
export type SmtpProviderId = 'gmail' | 'outlook' | 'yahoo' | 'custom';
export type ServicePeriodType = 'day' | 'month';
export type ServiceHealth = 'ready' | 'inactive' | 'error' | 'exhausted';
export type PlanId = 'free' | 'starter' | 'pro' | 'owner';
export type SubscriptionStatus = 'inactive' | 'trialing' | 'active' | 'past_due' | 'canceled';

export interface EmailServiceDefinition {
  type: EmailServiceType;
  label: string;
  description: string;
  limit: number;
  period: ServicePeriodType;
}

export interface SmtpProviderDefinition {
  id: SmtpProviderId;
  label: string;
  smtpHost: string;
  smtpPort: string;
  dailyLimit: number;
  helpText: string;
}

export interface EmailServiceUsage {
  used: number;
  limit: number | null;
  remaining: number | null;
  period: ServicePeriodType;
  resetAt: string;
}

export interface EmailServiceConnection {
  id: string;
  serviceType: EmailServiceType;
  displayName: string;
  senderName?: string;
  senderEmail?: string;
  smtpProvider?: SmtpProviderId | null;
  smtpHost?: string;
  smtpPort?: string;
  isActive: boolean;
  hasCredentials: boolean;
  health: ServiceHealth;
  lastFailureReason?: string;
  lastSuccessAt?: string;
  createdAt: string;
  updatedAt: string;
  priority: number;
  usage: EmailServiceUsage;
  secretStatus?: {
    hasEmailJsPrivateKey?: boolean;
  };
  revealedSecrets?: EmailServiceSecretInput;
}

export interface EmailServiceSecretInput {
  publicKey?: string;
  privateKey?: string;
  serviceId?: string;
  templateId?: string;
  apiKey?: string;
  smtpPassword?: string;
}

export interface EmailServiceConnectionInput {
  serviceType: EmailServiceType;
  displayName: string;
  senderName?: string;
  senderEmail?: string;
  smtpProvider?: SmtpProviderId;
  smtpHost?: string;
  smtpPort?: string;
  smtpUser?: string;
  isActive?: boolean;
  priority?: number;
  secrets: EmailServiceSecretInput;
}

export interface UserProfile {
  planId: PlanId;
  subscriptionStatus: SubscriptionStatus;
  monthlyGenerationLimit: number;
  usedGenerationsThisPeriod: number;
  remainingGenerations: number;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  lastCheckoutSessionId?: string;
}

export interface SendHistoryEntry {
  id: string;
  sentAt: string;
  toEmail: string;
  subject: string;
  message: string;
  companyName?: string;
  provider: EmailServiceType;
  providerLabel: string;
  senderEmail?: string;
}

export interface GenerationGateResult {
  allowed: boolean;
  remaining: number;
  upgradeMessage?: string;
}

export interface ProcessLeadsResponse {
  leads: EnrichedLead[];
  warnings: string[];
  profile: UserProfile;
}

export interface SendServiceStatus {
  id: string;
  label: string;
  serviceType: EmailServiceType;
  health: ServiceHealth;
  reason?: string;
  remaining: number | null;
  resetAt: string;
}

export interface SendEmailResponse {
  success: boolean;
  providerUsed?: EmailServiceType;
  providerLabel?: string;
  rotatedFrom?: EmailServiceType;
  rotatedFromLabel?: string;
  remainingForProvider?: number | null;
  resetAt?: string;
  serviceStatuses: SendServiceStatus[];
  allServicesExhausted: boolean;
  friendlyMessage: string;
  profile?: UserProfile;
}

export interface PlanDefinition {
  id: PlanId;
  name: string;
  monthlyPriceUsd: number;
  monthlyGenerationLimit: number;
  description: string;
  cta: string;
  highlight?: string;
}

export interface StripeCheckoutConfig {
  ready: boolean;
  checkoutEnabled: boolean;
  portalEnabled: boolean;
  plans: Partial<Record<Exclude<PlanId, 'free'>, boolean>>;
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
  authInfo: {
    userId: string;
    email: string;
    emailVerified: boolean;
    isAnonymous: boolean;
    providerInfo: { providerId: string; displayName: string; email: string; }[];
  }
}
