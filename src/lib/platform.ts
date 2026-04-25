import {
  EmailServiceDefinition,
  EmailServiceType,
  PlanDefinition,
  PlanId,
  SmtpProviderDefinition,
  SmtpProviderId,
  UserProfile,
} from '../types';

export const EMAIL_SERVICE_DEFINITIONS: EmailServiceDefinition[] = [
  {
    type: 'emailjs',
    label: 'EmailJS',
    description: 'Use your EmailJS service, template, and public key.',
    limit: 200,
    period: 'month',
  },
  {
    type: 'brevo',
    label: 'Brevo',
    description: 'Send through Brevo transactional email with your own API key.',
    limit: 300,
    period: 'day',
  },
  {
    type: 'sendgrid',
    label: 'SendGrid',
    description: 'Send through Twilio SendGrid using your own API key.',
    limit: 100,
    period: 'day',
  },
  {
    type: 'resend',
    label: 'Resend',
    description: 'Send through Resend using your own API key.',
    limit: 100,
    period: 'day',
  },
  {
    type: 'smtp',
    label: 'SMTP',
    description: 'Use Gmail, Outlook, Yahoo, or another authenticated SMTP mailbox.',
    limit: 0,
    period: 'day',
  },
];

export const SMTP_PROVIDER_DEFINITIONS: SmtpProviderDefinition[] = [
  {
    id: 'gmail',
    label: 'Gmail',
    smtpHost: 'smtp.gmail.com',
    smtpPort: '587',
    dailyLimit: 500,
    helpText: 'Use your Gmail address and a Google app password.',
  },
  {
    id: 'outlook',
    label: 'Outlook / Hotmail',
    smtpHost: 'smtp.office365.com',
    smtpPort: '587',
    dailyLimit: 300,
    helpText: 'Use your Outlook address and an Outlook app password.',
  },
  {
    id: 'yahoo',
    label: 'Yahoo',
    smtpHost: 'smtp.mail.yahoo.com',
    smtpPort: '587',
    dailyLimit: 500,
    helpText: 'Use your Yahoo address and a Yahoo app password.',
  },
  {
    id: 'custom',
    label: 'Custom SMTP',
    smtpHost: '',
    smtpPort: '587',
    dailyLimit: 500,
    helpText: 'Use this only if you need another SMTP provider.',
  },
];

export const PLAN_DEFINITIONS: PlanDefinition[] = [
  {
    id: 'free',
    name: 'Free',
    monthlyPriceUsd: 0,
    monthlyGenerationLimit: 20,
    description: 'For testing your workflow and generating up to 20 messages per month.',
    cta: 'Current Plan',
  },
  {
    id: 'starter',
    name: 'Starter',
    monthlyPriceUsd: 9,
    monthlyGenerationLimit: 200,
    description: 'For solo users who need steady monthly AI message generation.',
    cta: 'Upgrade to Starter',
  },
  {
    id: 'pro',
    name: 'Pro',
    monthlyPriceUsd: 29,
    monthlyGenerationLimit: 2000,
    description: 'For higher-volume teams that need large generation capacity.',
    cta: 'Upgrade to Pro',
    highlight: 'Best Value',
  },
  {
    id: 'owner',
    name: 'Owner',
    monthlyPriceUsd: 0,
    monthlyGenerationLimit: 999999,
    description: 'Unlimited access for internal use.',
    cta: 'Internal Use',
  },
];

export const DEFAULT_STRIPE_CONFIG = {
  ready: false,
  checkoutEnabled: false,
  portalEnabled: false,
  plans: {
    starter: false,
    pro: false,
  },
};

export function getPlanDefinition(planId: PlanId) {
  return PLAN_DEFINITIONS.find((plan) => plan.id === planId) || PLAN_DEFINITIONS[0];
}

export function getServiceDefinition(serviceType: EmailServiceType) {
  return EMAIL_SERVICE_DEFINITIONS.find((service) => service.type === serviceType) || EMAIL_SERVICE_DEFINITIONS[0];
}

export function getSmtpProviderDefinition(providerId: SmtpProviderId) {
  return SMTP_PROVIDER_DEFINITIONS.find((provider) => provider.id === providerId) || SMTP_PROVIDER_DEFINITIONS[0];
}

export function normalizeSmtpProviderId(value: unknown, fallback: SmtpProviderId = 'custom'): SmtpProviderId {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase() as SmtpProviderId;
  return SMTP_PROVIDER_DEFINITIONS.some((provider) => provider.id === normalized) ? normalized : fallback;
}

export function buildEmptyProfile(): UserProfile {
  const plan = getPlanDefinition('free');
  const now = new Date();
  const currentPeriodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const currentPeriodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();

  return {
    planId: 'free',
    subscriptionStatus: 'active',
    monthlyGenerationLimit: plan.monthlyGenerationLimit,
    usedGenerationsThisPeriod: 0,
    remainingGenerations: plan.monthlyGenerationLimit,
    currentPeriodStart,
    currentPeriodEnd,
  };
}
