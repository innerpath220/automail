import {
  EmailServiceConnection,
  EmailServiceConnectionInput,
  ProcessLeadsResponse,
  PlanId,
  SendEmailResponse,
  StripeCheckoutConfig,
  UserProfile,
} from '../types';
import { DEFAULT_STRIPE_CONFIG } from '../lib/platform';

const apiBaseUrl = import.meta.env.VITE_BILLING_API_BASE_URL?.trim() || '';

function buildUrl(path: string) {
  return apiBaseUrl ? `${apiBaseUrl}${path}` : path;
}

function safeParseJson(raw: string) {
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { error: raw };
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  const raw = await response.text();
  const data = safeParseJson(raw);
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || raw || 'Request failed.');
  }
  return data as T;
}

export async function fetchStripeConfig(): Promise<StripeCheckoutConfig> {
  try {
    const response = await fetch(buildUrl('/api/billing/config'));
    if (!response.ok) {
      return DEFAULT_STRIPE_CONFIG;
    }
    const raw = await response.text();
    return raw ? safeParseJson(raw) as StripeCheckoutConfig : DEFAULT_STRIPE_CONFIG;
  } catch {
    return DEFAULT_STRIPE_CONFIG;
  }
}

export async function createCheckoutSession(idToken: string, planId: Exclude<PlanId, 'free'>) {
  const response = await fetch(buildUrl('/api/billing/checkout-session'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, planId }),
  });
  return parseJson<{ url: string }>(response);
}

export async function createPortalSession(idToken: string, customerId?: string) {
  const response = await fetch(buildUrl('/api/billing/portal-session'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, customerId }),
  });
  return parseJson<{ url: string }>(response);
}

export async function fetchUserProfile(idToken: string) {
  const response = await fetch(buildUrl('/api/user-profile'), {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
  return parseJson<{ profile: UserProfile }>(response);
}

export async function fetchEmailServices(idToken: string) {
  const response = await fetch(buildUrl('/api/email-services'), {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
  return parseJson<{ services: EmailServiceConnection[] }>(response);
}

export async function saveEmailService(idToken: string, payload: EmailServiceConnectionInput) {
  const response = await fetch(buildUrl('/api/email-services'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
  });
  return parseJson<{ service: EmailServiceConnection }>(response);
}

export async function updateEmailService(idToken: string, serviceId: string, payload: Partial<EmailServiceConnectionInput>) {
  const response = await fetch(buildUrl(`/api/email-services/${encodeURIComponent(serviceId)}`), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
  });
  return parseJson<{ service: EmailServiceConnection }>(response);
}

export async function deleteEmailService(idToken: string, serviceId: string) {
  const response = await fetch(buildUrl(`/api/email-services/${encodeURIComponent(serviceId)}`), {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
  return parseJson<{ success: boolean }>(response);
}

export async function processLeadsWithProfile(
  idToken: string,
  campaign: unknown,
  leads: unknown,
) {
  const response = await fetch(buildUrl('/api/process-leads'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ campaign, leads }),
  });
  return parseJson<ProcessLeadsResponse>(response);
}

export async function sendGeneratedEmail(
  idToken: string,
  payload: {
    leadId: string;
    to: string;
    subject: string;
    html: string;
    from_name?: string;
    from_email?: string;
    preferredServiceId?: string;
  },
) {
  const response = await fetch(buildUrl('/api/send-email'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
  });
  return parseJson<SendEmailResponse>(response);
}
