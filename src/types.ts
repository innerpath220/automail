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
  website?: string;
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

export interface SmtpSettings {
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPass: string;
  senderName?: string;
  senderEmail?: string;
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
