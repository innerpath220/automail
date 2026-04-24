/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { CampaignContext, Lead, EnrichedLead, SmtpSettings } from './types';
import { CampaignForm } from './components/CampaignForm';
import { LeadInput } from './components/LeadInput';
import { processLeads } from './services/geminiService';
import { Mail, Zap, Target, Loader2, Send, CheckCircle2, AlertCircle, LogIn, LogOut, Settings as SettingsIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { UserSettings } from './components/UserSettings';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [campaign, setCampaign] = useState<CampaignContext>({
    campaign_goal: '',
    offer: '',
    sender_name: '',
    sender_company: '',
    sender_email: '',
    sender_context: '',
    cta: '',
    tone_preference: 'Professional'
  });

  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4>(1); // 1: Setup, 2: Dashboard, 3: Settings, 4: SMTP Guide
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<EnrichedLead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [sendingState, setSendingState] = useState<Record<string, 'idle' | 'sending' | 'sent' | 'error'>>({});
  const [selectedLeadsForAction, setSelectedLeadsForAction] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<{ total: number; done: number; isActive: boolean } | null>(null);
  const [sendFeedback, setSendFeedback] = useState<string | null>(null);
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [draftSubject, setDraftSubject] = useState('');
  const [draftMessage, setDraftMessage] = useState('');
  const [previousStepBeforeSettings, setPreviousStepBeforeSettings] = useState<1 | 2 | 4>(1);
  const [processWarnings, setProcessWarnings] = useState<string[]>([]);
  const isGuestUser = currentUser?.uid === 'guest-user';

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsAuthLoading(false);

      if (user && user.uid !== 'guest-user') {
        const guideKey = `smtp-guide-seen:${user.uid}`;
        if (window.localStorage.getItem(guideKey) !== 'true') {
          setActiveStep(4);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (e: any) {
      console.error("Login Error:", e);
      if (confirm("Firebase Auth failed (likely domain issue). Use Guest Mode instead?")) {
        setCurrentUser({
            uid: 'guest-user',
            email: 'guest@example.com',
            displayName: 'Guest User',
            getIdToken: async () => 'guest-token'
        } as any);
        setIsAuthLoading(false);
      } else {
        alert("Failed to login. Please try again.");
      }
    }
  };

  const handleGuestMode = () => {
    setCurrentUser({
        uid: 'guest-user',
        email: 'guest@example.com',
        displayName: 'Guest User',
        getIdToken: async () => 'guest-token'
    } as any);
    setIsAuthLoading(false);
  };

  const handleLogout = async () => {
    await signOut(auth);
    setActiveStep(1);
    setResults(null);
    setEditingLeadId(null);
    setProcessWarnings([]);
  };

  const handleLeadsSubmit = async (leads: Lead[]) => {
    if (!campaign.campaign_goal.trim() || !campaign.offer.trim() || !campaign.cta.trim()) {
      setError('Campaign goal, offer, and CTA required before processing leads.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setSendFeedback(null);
    setProcessWarnings([]);
    try {
      const processed = await processLeads(campaign, leads);
      const enriched = processed.leads;
      setResults(enriched);
      setProcessWarnings(processed.warnings);
      setSendingState({});
      setSelectedLeadsForAction(new Set());
      if (enriched.length > 0) {
        setSelectedLeadId(enriched[0].lead_id);
      } else {
        setSelectedLeadId(null);
      }
      setActiveStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'An unexpected error occurred during processing.');
    } finally {
      setIsProcessing(false);
    }
  };

  const loadSmtpSettings = async (userId: string): Promise<SmtpSettings | null> => {
    if (userId === 'guest-user') return null;
    const docSnap = await getDoc(doc(db, `users/${userId}/settings/smtp`));
    if (!docSnap.exists()) {
      return null;
    }

    const data = docSnap.data() as Partial<SmtpSettings>;
    return {
      smtpHost: data.smtpHost || '',
      smtpPort: data.smtpPort || '587',
      smtpUser: data.smtpUser || '',
      smtpPass: data.smtpPass || '',
      senderName: data.senderName || '',
      senderEmail: data.senderEmail || '',
    };
  };

  const handleMailTo = (leadId: string) => {
    const lead = results?.find(l => l.lead_id === leadId);
    if (!lead) return;
    
    const subject = encodeURIComponent(lead.subject);
    const body = encodeURIComponent(lead.message.replace(/<[^>]*>/g, '')); // Strip HTML for mailto
    window.location.href = `mailto:${lead.email}?subject=${subject}&body=${body}`;
  };

  const handleStartEditLead = (leadId: string) => {
    const lead = results?.find((item) => item.lead_id === leadId);
    if (!lead) return;

    setEditingLeadId(leadId);
    setDraftSubject(lead.subject);
    setDraftMessage(lead.message);
  };

  const handleCancelEditLead = () => {
    setEditingLeadId(null);
    setDraftSubject('');
    setDraftMessage('');
  };

  const handleSaveLeadDraft = () => {
    if (!editingLeadId || !results) return;

    const nextSubject = draftSubject.trim();
    const nextMessage = draftMessage.trim();
    if (!nextSubject || !nextMessage) {
      setSendFeedback('Subject and message required.');
      return;
    }

    setResults(results.map((lead) => (
      lead.lead_id === editingLeadId
        ? { ...lead, subject: nextSubject, message: nextMessage, needs_review: false }
        : lead
    )));
    setSendFeedback('Draft updated.');
    handleCancelEditLead();
  };

  const handleOpenSmtpGuideSettings = () => {
    if (currentUser && currentUser.uid !== 'guest-user') {
      window.localStorage.setItem(`smtp-guide-seen:${currentUser.uid}`, 'true');
    }
    setActiveStep(3);
  };

  const handleSkipSmtpGuide = () => {
    if (currentUser && currentUser.uid !== 'guest-user') {
      window.localStorage.setItem(`smtp-guide-seen:${currentUser.uid}`, 'true');
    }
    setActiveStep(1);
  };

  const handleToggleSettings = () => {
    if (activeStep === 3) {
      setActiveStep(previousStepBeforeSettings);
      return;
    }

    if (activeStep !== 3) {
      setPreviousStepBeforeSettings(activeStep as 1 | 2 | 4);
    }
    setActiveStep(3);
  };

  const handleSend = async (leadId: string) => {
    if (!currentUser) {
      alert("Please login first.");
      return;
    }

    if (isGuestUser) {
      setSendFeedback('Guest mode can draft only. Sign in to use direct SMTP send.');
      return false;
    }

    const lead = results?.find(l => l.lead_id === leadId);
    if (!lead || !lead.sendable) return;

    setSendingState(prev => ({ ...prev, [leadId]: 'sending' }));
    
    try {
      const idToken = await currentUser.getIdToken();
      const smtpSettings = await loadSmtpSettings(currentUser.uid);
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: lead.email,
          subject: lead.subject,
          html: lead.message,
          from_name: campaign.sender_name || currentUser.displayName,
          from_email: campaign.sender_email || currentUser.email,
          idToken,
          smtpSettings
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send email');
      }
      
      setSendFeedback(`Sent ${lead.email}`);
      setSendingState(prev => ({ ...prev, [leadId]: 'sent' }));
      return true;
    } catch (e) {
      console.error(e);
      setSendFeedback(e instanceof Error ? e.message : 'Failed to send email');
      setSendingState(prev => ({ ...prev, [leadId]: 'error' }));
      return false;
    }
  };

  const handleBulkSend = async () => {
    if (isGuestUser) {
      setSendFeedback('Guest mode cannot bulk send. Use Mail App or sign in.');
      return;
    }

    const leadsToSend = results?.filter(l => l.sendable && selectedLeadsForAction.has(l.lead_id) && sendingState[l.lead_id] !== 'sent') || [];
    if (leadsToSend.length === 0) return;

    setSendFeedback(null);
    setBulkStatus({ total: leadsToSend.length, done: 0, isActive: true });
    
    let completed = 0;
    for (const lead of leadsToSend) {
      await handleSend(lead.lead_id);
      completed++;
      setBulkStatus(prev => prev ? { ...prev, done: completed } : null);
    }

    setTimeout(() => setBulkStatus(null), 3000);
  };

  const handleBulkDelete = () => {
    if (results) {
      const newResults = results.filter(l => !selectedLeadsForAction.has(l.lead_id));
      setResults(newResults);
      setSelectedLeadsForAction(new Set());
      if (selectedLeadId && selectedLeadsForAction.has(selectedLeadId)) {
        setSelectedLeadId(newResults[0]?.lead_id || null);
      }
    }
  };

  const toggleSelectLead = (e: React.MouseEvent, leadId: string) => {
    e.stopPropagation();
    const newSelected = new Set(selectedLeadsForAction);
    if (newSelected.has(leadId)) {
      newSelected.delete(leadId);
    } else {
      newSelected.add(leadId);
    }
    setSelectedLeadsForAction(newSelected);
  };

  const toggleSelectAll = () => {
    if (results && selectedLeadsForAction.size === results.length) {
      setSelectedLeadsForAction(new Set());
    } else if (results) {
      setSelectedLeadsForAction(new Set(results.map(l => l.lead_id)));
    }
  };

  const selectedLead = results?.find(l => l.lead_id === selectedLeadId);
  const readyLeadCount = results?.filter(l => l.sendable).length || 0;
  const sentLeadCount = Object.values(sendingState).filter(s => s === 'sent').length;
  const isEditingSelectedLead = selectedLead?.lead_id === editingLeadId;

  return (
    <div className="h-screen bg-brand-bg text-brand-text font-sans selection:bg-blue-500/20 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-16 border-b border-brand-border bg-brand-surface px-8 flex items-center justify-between z-50 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold text-white shadow-sm shadow-blue-900/50">L</div>
          <span className="text-lg font-semibold tracking-tight">LeadDraft <span className="text-white/40 font-normal">v2.4</span></span>
        </div>
        <div className="flex items-center gap-6">
          {currentUser ? (
            <>
              <div className="hidden md:flex flex-col items-end">
                <span className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Authenticated as</span>
                <span className="text-sm text-blue-400 truncate max-w-[200px]">{currentUser.email}</span>
              </div>
              <div className="h-8 w-[1px] bg-brand-border"></div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleToggleSettings}
                  className={`p-2 rounded transition-colors ${activeStep === 3 ? 'bg-blue-600 text-white' : 'hover:bg-white/5 text-white/40'}`}
                  title="Settings"
                >
                  <SettingsIcon size={20} />
                </button>
                <button 
                  onClick={handleLogout}
                  className="p-2 hover:bg-white/5 text-white/40 rounded transition-colors"
                  title="Logout"
                >
                  <LogOut size={20} />
                </button>
              </div>
            </>
          ) : (
            <button 
              onClick={handleLogin}
              className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-bold hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <LogIn size={18} />
              Login with Google
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {isAuthLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="animate-spin text-blue-500" size={32} />
          </div>
        ) : !currentUser ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-brand-bg relative overflow-hidden">
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-600/5 rounded-full blur-[120px] pointer-events-none" />
             <div className="max-w-xl space-y-8 relative z-10">
               <div className="w-20 h-20 bg-blue-600 rounded-3xl mx-auto flex items-center justify-center shadow-2xl shadow-blue-600/20 rotate-12">
                 <Zap className="text-white fill-white" size={40} />
               </div>
               <div className="space-y-4">
                 <h1 className="text-5xl font-black tracking-tighter text-white">The AI Outreach Engine for <span className="text-blue-500 underline decoration-blue-500/30 underline-offset-8">Professionals.</span></h1>
                 <p className="text-lg text-white/40 font-medium leading-relaxed">
                   LeadDraft scales your personalized outreach using individual SMTP accounts and industrial-grade lead enrichment.
                 </p>
               </div>
               <button
                 onClick={handleLogin}
                 className="px-10 py-5 bg-white text-black rounded-2xl font-black text-xl hover:bg-white/90 transition-all shadow-xl shadow-white/5 uppercase tracking-tighter flex items-center gap-4 mx-auto group"
               >
                 Get Started
                 <LogIn className="group-hover:translate-x-1 transition-transform" />
               </button>
               <button
                 onClick={handleGuestMode}
                 className="text-white/40 hover:text-white/60 text-sm font-bold uppercase tracking-widest transition-colors"
               >
                 Or Continue as Guest
               </button>               <div className="grid grid-cols-3 gap-8 pt-12 border-t border-white/5">
                 <div>
                   <div className="text-xl font-bold text-white">Zero Spam</div>
                   <div className="text-xs text-white/20 uppercase tracking-widest mt-1 font-bold">Quality First</div>
                 </div>
                 <div>
                   <div className="text-xl font-bold text-white">Smart Enrich</div>
                   <div className="text-xs text-white/20 uppercase tracking-widest mt-1 font-bold">Deep Context</div>
                 </div>
                 <div>
                   <div className="text-xl font-bold text-white">Multi-User</div>
                   <div className="text-xs text-white/20 uppercase tracking-widest mt-1 font-bold">Team Ready</div>
                 </div>
               </div>
             </div>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {activeStep === 4 ? (
              <motion.div
                key="smtp-guide"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 overflow-y-auto px-6 py-12"
              >
                <div className="max-w-4xl mx-auto">
                  <div className="rounded-[32px] border border-brand-border bg-brand-surface p-10 shadow-2xl shadow-blue-950/20">
                    <div className="max-w-3xl space-y-8">
                      <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.3em] text-blue-400">
                        SMTP Automation Guide
                      </div>
                      <div className="space-y-4">
                        <h1 className="text-5xl font-black tracking-tighter text-white">Connect SMTP once. Then LeadDraft can send outreach automatically.</h1>
                        <p className="max-w-2xl text-lg leading-relaxed text-white/50">
                          If you add your SMTP credentials, the app stops at draft review only when you want it to. The direct send buttons will use your mailbox, apply your sender identity, and automate outreach from inside the dashboard.
                        </p>
                      </div>

                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                          <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.25em] text-white/30">Step 1</div>
                          <div className="text-lg font-bold text-white">Add SMTP host, port, user, pass</div>
                          <p className="mt-2 text-sm leading-relaxed text-white/50">Use Gmail app password, Microsoft SMTP, or any provider that supports authenticated sending.</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                          <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.25em] text-white/30">Step 2</div>
                          <div className="text-lg font-bold text-white">Review AI-generated drafts</div>
                          <p className="mt-2 text-sm leading-relaxed text-white/50">You can still edit each subject and message before approving delivery.</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                          <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.25em] text-white/30">Step 3</div>
                          <div className="text-lg font-bold text-white">Use Approve & Send for full automation</div>
                          <p className="mt-2 text-sm leading-relaxed text-white/50">No copy/paste, no mail app handoff. LeadDraft sends directly through your SMTP account.</p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row">
                        <button
                          onClick={handleOpenSmtpGuideSettings}
                          className="rounded-2xl bg-blue-600 px-8 py-4 text-sm font-black uppercase tracking-[0.25em] text-white transition-all hover:bg-blue-700"
                        >
                          Open SMTP Settings
                        </button>
                        <button
                          onClick={handleSkipSmtpGuide}
                          className="rounded-2xl border border-white/10 bg-white/5 px-8 py-4 text-sm font-black uppercase tracking-[0.25em] text-white/50 transition-all hover:bg-white/10 hover:text-white/80"
                        >
                          Skip For Now
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : activeStep === 1 ? (
              <motion.div
                key="setup"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 overflow-y-auto px-6 py-12"
              >
                <div className="max-w-4xl mx-auto space-y-12">
                  <div className="max-w-2xl flex justify-between items-end">
                    <div>
                      <h1 className="text-4xl font-extrabold text-white tracking-tight mb-4">
                        Scale your outreach <span className="text-blue-500">without the spam.</span>
                      </h1>
                      <p className="text-lg text-white/50 leading-relaxed">
                        Enrich leads, infer business context, and draft emails that actually get read.
                      </p>
                    </div>
                    {results && (
                      <button 
                        onClick={() => setActiveStep(2)}
                        className="px-6 py-3 bg-white/5 border border-white/10 rounded-xl text-sm font-bold hover:bg-white/10 transition-all"
                      >
                        Return to Queue
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <section className="bg-brand-surface border border-brand-border p-8 rounded-2xl shadow-xl space-y-8">
                      <div className="flex items-center gap-3 border-b border-brand-border pb-6">
                        <div className="w-8 h-8 bg-blue-600/20 text-blue-400 rounded-full flex items-center justify-center font-bold text-sm">1</div>
                        <h2 className="text-xl font-bold">Campaign Strategy</h2>
                      </div>
                      <CampaignForm campaign={campaign} onChange={setCampaign} />
                    </section>

                    <section className="bg-brand-surface border border-brand-border p-8 rounded-2xl shadow-xl space-y-8 flex flex-col">
                      <div className="flex items-center gap-3 border-b border-brand-border pb-6">
                        <div className="w-8 h-8 bg-blue-600/20 text-blue-400 rounded-full flex items-center justify-center font-bold text-sm">2</div>
                        <h2 className="text-xl font-bold">Audience & Data</h2>
                      </div>
                      
                      {isProcessing ? (
                        <div className="flex-1 flex flex-col items-center justify-center space-y-6 py-12 text-center">
                          <div className="relative">
                            <Loader2 className="animate-spin text-blue-500" size={64} />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Zap className="text-white fill-white" size={24} />
                            </div>
                          </div>
                          <div>
                            <p className="font-bold text-xl text-white tracking-tight">Enriching Leads...</p>
                            <p className="text-white/40 text-sm mt-2">Gemini is cleaning data and drafting emails.</p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1">
                          <LeadInput onLeadsSubmit={handleLeadsSubmit} />
                          {error && (
                            <div className="mt-4 p-4 bg-red-900/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
                              {error}
                            </div>
                          )}
                          {processWarnings.length > 0 && (
                            <div className="mt-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
                              <div className="text-[10px] font-bold uppercase tracking-widest text-yellow-400">Processing Warnings</div>
                              <div className="mt-2 space-y-1 text-xs text-yellow-100/70">
                                {processWarnings.map((warning, index) => (
                                  <div key={`${warning}-${index}`}>{warning}</div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </section>
                  </div>
                </div>
              </motion.div>
            ) : activeStep === 2 ? (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex overflow-hidden"
              >
              {/* Sidebar: Leads Queue */}
              <aside className="w-80 border-r border-brand-border flex flex-col bg-brand-surface shrink-0">
                <div className="p-4 border-b border-brand-border space-y-4">
                  <div className="flex justify-between items-center">
                    <h2 className="text-xs uppercase tracking-widest font-bold text-white/50">Lead Queue ({results?.length})</h2>
                    <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded font-bold">
                      {readyLeadCount} Ready
                    </span>
                  </div>

                  {sendFeedback && (
                    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-white/60">
                      {sendFeedback}
                    </div>
                  )}
                  {processWarnings.length > 0 && (
                    <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-3 py-2">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-yellow-400">AI / Validation Warnings</div>
                      <div className="mt-2 space-y-1 text-[10px] uppercase tracking-widest text-yellow-100/60">
                        {processWarnings.slice(0, 4).map((warning, index) => (
                          <div key={`${warning}-${index}`}>{warning}</div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className="flex gap-2">
                    <button 
                      onClick={toggleSelectAll}
                      className="flex-1 px-2 py-1.5 border border-brand-border rounded text-[10px] font-bold text-white/40 hover:bg-white/5 transition-colors uppercase tracking-widest"
                    >
                      {selectedLeadsForAction.size === results?.length ? 'Unselect All' : 'Select All'}
                    </button>
                    <button 
                      onClick={handleBulkDelete}
                      disabled={selectedLeadsForAction.size === 0}
                      className="px-2 py-1.5 border border-red-500/30 text-red-400 rounded text-[10px] font-bold hover:bg-red-500/10 transition-colors uppercase tracking-widest disabled:opacity-20"
                    >
                      Delete
                    </button>
                  </div>

                  <button 
                    onClick={handleBulkSend}
                    disabled={selectedLeadsForAction.size === 0 || bulkStatus?.isActive || isGuestUser}
                    className="w-full py-2.5 bg-blue-600 text-white rounded text-[10px] font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-900/40 disabled:opacity-20 uppercase tracking-widest flex items-center justify-center gap-2 relative overflow-hidden"
                  >
                    {bulkStatus?.isActive ? (
                      <>
                        <div className="absolute inset-0 bg-blue-700 w-full" style={{ width: `${(bulkStatus.done / bulkStatus.total) * 100}%`, transition: 'width 0.3s' }} />
                        <span className="relative z-10 flex items-center gap-2">
                           <Loader2 size={12} className="animate-spin" />
                           Sending {bulkStatus.done}/{bulkStatus.total}
                        </span>
                      </>
                    ) : (
                      <>
                        <Send size={12} />
                        Send Selected ({selectedLeadsForAction.size})
                      </>
                    )}
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {results?.map((lead) => (
                    <div 
                      key={lead.lead_id}
                      onClick={() => setSelectedLeadId(lead.lead_id)}
                      className={`p-4 border-b border-brand-border-faint flex gap-3 cursor-pointer transition-colors hover:bg-white/5 ${selectedLeadId === lead.lead_id ? 'bg-white/5 border-l-2 border-blue-500' : 'opacity-60'}`}
                    >
                      <div 
                        onClick={(e) => toggleSelectLead(e, lead.lead_id)}
                        className={`mt-1 shrink-0 w-4 h-4 border rounded flex items-center justify-center transition-colors ${selectedLeadsForAction.has(lead.lead_id) ? 'bg-blue-600 border-blue-600' : 'border-white/20 hover:border-white/40'}`}
                      >
                        {selectedLeadsForAction.has(lead.lead_id) && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                      </div>

                      <div className="flex-1 flex flex-col gap-1 min-w-0">
                        <div className="flex justify-between items-start">
                          <span className="font-medium text-sm truncate pr-2">{lead.email}</span>
                          {sendingState[lead.lead_id] === 'sent' ? (
                            <CheckCircle2 size={12} className="text-green-400 shrink-0" />
                          ) : sendingState[lead.lead_id] === 'error' ? (
                            <AlertCircle size={12} className="text-red-400 shrink-0" />
                          ) : (
                            <span className={`text-[10px] uppercase font-bold shrink-0 ${lead.sendable ? 'text-green-400' : lead.needs_review ? 'text-yellow-500' : 'text-red-500'}`}>
                              {lead.sendable ? 'Sendable' : lead.needs_review ? 'Review' : 'Skipped'}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-white/40 truncate">{lead.company_name || lead.business_category}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-4 bg-brand-bg border-t border-brand-border">
                  <div className="flex justify-between text-xs mb-2">
                    <span className="text-white/40 font-medium">Batch Progress</span>
                    <span className="text-white/60 font-mono italic">{sentLeadCount}/{results?.length} sent</span>
                  </div>
                  <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
                    <div 
                      className="bg-blue-600 h-full transition-all duration-500"
                      style={{ width: `${(sentLeadCount / (results?.length || 1)) * 100}%` }}
                    />
                  </div>
                </div>
              </aside>

              {/* Main Content: Selection Details & Editor */}
              <section className="flex-1 flex flex-col overflow-hidden">
                {selectedLead ? (
                  <div className="flex-1 flex flex-col overflow-y-auto">
                    {/* Enrichment Panel */}
                    <div className="min-h-48 border-b border-brand-border p-8 flex flex-col md:flex-row gap-8 bg-brand-bg">
                      <div className="flex-1">
                        <h3 className="text-xs uppercase tracking-widest text-white/40 mb-6 font-bold">Enrichment Results</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-12">
                          <div>
                            <label className="block text-[10px] text-white/30 uppercase tracking-widest font-bold">Business Category</label>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-sm font-medium text-white/90">{selectedLead.business_category}</span>
                              <span className="text-[10px] px-1.5 py-0.5 bg-white/5 border border-white/10 rounded font-mono text-white/40">Conf: {selectedLead.category_confidence.toFixed(2)}</span>
                            </div>
                          </div>
                          <div>
                            <label className="block text-[10px] text-white/30 uppercase tracking-widest font-bold">Lead Status</label>
                            <div className="flex items-center gap-1.5 mt-1">
                              <div className={`w-2 h-2 rounded-full ${selectedLead.sendable ? 'bg-green-500' : 'bg-red-500'}`}></div>
                              <span className="text-sm font-medium text-white/90">{selectedLead.sendable ? 'Validation Passed' : 'Validation Failed'}</span>
                            </div>
                          </div>
                          <div>
                            <label className="block text-[10px] text-white/30 uppercase tracking-widest font-bold">Contact Info</label>
                            <span className="text-sm block mt-1 text-white/90">{selectedLead.phone_number || 'N/A'}</span>
                          </div>
                          <div>
                            <label className="block text-[10px] text-white/30 uppercase tracking-widest font-bold">Lead ID</label>
                            <span className="text-sm block mt-1 font-mono text-white/50">{selectedLead.lead_id}</span>
                          </div>
                        </div>
                      </div>
                      {selectedLead.skip_reason && (
                        <div className="w-full md:w-64 bg-red-500/5 rounded-lg border border-red-500/20 p-4">
                          <h4 className="text-[10px] uppercase text-red-400 font-bold mb-2">Skip Reason</h4>
                          <p className="text-xs leading-relaxed text-red-200/70 italic">"{selectedLead.skip_reason}"</p>
                        </div>
                      )}
                      {selectedLead.debug_info && (
                        <div className="w-full md:w-64 bg-blue-500/5 rounded-lg border border-blue-500/20 p-4">
                          <h4 className="text-[10px] uppercase text-blue-400 font-bold mb-2 tracking-widest">Debug Info</h4>
                          <p className="text-xs leading-relaxed text-blue-200/70 italic">"{selectedLead.debug_info}"</p>
                        </div>
                      )}
                      {selectedLead.needs_review && !selectedLead.skip_reason && (
                        <div className="w-full md:w-64 bg-yellow-500/5 rounded-lg border border-yellow-500/20 p-4">
                          <h4 className="text-[10px] uppercase text-yellow-400 font-bold mb-2 tracking-widest">Review Recommended</h4>
                          <p className="text-xs leading-relaxed text-yellow-200/70 italic">"Low confidence or sparse context. Please verify the draft manually before sending."</p>
                        </div>
                      )}
                    </div>

                    {/* Email Draft Panel */}
                    <div className="flex-1 p-8 bg-brand-surface relative flex flex-col min-h-[500px]">
                      <div className="mb-6 flex justify-between items-center max-w-2xl mx-auto w-full shrink-0">
                        <h3 className="text-xl font-medium tracking-tight">Draft Preview</h3>
                        <div className="flex gap-2">
                           <button 
                            onClick={() => handleMailTo(selectedLead.lead_id)}
                            className="px-4 py-2 bg-white/5 border border-white/10 rounded text-xs font-bold hover:bg-white/10 transition-colors uppercase tracking-widest text-blue-400 flex items-center gap-2"
                           >
                            <Mail size={14} />
                            Send via Mail App
                           </button>
                           <button 
                            onClick={() => {
                              navigator.clipboard.writeText(selectedLead.message);
                              alert('Copied to clipboard!');
                            }}
                            className="px-4 py-2 border border-brand-border rounded text-xs font-bold hover:bg-white/5 transition-colors uppercase tracking-widest"
                           >
                            Copy Draft
                           </button>
                           {isEditingSelectedLead ? (
                             <>
                               <button
                                 onClick={handleSaveLeadDraft}
                                 className="px-4 py-2 bg-blue-600 text-white rounded text-xs font-bold hover:bg-blue-700 transition-colors uppercase tracking-widest"
                               >
                                 Save Edit
                               </button>
                               <button
                                 onClick={handleCancelEditLead}
                                 className="px-4 py-2 border border-white/10 rounded text-xs font-bold hover:bg-white/5 transition-colors uppercase tracking-widest text-white/60"
                               >
                                 Cancel
                               </button>
                             </>
                           ) : (
                             <button
                               onClick={() => handleStartEditLead(selectedLead.lead_id)}
                               className="px-4 py-2 border border-white/10 rounded text-xs font-bold hover:bg-white/5 transition-colors uppercase tracking-widest text-white/80"
                             >
                               Edit Email
                             </button>
                           )}
                           {sendingState[selectedLead.lead_id] === 'sent' ? (
                             <div className="flex items-center gap-2 px-4 py-2 bg-green-500/20 text-green-400 rounded text-xs font-bold border border-green-500/30">
                               <CheckCircle2 size={14} />
                               SENT
                             </div>
                           ) : sendingState[selectedLead.lead_id] === 'error' ? (
                           <button 
                            onClick={() => handleSend(selectedLead.lead_id)}
                             disabled={isGuestUser}
                             className="px-6 py-2 bg-red-600/20 text-red-400 border border-red-500/30 rounded text-xs font-bold hover:bg-red-500/30 transition-all flex items-center gap-2 uppercase tracking-widest disabled:opacity-50"
                            >
                             <AlertCircle size={14} />
                             RETRY SEND
                            </button>
                          ) : (
                             <button 
                              onClick={() => handleSend(selectedLead.lead_id)}
                              disabled={!selectedLead.sendable || sendingState[selectedLead.lead_id] === 'sending' || isGuestUser}
                              className="px-6 py-2 bg-blue-600 text-white rounded text-xs font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-900/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 uppercase tracking-widest"
                             >
                              {sendingState[selectedLead.lead_id] === 'sending' ? (
                                <>
                                  <Loader2 size={14} className="animate-spin" />
                                  SENDING...
                                </>
                              ) : (
                                <>
                                  <Send size={14} />
                                  APPROVE & SEND
                                </>
                              )}
                             </button>
                           )}
                        </div>
                      </div>

                      <div className="flex-1 bg-brand-elevated rounded-xl border border-white/5 p-10 font-serif text-white/80 max-w-2xl mx-auto shadow-2xl w-full">
                        <div className="border-b border-white/10 pb-4 mb-8">
                          <span className="text-white/40 text-[10px] font-sans uppercase tracking-widest block mb-1 font-bold">Subject</span>
                          <span className="text-xl text-white font-sans font-medium">{selectedLead.subject || 'No subject generated'}</span>
                        </div>
                        
                        <div className="space-y-6 text-base leading-relaxed tracking-wide text-white/90">
                          {isEditingSelectedLead ? (
                            <div className="space-y-4">
                              <div className="space-y-2">
                                <label className="block text-[10px] font-sans font-bold uppercase tracking-widest text-white/40">Edit Subject</label>
                                <input
                                  value={draftSubject}
                                  onChange={(e) => setDraftSubject(e.target.value)}
                                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-sans text-sm text-white outline-none transition-all focus:ring-2 focus:ring-blue-600"
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="block text-[10px] font-sans font-bold uppercase tracking-widest text-white/40">Edit Message</label>
                                <textarea
                                  value={draftMessage}
                                  onChange={(e) => setDraftMessage(e.target.value)}
                                  rows={12}
                                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-sans text-sm leading-relaxed text-white outline-none transition-all focus:ring-2 focus:ring-blue-600"
                                />
                              </div>
                            </div>
                          ) : selectedLead.message.trim() ? (
                            selectedLead.message.split('\n').map((para, i) => (
                              <p key={i}>{para}</p>
                            ))
                          ) : (
                            <p className="text-white/40">No message generated for this lead yet. Check Skip Reason / Debug Info above.</p>
                          )}
                        </div>
                      </div>

                      {/* Metrics overlay */}
                      <div className="hidden xl:flex absolute bottom-8 right-8 gap-4">
                        <div className="px-3 py-2 bg-brand-bg border border-brand-border rounded-md text-center min-w-[80px]">
                          <div className="text-[10px] text-white/30 uppercase font-bold tracking-widest mb-1 shadow-sm">Length</div>
                          <div className="text-xs font-mono text-white/80">{selectedLead.message.split(' ').length} words</div>
                        </div>
                        <div className="px-3 py-2 bg-brand-bg border border-brand-border rounded-md text-center min-w-[80px]">
                          <div className="text-[10px] text-white/30 uppercase font-bold tracking-widest mb-1 shadow-sm">Tone</div>
                          <div className="text-xs font-mono text-white/80">{campaign.tone_preference || 'Professional'}</div>
                        </div>
                        <div className="px-3 py-2 bg-green-900/20 border border-green-500/30 rounded-md text-center min-w-[80px]">
                          <div className="text-[10px] text-green-400 uppercase font-bold tracking-widest mb-1">Human</div>
                          <div className="text-xs font-mono text-green-400">9.8/10</div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-white/20 px-12 text-center bg-brand-bg">
                    <Target size={64} className="mb-4 opacity-5 animate-pulse" />
                    <p className="text-lg font-medium tracking-tight">Select a lead from the queue to review their draft</p>
                    <p className="text-sm text-white/10 mt-2">All {results?.length || 0} leads have been processed successfully.</p>
                  </div>
                )}
              </section>
            </motion.div>
            ) : (
              <motion.div
                key="settings"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 overflow-y-auto px-6 py-12"
              >
                <div className="max-w-4xl mx-auto space-y-12">
                   {currentUser && <UserSettings user={currentUser} />}
                   <div className="flex justify-center text-center mt-8">
                     <button 
                        onClick={() => setActiveStep(previousStepBeforeSettings)}
                        className="px-6 py-2 bg-white/5 border border-white/10 rounded-lg text-sm font-bold hover:bg-white/10 transition-all text-white/40 uppercase tracking-widest"
                      >
                        Back
                      </button>
                   </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </main>

      {/* Footer Bar */}
      <footer className="h-10 bg-brand-bg border-t border-brand-border px-8 flex items-center justify-between z-50 shrink-0">
        <div className="flex gap-4">
          <span className="text-[10px] text-white/30 uppercase tracking-widest font-bold">Model: Gemini-2.5-Flash</span>
          <span className="text-[10px] text-white/30 uppercase tracking-widest font-bold">API Status: <span className="text-green-500">Stable</span></span>
        </div>
        <span className="text-[10px] text-white/30 uppercase tracking-widest font-bold tracking-widest">© 2026 Outreach Intelligence</span>
      </footer>
    </div>
  );
}
