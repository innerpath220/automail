import { CampaignContext, Lead, EnrichedLead } from "../types";

function isValidEmail(value: string | undefined): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function buildFallbackDraft(campaign: CampaignContext, lead: Lead | EnrichedLead) {
  const company = lead.company_name?.trim() || lead.business_category?.trim() || "your business";
  const intro = "notes" in lead && typeof lead.notes === "string" && lead.notes.trim()
    ? `I noticed ${lead.notes.trim().replace(/\.$/, "")}.`
    : campaign.sender_context.trim() || `I came across ${company} and thought there might be a fit.`;

  return {
    subject: `${company}: quick idea for growth`,
    message: [
      `Hi ${company} team,`,
      "",
      intro,
      `At ${campaign.sender_company || "our company"}, we help businesses like yours with ${campaign.offer.trim()}.`,
      campaign.cta.trim(),
      "",
      "If this is not relevant, reply and I'll stop reaching out.",
      "",
      "Best,",
      campaign.sender_name?.trim() || "A teammate",
    ].join("\n"),
  };
}

function hydrateBlankDrafts(
  campaign: CampaignContext,
  sourceLeads: Lead[],
  leads: EnrichedLead[],
): EnrichedLead[] {
  const sourceLeadMap = new Map(sourceLeads.map((lead, index) => [lead.lead_id || `lead-${index + 1}`, lead]));

  return leads.map((lead, index) => {
    const email = lead.email?.trim() || "";
    const hasDraft = Boolean(lead.subject?.trim()) && Boolean(lead.message?.trim());
    if (!isValidEmail(email) || hasDraft) {
      return lead;
    }

    const sourceLead = sourceLeadMap.get(lead.lead_id) || sourceLeads[index] || lead;
    const fallbackDraft = buildFallbackDraft(campaign, sourceLead);

    return {
      ...lead,
      email,
      sendable: true,
      needs_review: true,
      skip_reason: "",
      subject: fallbackDraft.subject,
      message: fallbackDraft.message,
      debug_info: lead.debug_info || "frontend fallback draft injected because API returned an empty email",
    };
  });
}

export async function processLeads(
  campaign: CampaignContext,
  leads: Lead[]
): Promise<{ leads: EnrichedLead[]; warnings: string[] }> {
  const response = await fetch("/api/process-leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ campaign, leads }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Failed to process leads");
  }

  const hydratedLeads = hydrateBlankDrafts(
    campaign,
    leads,
    (data.leads || []) as EnrichedLead[],
  );

  return {
    leads: hydratedLeads,
    warnings: Array.isArray(data.warnings) ? data.warnings as string[] : [],
  };
}
