/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  CreditCard,
  History,
  Home,
  Loader2,
  LogIn,
  LogOut,
  Mail,
  Send,
  Settings as SettingsIcon,
  ShieldAlert,
  Sparkles,
  Target,
} from 'lucide-react';
import { User, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { CampaignContext, EmailServiceConnection, EnrichedLead, Lead, SendHistoryEntry, UserProfile } from './types';
import { auth } from './lib/firebase';
import { buildEmptyProfile, getPlanDefinition } from './lib/platform';
import { appendSendHistory, loadSendHistory } from './lib/history';
import { CampaignForm } from './components/CampaignForm';
import { LeadInput } from './components/LeadInput';
import { UserSettings } from './components/UserSettings';
import { EmailJsGuidePage } from './components/EmailJsGuidePage';
import { SubscriptionsPage } from './components/SubscriptionsPage';
import { HistoryPage } from './components/HistoryPage';
import {
  fetchEmailServices,
  fetchUserProfile,
  processLeadsWithProfile,
  sendGeneratedEmail,
} from './services/platformService';
import automailIcon from './assets/automail-icon.svg';
import automailLogo from './assets/automail-logo.svg';

type ActivePage = 'dashboard' | 'settings' | 'guide' | 'pricing' | 'history';

function normalizeDraftMessage(message: string) {
  return message
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<\/div>\s*<div>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\r\n/g, '\n')
    .trim();
}

function normalizeEnrichedLead(lead: EnrichedLead): EnrichedLead {
  return {
    ...lead,
    subject: lead.subject.trim(),
    message: normalizeDraftMessage(lead.message),
  };
}

function getUserKey(user: User | null) {
  return user?.uid || user?.email || '';
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [activePage, setActivePage] = useState<ActivePage>('dashboard');
  const [campaign, setCampaign] = useState<CampaignContext>({
    campaign_goal: '',
    offer: '',
    sender_name: '',
    sender_company: '',
    sender_email: '',
    sender_context: '',
    cta: '',
    tone_preference: 'Professional',
  });
  const [profile, setProfile] = useState<UserProfile>(buildEmptyProfile());
  const [services, setServices] = useState<EmailServiceConnection[]>([]);
  const [results, setResults] = useState<EnrichedLead[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [processWarnings, setProcessWarnings] = useState<string[]>([]);
  const [sendFeedback, setSendFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sendingState, setSendingState] = useState<Record<string, 'idle' | 'sending' | 'sent' | 'error'>>({});
  const [sendHistory, setSendHistory] = useState<SendHistoryEntry[]>([]);

  const userKey = getUserKey(currentUser);
  const selectedLead = results.find((lead) => lead.lead_id === selectedLeadId) || null;
  const selectedLeadSet = useMemo(() => new Set(selectedLeadIds), [selectedLeadIds]);
  const selectedLeads = useMemo(
    () => results.filter((lead) => selectedLeadSet.has(lead.lead_id)),
    [results, selectedLeadSet],
  );
  const orderedServices = useMemo(
    () => [...services].sort((a, b) => a.priority - b.priority || a.displayName.localeCompare(b.displayName)),
    [services],
  );
  const activeServices = useMemo(() => services.filter((service) => service.isActive), [services]);
  const totalRemainingSendCapacity = useMemo(
    () => activeServices.reduce((sum, service) => sum + (service.usage.remaining || 0), 0),
    [activeServices],
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!userKey) {
      setSendHistory([]);
      return;
    }
    setSendHistory(loadSendHistory(userKey));
  }, [userKey]);

  useEffect(() => {
    if (!currentUser) {
      setProfile(buildEmptyProfile());
      setServices([]);
      setResults([]);
      setSelectedLeadId(null);
      setSelectedLeadIds([]);
      return;
    }

    void (async () => {
      try {
        const idToken = await currentUser.getIdToken();
        const [profileResponse, servicesResponse] = await Promise.all([
          fetchUserProfile(idToken),
          fetchEmailServices(idToken),
        ]);
        setProfile(profileResponse.profile);
        setServices(servicesResponse.services);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load account data.');
      }
    })();
  }, [currentUser]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('session_id')) {
      setActivePage('pricing');
    }
  }, []);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Login failed.');
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setActivePage('dashboard');
    setResults([]);
    setSelectedLeadId(null);
    setSelectedLeadIds([]);
    setProcessWarnings([]);
    setSendFeedback(null);
    setError(null);
  };

  const refreshAccountState = async () => {
    if (!currentUser) {
      return;
    }
    const idToken = await currentUser.getIdToken();
    const [profileResponse, servicesResponse] = await Promise.all([
      fetchUserProfile(idToken),
      fetchEmailServices(idToken),
    ]);
    setProfile(profileResponse.profile);
    setServices(servicesResponse.services);
  };

  const sendLeadDraft = async (lead: EnrichedLead) => {
    if (!currentUser) {
      throw new Error('Sign in before sending emails.');
    }

    const idToken = await currentUser.getIdToken();
    const response = await sendGeneratedEmail(idToken, {
      leadId: lead.lead_id,
      to: lead.email,
      subject: lead.subject,
      html: normalizeDraftMessage(lead.message),
      from_name: campaign.sender_name || currentUser.displayName || '',
      from_email: campaign.sender_email || currentUser.email || '',
    });

    setProfile(response.profile || profile);
    recordSendHistory(
      lead,
      response.providerUsed || 'smtp',
      response.providerLabel || 'Unknown',
      campaign.sender_email || currentUser.email || '',
    );
    return response;
  };

  const handleLeadsSubmit = async (leads: Lead[]) => {
    if (!currentUser) {
      setError('Sign in before generating messages.');
      return;
    }

    if (!campaign.campaign_goal.trim() || !campaign.offer.trim() || !campaign.cta.trim()) {
      setError('Campaign goal, offer, and CTA are required before processing leads.');
      return;
    }

    try {
      setIsProcessing(true);
      setError(null);
      setSendFeedback(null);
      const idToken = await currentUser.getIdToken();
      const response = await processLeadsWithProfile(idToken, campaign, leads);
      const nextResults = response.leads.map(normalizeEnrichedLead);
      setProfile(response.profile);
      setResults(nextResults);
      setSelectedLeadId(nextResults[0]?.lead_id || null);
      setSelectedLeadIds([]);
      setProcessWarnings(response.warnings);
      setSendingState({});
    } catch (processError) {
      setError(processError instanceof Error ? processError.message : 'Failed to process leads.');
    } finally {
      setIsProcessing(false);
    }
  };

  const recordSendHistory = (lead: EnrichedLead, provider: string, providerLabel: string, senderEmail?: string) => {
    if (!userKey) {
      return;
    }

    const entry: SendHistoryEntry = {
      id: `${lead.lead_id}-${Date.now()}`,
      sentAt: new Date().toISOString(),
      toEmail: lead.email,
      subject: lead.subject,
      message: normalizeDraftMessage(lead.message),
      companyName: lead.company_name || lead.business_category,
      provider: provider as SendHistoryEntry['provider'],
      providerLabel,
      senderEmail,
    };

    appendSendHistory(userKey, entry);
    setSendHistory(loadSendHistory(userKey));
  };

  const handleSend = async (leadId: string) => {
    const lead = results.find((item) => item.lead_id === leadId);
    if (!lead || !lead.sendable) {
      return;
    }

    try {
      setSendingState((prev) => ({ ...prev, [leadId]: 'sending' }));
      setSendFeedback(null);
      if (!currentUser) {
        throw new Error('Sign in before sending emails.');
      }
      if (activeServices.length === 0) {
        setSendFeedback('Connect at least one email service before sending. Open Settings or the setup guide.');
        setActivePage('settings');
        return;
      }
      const response = await sendLeadDraft(lead);
      setSendingState((prev) => ({ ...prev, [leadId]: 'sent' }));
      setSendFeedback(response.friendlyMessage);
      await refreshAccountState();
    } catch (sendError) {
      setSendingState((prev) => ({ ...prev, [leadId]: 'error' }));
      setSendFeedback(sendError instanceof Error ? sendError.message : 'Failed to send email.');
      await refreshAccountState().catch(() => undefined);
    }
  };

  const toggleLeadSelection = (leadId: string) => {
    setSelectedLeadIds((current) => (
      current.includes(leadId)
        ? current.filter((id) => id !== leadId)
        : [...current, leadId]
    ));
  };

  const handleSelectAll = () => {
    if (results.length === 0) {
      return;
    }
    const allIds = results.map((lead) => lead.lead_id);
    const allSelected = allIds.every((id) => selectedLeadSet.has(id));
    setSelectedLeadIds(allSelected ? [] : allIds);
  };

  const handleDeleteSelected = () => {
    if (selectedLeadIds.length === 0) {
      return;
    }
    const nextResults = results.filter((lead) => !selectedLeadSet.has(lead.lead_id));
    setResults(nextResults);
    setSelectedLeadIds([]);
    setSelectedLeadId(nextResults[0]?.lead_id || null);
    setSendFeedback(`${selectedLeadIds.length} lead${selectedLeadIds.length === 1 ? '' : 's'} removed from the current list.`);
  };

  const handleSendSelected = async () => {
    if (!currentUser) {
      setError('Sign in before sending emails.');
      return;
    }

    if (activeServices.length === 0) {
      setSendFeedback('Connect at least one email service before sending. Open Settings or the setup guide.');
      setActivePage('settings');
      return;
    }

    const sendableSelected = selectedLeads.filter((lead) => lead.sendable);
    if (sendableSelected.length === 0) {
      setSendFeedback('Select at least one sendable lead first.');
      return;
    }

    try {
      setSendFeedback(`Sending ${sendableSelected.length} selected lead${sendableSelected.length === 1 ? '' : 's'}...`);
      const failed: string[] = [];
      let sentCount = 0;

      for (const lead of sendableSelected) {
        try {
          setSendingState((prev) => ({ ...prev, [lead.lead_id]: 'sending' }));
          const response = await sendLeadDraft(lead);
          setSendingState((prev) => ({ ...prev, [lead.lead_id]: 'sent' }));
          sentCount += 1;
          setSendFeedback(response.friendlyMessage || `Sent ${sentCount}/${sendableSelected.length}.`);
        } catch (sendError) {
          setSendingState((prev) => ({ ...prev, [lead.lead_id]: 'error' }));
          failed.push(sendError instanceof Error ? sendError.message : 'Failed to send selected lead.');
        }
      }

      await refreshAccountState();
      if (failed.length > 0) {
        setSendFeedback([
          sentCount > 0 ? `${sentCount} lead${sentCount === 1 ? '' : 's'} sent.` : 'Bulk send failed.',
          ...failed,
        ].join(' '));
      } else {
        setSendFeedback(`${sentCount} lead${sentCount === 1 ? '' : 's'} sent successfully.`);
      }
    } catch (sendError) {
      setSendFeedback(sendError instanceof Error ? sendError.message : 'Bulk send failed.');
    }
  };

  const renderAuthGate = () => (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-12">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.18),_transparent_55%)]" />
      <div className="relative z-10 max-w-3xl rounded-[40px] border border-white/10 bg-brand-surface/90 p-10 text-center shadow-2xl shadow-blue-950/30">
        <img src={automailLogo} alt="Automail AI" className="mx-auto h-20 w-auto" />
        <h1 className="mt-8 text-5xl font-black tracking-tight text-white">AI outreach with user-owned sending accounts.</h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-white/55">
          Generate business messages with AI, rotate between EmailJS, Brevo, SendGrid, Resend, and SMTP, and keep your own costs focused on AI generations only.
        </p>
        <div className="mt-10 flex flex-col items-center gap-4">
          <button
            onClick={handleLogin}
            className="flex items-center gap-3 rounded-2xl bg-white px-8 py-4 text-sm font-black uppercase tracking-[0.25em] text-black transition-all hover:bg-white/90"
          >
            <LogIn size={18} />
            Sign In With Google
          </button>
          <button
            onClick={() => setActivePage('guide')}
            className="text-xs font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300"
          >
            View Setup Guide First
          </button>
        </div>
      </div>
    </div>
  );

  const renderDashboard = () => (
    <div className="mx-auto max-w-7xl space-y-8 px-6 py-10">
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[32px] border border-brand-border bg-brand-surface p-8 shadow-2xl shadow-blue-950/20">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.3em] text-blue-400">
                <Sparkles size={12} />
                Dashboard
              </div>
              <h1 className="mt-4 text-4xl font-black tracking-tight text-white">Generate messages, then let automatic rotation handle delivery.</h1>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/55">
                Remaining generations and service limits are separate. If all services are exhausted, sending stops until reset or until more services are connected.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/35">Current Plan</div>
              <div className="mt-2 text-3xl font-black text-white">{getPlanDefinition(profile.planId).name}</div>
              <div className="mt-1 text-xs uppercase tracking-widest text-blue-400">{profile.remainingGenerations} generations left</div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/35">Used This Month</div>
              <div className="mt-2 text-3xl font-black text-white">{profile.usedGenerationsThisPeriod}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/35">Monthly Limit</div>
              <div className="mt-2 text-3xl font-black text-white">{profile.monthlyGenerationLimit}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/35">Active Send Capacity</div>
              <div className="mt-2 text-3xl font-black text-white">{totalRemainingSendCapacity}</div>
              <p className="mt-1 text-xs text-white/50">Immediate remaining sends across active services.</p>
            </div>
          </div>
        </div>

        <div className="rounded-[32px] border border-brand-border bg-brand-surface p-8 shadow-2xl shadow-blue-950/20">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/35">Connected Services</div>
              <h2 className="mt-2 text-2xl font-black text-white">{services.length} total</h2>
            </div>
            <button
              onClick={() => setActivePage('settings')}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white/65 hover:bg-white/10 hover:text-white"
            >
              Manage
            </button>
          </div>
          <div className="mt-6 space-y-3">
            {orderedServices.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-red-500/20 bg-red-500/10 p-5 text-sm text-red-200/85">
                No email service connected. Sending is blocked until the user sets up at least one provider.
              </div>
            ) : (
              orderedServices.map((service) => (
                <div key={service.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-bold text-white">{service.displayName}</div>
                      <div className="mt-1 text-xs text-white/45">
                        {service.usage.used}/{service.usage.limit ?? '∞'} used • {service.usage.remaining ?? '∞'} remaining
                      </div>
                    </div>
                    <div className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${
                      service.health === 'ready'
                        ? 'bg-green-500/10 text-green-300'
                        : service.health === 'exhausted'
                          ? 'bg-amber-500/10 text-amber-300'
                          : service.health === 'inactive'
                            ? 'bg-white/10 text-white/50'
                            : 'bg-red-500/10 text-red-300'
                    }`}>
                      {service.health}
                    </div>
                  </div>
                  {service.lastFailureReason && (
                    <div className="mt-3 text-xs text-amber-200/80">{service.lastFailureReason}</div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-8 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-[32px] border border-brand-border bg-brand-surface p-8 shadow-2xl shadow-blue-950/20">
          <div className="flex items-center gap-3 border-b border-brand-border pb-6">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600/20 text-sm font-bold text-blue-400">1</div>
            <h2 className="text-xl font-bold text-white">Campaign Strategy</h2>
          </div>
          <div className="mt-8">
            <CampaignForm campaign={campaign} onChange={setCampaign} />
          </div>
        </section>

        <section className="rounded-[32px] border border-brand-border bg-brand-surface p-8 shadow-2xl shadow-blue-950/20">
          <div className="flex items-center gap-3 border-b border-brand-border pb-6">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600/20 text-sm font-bold text-blue-400">2</div>
            <h2 className="text-xl font-bold text-white">Audience & Generation</h2>
          </div>

          <div className="mt-8">
            {isProcessing ? (
              <div className="flex min-h-[320px] flex-col items-center justify-center gap-5 text-center">
                <Loader2 className="animate-spin text-blue-500" size={56} />
                <div>
                  <p className="text-xl font-bold text-white">Generating messages...</p>
                  <p className="mt-2 text-sm text-white/45">This deducts 1 generation per lead processed.</p>
                </div>
              </div>
            ) : (
              <LeadInput onLeadsSubmit={handleLeadsSubmit} />
            )}
          </div>

          {error && (
            <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}
          {processWarnings.length > 0 && (
            <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              {processWarnings.join(' ')}
            </div>
          )}
          {activeServices.length === 0 && (
            <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              Sending is blocked until at least one email service is connected.
              <button onClick={() => setActivePage('guide')} className="ml-2 font-bold text-white underline underline-offset-4">
                Open setup guide
              </button>
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-8 xl:grid-cols-[0.42fr_0.58fr]">
        <aside className="rounded-[32px] border border-brand-border bg-brand-surface p-6 shadow-2xl shadow-blue-950/20">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-[0.25em] text-white/45">Generated Leads ({results.length})</h2>
            <span className="rounded-full bg-blue-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-blue-300">
              {results.filter((lead) => lead.sendable).length} sendable
            </span>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={handleSelectAll}
              disabled={results.length === 0}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white/70 hover:bg-white/10 disabled:opacity-40"
            >
              {results.length > 0 && results.every((lead) => selectedLeadSet.has(lead.lead_id)) ? 'Clear Selection' : 'Select All'}
            </button>
            <button
              onClick={handleSendSelected}
              disabled={selectedLeads.filter((lead) => lead.sendable).length === 0 || activeServices.length === 0}
              className="rounded-2xl bg-blue-600 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
            >
              Send Selected
            </button>
            <button
              onClick={handleDeleteSelected}
              disabled={selectedLeadIds.length === 0}
              className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-red-300 hover:bg-red-500/20 disabled:opacity-40"
            >
              Delete Selected
            </button>
          </div>

          {sendFeedback && (
            <div className="mt-4 rounded-2xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-100">
              {sendFeedback}
            </div>
          )}

          <div className="mt-4 max-h-[540px] space-y-3 overflow-y-auto pr-1">
            {results.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-white/35">
                Generated leads will appear here after processing.
              </div>
            ) : (
              results.map((lead) => (
                <div
                  key={lead.lead_id}
                  className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                    selectedLeadId === lead.lead_id ? 'border-blue-500/30 bg-blue-500/10' : 'border-white/10 bg-white/5 hover:bg-white/10'
                  }`}
                  onClick={() => setSelectedLeadId(lead.lead_id)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="flex items-start justify-between gap-3">
                    <label className="flex flex-1 items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedLeadSet.has(lead.lead_id)}
                        onChange={() => toggleLeadSelection(lead.lead_id)}
                        className="mt-1 h-4 w-4 rounded border-white/20 bg-black/20"
                      />
                      <div>
                        <div className="text-sm font-bold text-white">{lead.email || 'No email'}</div>
                        <div className="mt-1 text-xs text-white/45">{lead.company_name || lead.business_category}</div>
                      </div>
                    </label>
                    <div className="flex flex-col items-end gap-2">
                      <div className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${
                        sendingState[lead.lead_id] === 'sent'
                          ? 'bg-green-500/10 text-green-300'
                          : sendingState[lead.lead_id] === 'error'
                            ? 'bg-red-500/10 text-red-300'
                            : lead.sendable
                              ? 'bg-blue-500/10 text-blue-300'
                              : 'bg-amber-500/10 text-amber-300'
                      }`}>
                        {sendingState[lead.lead_id] === 'sent'
                          ? 'sent'
                          : sendingState[lead.lead_id] === 'error'
                            ? 'error'
                            : lead.sendable
                              ? 'ready'
                              : 'review'}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleSend(lead.lead_id);
                        }}
                        disabled={!lead.sendable || sendingState[lead.lead_id] === 'sending' || activeServices.length === 0}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white/65 hover:bg-white/10 disabled:opacity-40"
                      >
                        {sendingState[lead.lead_id] === 'sending' ? 'Sending' : 'Send'}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        <section className="rounded-[32px] border border-brand-border bg-brand-surface p-8 shadow-2xl shadow-blue-950/20">
          {selectedLead ? (
            <>
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/35">Draft Preview</div>
                  <h2 className="mt-3 text-3xl font-black text-white">{selectedLead.subject || 'No subject generated'}</h2>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-white/45">
                    <span>{selectedLead.company_name || selectedLead.business_category}</span>
                    <span>Confidence {selectedLead.category_confidence.toFixed(2)}</span>
                    {!selectedLead.sendable && <span>{selectedLead.skip_reason}</span>}
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      const subject = encodeURIComponent(selectedLead.subject);
                      const body = encodeURIComponent(normalizeDraftMessage(selectedLead.message));
                      window.location.href = `mailto:${selectedLead.email}?subject=${subject}&body=${body}`;
                    }}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold uppercase tracking-widest text-blue-300 hover:bg-white/10"
                  >
                    <Mail size={14} className="mr-2 inline" />
                    Mail App
                  </button>
                  <button
                    onClick={() => void handleSend(selectedLead.lead_id)}
                    disabled={!selectedLead.sendable || sendingState[selectedLead.lead_id] === 'sending' || activeServices.length === 0}
                    className="rounded-2xl bg-blue-600 px-5 py-3 text-xs font-bold uppercase tracking-widest text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
                  >
                    {sendingState[selectedLead.lead_id] === 'sending' ? (
                      <>
                        <Loader2 size={14} className="mr-2 inline animate-spin" />
                        Sending
                      </>
                    ) : (
                      <>
                        <Send size={14} className="mr-2 inline" />
                        Send Single
                      </>
                    )}
                  </button>
                </div>
              </div>

              {selectedLead.skip_reason && (
                <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  {selectedLead.skip_reason}
                </div>
              )}

              <div className="mt-8 rounded-[28px] border border-white/10 bg-brand-elevated p-8">
                <div className="space-y-6 text-base leading-relaxed text-white/85">
                  {selectedLead.message.trim()
                    ? selectedLead.message.split('\n').map((paragraph, index) => <p key={`${paragraph}-${index}`}>{paragraph}</p>)
                    : <p className="text-white/40">No message generated.</p>}
                </div>
              </div>
            </>
          ) : (
            <div className="flex min-h-[420px] flex-col items-center justify-center text-center text-white/25">
              <Target size={64} className="mb-4 opacity-20" />
              <p className="text-lg font-medium">Select a generated lead to review its email draft.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );

  if (isAuthLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-bg text-white">
        <Loader2 className="animate-spin text-blue-500" size={40} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-brand-bg text-brand-text">
      <header className="border-b border-brand-border bg-brand-surface px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <img src={automailIcon} alt="Automail AI" className="h-7 w-7" />
            <div>
              <div className="text-lg font-semibold tracking-tight text-white">Automail <span className="text-blue-500">AI</span></div>
              <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/35">User-Owned Delivery Rotation</div>
            </div>
          </div>

          <nav className="hidden items-center gap-2 md:flex">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: Home },
              { id: 'settings', label: 'Settings', icon: SettingsIcon },
              { id: 'guide', label: 'Guide', icon: BookOpen },
              { id: 'pricing', label: 'Pricing', icon: CreditCard },
              { id: 'history', label: 'History', icon: History },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActivePage(item.id as ActivePage)}
                  className={`rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${
                    activePage === item.id ? 'bg-blue-600 text-white' : 'bg-white/5 text-white/55 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon size={13} className="mr-2 inline" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-4">
            {currentUser && (
              <div className="hidden text-right md:block">
                <div className="text-sm font-bold text-white">{currentUser.displayName || currentUser.email}</div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-blue-400">{profile.remainingGenerations} generations left</div>
              </div>
            )}
            {currentUser ? (
              <button
                onClick={() => void handleLogout()}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white/65 hover:bg-white/10 hover:text-white"
              >
                <LogOut size={13} className="mr-2 inline" />
                Logout
              </button>
            ) : (
              <button
                onClick={handleLogin}
                className="rounded-2xl bg-white px-4 py-2 text-xs font-bold uppercase tracking-widest text-black hover:bg-white/90"
              >
                <LogIn size={13} className="mr-2 inline" />
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        {!currentUser && activePage !== 'guide'
          ? renderAuthGate()
          : activePage === 'dashboard'
            ? renderDashboard()
            : activePage === 'settings'
              ? (
                <div className="px-6 py-10">
                  <UserSettings
                    user={currentUser}
                    services={services}
                    onServicesChange={setServices}
                    onOpenGuide={() => setActivePage('guide')}
                  />
                </div>
              )
              : activePage === 'guide'
                ? (
                  <EmailJsGuidePage
                    onContinue={() => setActivePage(currentUser ? 'settings' : 'dashboard')}
                    onMarkSeen={() => undefined}
                  />
                )
                : activePage === 'pricing'
                  ? (
                    <div className="px-6 py-10">
                      <SubscriptionsPage
                        profile={profile}
                        user={currentUser}
                        onBack={() => setActivePage('dashboard')}
                      />
                    </div>
                  )
                  : (
                    <div className="px-6 py-10">
                      <HistoryPage entries={sendHistory} onBack={() => setActivePage('dashboard')} />
                    </div>
                  )}
      </main>

      <footer className="border-t border-brand-border bg-brand-surface px-6 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 text-[10px] font-bold uppercase tracking-widest text-white/35">
          <div className="flex items-center gap-4">
            <span>AI limits: monthly generations</span>
            <span>Send limits: provider-based rotation</span>
          </div>
          <div className="flex items-center gap-2">
            {activeServices.length === 0 ? <ShieldAlert size={12} className="text-red-300" /> : <CheckCircle2 size={12} className="text-green-300" />}
            <span>{activeServices.length === 0 ? 'No sending service connected' : `${activeServices.length} active sending services`}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
