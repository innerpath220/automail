import React, { useMemo, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, GripVertical, KeyRound, Mail, Plus, Power, RefreshCw, Shield, Trash2 } from 'lucide-react';
import { User } from 'firebase/auth';
import { EmailServiceConnection, EmailServiceConnectionInput, EmailServiceType, SmtpProviderId } from '../types';
import { EMAIL_SERVICE_DEFINITIONS, SMTP_PROVIDER_DEFINITIONS, getServiceDefinition, getSmtpProviderDefinition } from '../lib/platform';
import { deleteEmailService, fetchEmailServices, saveEmailService, updateEmailService } from '../services/platformService';

interface UserSettingsProps {
  user: User | null;
  services: EmailServiceConnection[];
  onServicesChange: (services: EmailServiceConnection[]) => void;
  onOpenGuide: () => void;
}

type DraftState = {
  serviceType: EmailServiceType;
  displayName: string;
  senderName: string;
  senderEmail: string;
  smtpProvider: SmtpProviderId;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  publicKey: string;
  privateKey: string;
  serviceId: string;
  templateId: string;
  apiKey: string;
  smtpPassword: string;
  isActive: boolean;
};

type DraftCache = Record<EmailServiceType, DraftState>;

function buildDraft(serviceType: EmailServiceType = 'emailjs'): DraftState {
  const smtpProvider = 'gmail' as SmtpProviderId;
  const smtpPreset = getSmtpProviderDefinition(smtpProvider);
  return {
    serviceType,
    displayName: getServiceDefinition(serviceType).label,
    senderName: '',
    senderEmail: '',
    smtpProvider,
    smtpHost: smtpPreset.smtpHost,
    smtpPort: smtpPreset.smtpPort,
    smtpUser: '',
    publicKey: '',
    privateKey: '',
    serviceId: '',
    templateId: '',
    apiKey: '',
    smtpPassword: '',
    isActive: true,
  };
}

function buildDraftCache(): DraftCache {
  return {
    emailjs: buildDraft('emailjs'),
    brevo: buildDraft('brevo'),
    sendgrid: buildDraft('sendgrid'),
    resend: buildDraft('resend'),
    smtp: buildDraft('smtp'),
  };
}

function mapServiceToDraft(service: EmailServiceConnection): DraftState {
  const smtpProvider = (service.smtpProvider || 'gmail') as SmtpProviderId;
  const smtpPreset = getSmtpProviderDefinition(smtpProvider);
  return {
    serviceType: service.serviceType,
    displayName: service.displayName,
    senderName: service.senderName || '',
    senderEmail: service.senderEmail || '',
    smtpProvider,
    smtpHost: service.smtpHost || smtpPreset.smtpHost,
    smtpPort: service.smtpPort || smtpPreset.smtpPort,
    smtpUser: '',
    publicKey: '',
    privateKey: '',
    serviceId: '',
    templateId: '',
    apiKey: '',
    smtpPassword: '',
    isActive: service.isActive,
  };
}

function SecretField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  placeholder?: string;
  showSavedBadge?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className="text-[10px] font-bold uppercase tracking-widest text-white/35">{props.label}</label>
        {props.showSavedBadge && (
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
            Saved Value
          </span>
        )}
      </div>
      <div className="relative">
        <input
          type={props.visible ? 'text' : 'password'}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder={props.placeholder}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-24 text-sm text-white outline-none placeholder:text-white/30"
        />
        {props.visible && props.value && (
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(props.value)}
            className="absolute right-11 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-widest text-blue-300 hover:text-blue-200"
          >
            Copy
          </button>
        )}
        <button
          type="button"
          onClick={props.onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/45 hover:text-white/80"
        >
          {props.visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}

export const UserSettings: React.FC<UserSettingsProps> = ({ user, services, onServicesChange, onOpenGuide }) => {
  const [draft, setDraft] = useState<DraftState>(buildDraft());
  const [draftCache, setDraftCache] = useState<DraftCache>(buildDraftCache());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({});

  const activeCount = useMemo(() => services.filter((service) => service.isActive).length, [services]);
  const orderedServices = useMemo(
    () => [...services].sort((a, b) => a.priority - b.priority || a.displayName.localeCompare(b.displayName)),
    [services],
  );

  const updateDraft = (patch: Partial<DraftState>) => {
    setDraft((current) => {
      const next = { ...current, ...patch };
      if ('smtpProvider' in patch) {
        const preset = getSmtpProviderDefinition((patch.smtpProvider || current.smtpProvider) as SmtpProviderId);
        next.smtpHost = preset.smtpHost;
        next.smtpPort = preset.smtpPort;
      }
      setDraftCache((cache) => ({
        ...cache,
        [next.serviceType]: next,
      }));
      return next;
    });
  };

  const handleEdit = (service: EmailServiceConnection) => {
    setEditingId(service.id);
    const nextDraft = mapServiceToDraft(service);
    nextDraft.publicKey = service.revealedSecrets?.publicKey || '';
    nextDraft.privateKey = service.revealedSecrets?.privateKey || '';
    nextDraft.serviceId = service.revealedSecrets?.serviceId || '';
    nextDraft.templateId = service.revealedSecrets?.templateId || '';
    nextDraft.apiKey = service.revealedSecrets?.apiKey || '';
    nextDraft.smtpPassword = service.revealedSecrets?.smtpPassword || '';
    setDraft(nextDraft);
    setDraftCache((cache) => ({
      ...cache,
      [nextDraft.serviceType]: nextDraft,
    }));
    setMessage(null);
  };

  const resetForm = () => {
    setEditingId(null);
    const nextDraft = buildDraft(draft.serviceType);
    setDraft(nextDraft);
    setDraftCache((cache) => ({
      ...cache,
      [nextDraft.serviceType]: nextDraft,
    }));
  };

  const buildPayload = (): EmailServiceConnectionInput => ({
    serviceType: draft.serviceType,
    displayName: draft.displayName,
    senderName: draft.senderName,
    senderEmail: draft.senderEmail,
    smtpProvider: draft.serviceType === 'smtp' ? draft.smtpProvider : undefined,
    smtpHost: draft.serviceType === 'smtp' ? draft.smtpHost : undefined,
    smtpPort: draft.serviceType === 'smtp' ? draft.smtpPort : undefined,
    smtpUser: draft.serviceType === 'smtp' ? draft.smtpUser : undefined,
    isActive: draft.isActive,
    priority: editingId
      ? orderedServices.find((service) => service.id === editingId)?.priority ?? orderedServices.length
      : orderedServices.length,
    secrets: {
      publicKey: draft.publicKey,
      privateKey: draft.privateKey,
      serviceId: draft.serviceId,
      templateId: draft.templateId,
      apiKey: draft.apiKey,
      smtpPassword: draft.smtpPassword,
    },
  });

  const handleSave = async () => {
    if (!user) {
      setMessage({ type: 'error', text: 'Sign in first to manage email services.' });
      return;
    }

    try {
      setIsSaving(true);
      setMessage(null);
      const idToken = await user.getIdToken();
      const payload = buildPayload();
      const response = editingId
        ? await updateEmailService(idToken, editingId, payload)
        : await saveEmailService(idToken, payload);
      const refreshed = await fetchEmailServices(idToken);
      const savedService = refreshed.services.find((service) => service.id === response.service.id);

      if (payload.serviceType === 'emailjs' && payload.secrets.privateKey && !savedService?.secretStatus?.hasEmailJsPrivateKey) {
        throw new Error('EmailJS private key did not persist. Save failed. Try again or recreate the service.');
      }

      onServicesChange(refreshed.services);
      setMessage({ type: 'success', text: `${response.service.displayName} saved.` });
      setDraftCache((cache) => ({
        ...cache,
        [draft.serviceType]: buildDraft(draft.serviceType),
      }));
      resetForm();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to save service.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (serviceId: string) => {
    if (!user) {
      return;
    }

    try {
      const idToken = await user.getIdToken();
      await deleteEmailService(idToken, serviceId);
      onServicesChange(services.filter((service) => service.id !== serviceId));
      if (editingId === serviceId) {
        resetForm();
      }
      setMessage({ type: 'success', text: 'Service removed.' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to remove service.' });
    }
  };

  const handleToggleActive = async (service: EmailServiceConnection) => {
    if (!user) {
      return;
    }

    try {
      const idToken = await user.getIdToken();
      const response = await updateEmailService(idToken, service.id, { isActive: !service.isActive });
      onServicesChange(services.map((item) => (item.id === service.id ? response.service : item)));
      setMessage({
        type: 'success',
        text: `${response.service.displayName} ${response.service.isActive ? 'enabled' : 'disabled'} for rotation.`,
      });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to update service state.' });
    }
  };

  const handleReorder = async (sourceId: string, targetId: string) => {
    if (!user || sourceId === targetId) {
      return;
    }

    const sourceIndex = orderedServices.findIndex((service) => service.id === sourceId);
    const targetIndex = orderedServices.findIndex((service) => service.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) {
      return;
    }

    const nextOrdered = [...orderedServices];
    const [moved] = nextOrdered.splice(sourceIndex, 1);
    nextOrdered.splice(targetIndex, 0, moved);

    try {
      setMessage(null);
      const idToken = await user.getIdToken();
      await Promise.all(nextOrdered.map((service, index) => (
        updateEmailService(idToken, service.id, { priority: index })
      )));

      onServicesChange(nextOrdered.map((service, index) => ({ ...service, priority: index })));
      setMessage({ type: 'success', text: 'Rotation order updated. Services now run from top to bottom.' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to reorder services.' });
    } finally {
      setDraggingId(null);
    }
  };

  const currentServiceDefinition = getServiceDefinition(draft.serviceType);
  const currentSmtpDefinition = getSmtpProviderDefinition(draft.smtpProvider);
  const editingService = editingId ? services.find((service) => service.id === editingId) || null : null;

  const renderTextField = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    options?: { placeholder?: string; showSavedBadge?: boolean; copyable?: boolean }
  ) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className="text-[10px] font-bold uppercase tracking-widest text-white/35">{label}</label>
        {options?.showSavedBadge && (
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
            Saved Value
          </span>
        )}
      </div>
      <div className="relative">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={options?.placeholder}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-20 text-sm text-white outline-none placeholder:text-white/30"
        />
        {options?.copyable && value && (
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(value)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-widest text-blue-300 hover:text-blue-200"
          >
            Copy
          </button>
        )}
      </div>
    </div>
  );

  const toggleSecretVisibility = (field: string) => {
    setVisibleSecrets((current) => ({
      ...current,
      [field]: !current[field],
    }));
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="rounded-[32px] border border-brand-border bg-brand-surface p-8 shadow-2xl shadow-blue-950/20">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.3em] text-blue-400">
              <Shield size={12} />
              Email Services
            </div>
            <h2 className="mt-4 text-4xl font-black tracking-tight text-white">Connect multiple services and let the platform rotate automatically.</h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/55">
              Users can add EmailJS, Brevo, SendGrid, Resend, and SMTP accounts. Drag the list into your preferred top-to-bottom order. Rotation follows that exact order and keeps trying the next service until one works.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-white/35">Status</div>
            <div className="mt-2 text-3xl font-black text-white">{activeCount}</div>
            <div className="text-xs uppercase tracking-widest text-white/35">active services</div>
            <button
              onClick={onOpenGuide}
              className="mt-4 text-xs font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300"
            >
              Open Setup Guide
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-4">
          {orderedServices.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-white/10 bg-brand-surface p-8 text-center text-white/45">
              No email services connected yet. Add at least one service before sending.
            </div>
          ) : (
            orderedServices.map((service, index) => (
              <div
                key={service.id}
                draggable
                onDragStart={() => setDraggingId(service.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => void handleReorder(draggingId || '', service.id)}
                onDragEnd={() => setDraggingId(null)}
                className={`rounded-[28px] border bg-brand-surface p-6 ${draggingId === service.id ? 'border-blue-500/40 opacity-60' : 'border-brand-border'}`}
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-blue-400">
                      <GripVertical size={14} className="cursor-grab text-white/35" />
                      <span>#{index + 1}</span>
                      <Mail size={14} />
                      {service.displayName}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-white/50">
                      <span>{service.serviceType}</span>
                      <span>{service.usage.used}/{service.usage.limit ?? '∞'} used</span>
                      <span>{service.usage.remaining ?? '∞'} remaining</span>
                      <span>Resets {new Date(service.usage.resetAt).toLocaleString()}</span>
                      {service.serviceType === 'emailjs' && (
                        <span className={service.secretStatus?.hasEmailJsPrivateKey ? 'text-emerald-300' : 'text-amber-300'}>
                          {service.secretStatus?.hasEmailJsPrivateKey ? 'Private key saved' : 'Private key missing'}
                        </span>
                      )}
                    </div>
                    {service.lastFailureReason && (
                      <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                        {service.lastFailureReason}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => void handleToggleActive(service)}
                      className={`rounded-xl border px-4 py-2 text-xs font-bold uppercase tracking-widest ${
                        service.isActive
                          ? 'border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20'
                          : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20'
                      }`}
                    >
                      <Power size={12} className="mr-2 inline" />
                      {service.isActive ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      onClick={() => handleEdit(service)}
                      className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white/70 hover:bg-white/10"
                    >
                      <RefreshCw size={12} className="mr-2 inline" />
                      Edit
                    </button>
                    <button
                      onClick={() => void handleDelete(service.id)}
                      className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-red-300 hover:bg-red-500/20"
                    >
                      <Trash2 size={12} className="mr-2 inline" />
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="rounded-[28px] border border-brand-border bg-brand-surface p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/35">{editingId ? 'Edit Service' : 'Add Service'}</div>
              <h3 className="mt-2 text-2xl font-black text-white">{currentServiceDefinition.label}</h3>
            </div>
            {editingId && (
              <button
                onClick={resetForm}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white/65 hover:bg-white/10"
              >
                <Plus size={12} className="mr-2 inline" />
                New
              </button>
            )}
          </div>

          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-white/35">Service Type</label>
              <select
                value={draft.serviceType}
                onChange={(e) => {
                  const nextType = e.target.value as EmailServiceType;
                  setEditingId(null);
                  setDraft(draftCache[nextType] || buildDraft(nextType));
                }}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
              >
                {EMAIL_SERVICE_DEFINITIONS.map((service) => (
                  <option key={service.type} value={service.type} className="bg-black">
                    {service.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-white/35">Display Name</label>
                <input
                  value={draft.displayName}
                  onChange={(e) => updateDraft({ displayName: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-white/35">Sender Email</label>
                <input
                  value={draft.senderEmail}
                  onChange={(e) => updateDraft({ senderEmail: e.target.value })}
                  placeholder="you@company.com"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-white/35">Sender Name</label>
              <input
                value={draft.senderName}
                onChange={(e) => updateDraft({ senderName: e.target.value })}
                placeholder="Alex"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
              />
            </div>

            {editingService?.hasCredentials && (
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4 text-sm text-blue-100/80">
                Encrypted credentials are still saved for this service. Secret fields stay blank on edit for security.
                Enter a new value only if you want to replace the saved one.
              </div>
            )}

            {draft.serviceType === 'emailjs' && (
              <div className="grid gap-4">
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100/80">
                  Because rotation sends EmailJS from the backend, you must enable non-browser API access in EmailJS:
                  <span className="ml-1 font-bold text-white">Dashboard → Account → Security</span>.
                </div>
                {renderTextField(
                  'Public Key',
                  draft.publicKey,
                  (value) => updateDraft({ publicKey: value }),
                  { placeholder: editingService ? 'Saved value loaded.' : '', showSavedBadge: Boolean(editingService && draft.publicKey), copyable: true }
                )}
                <SecretField
                  label="Private Key (Needed for strict mode)"
                  value={draft.privateKey}
                  onChange={(value) => updateDraft({ privateKey: value })}
                  visible={Boolean(visibleSecrets.emailjsPrivateKey)}
                  onToggle={() => toggleSecretVisibility('emailjsPrivateKey')}
                  placeholder={editingService ? 'Saved value loaded.' : ''}
                  showSavedBadge={Boolean(editingService && draft.privateKey)}
                />
                {renderTextField(
                  'Service ID',
                  draft.serviceId,
                  (value) => updateDraft({ serviceId: value }),
                  { placeholder: editingService ? 'Saved value loaded.' : '', showSavedBadge: Boolean(editingService && draft.serviceId), copyable: true }
                )}
                {renderTextField(
                  'Template ID',
                  draft.templateId,
                  (value) => updateDraft({ templateId: value }),
                  { placeholder: editingService ? 'Saved value loaded.' : '', showSavedBadge: Boolean(editingService && draft.templateId), copyable: true }
                )}
              </div>
            )}

            {(draft.serviceType === 'brevo' || draft.serviceType === 'sendgrid' || draft.serviceType === 'resend') && (
              <SecretField
                label="API Key"
                value={draft.apiKey}
                onChange={(value) => updateDraft({ apiKey: value })}
                visible={Boolean(visibleSecrets.apiKey)}
                onToggle={() => toggleSecretVisibility('apiKey')}
                placeholder={
                  editingService
                    ? 'Saved value loaded.'
                    : draft.serviceType === 'brevo'
                      ? 'xkeysib-...'
                      : draft.serviceType === 'sendgrid'
                        ? 'SG....'
                        : 're_...'
                }
                showSavedBadge={Boolean(editingService && draft.apiKey)}
              />
            )}

            {draft.serviceType === 'smtp' && (
              <>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-white/35">Provider</label>
                  <select
                    value={draft.smtpProvider}
                    onChange={(e) => updateDraft({ smtpProvider: e.target.value as SmtpProviderId })}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
                  >
                    {SMTP_PROVIDER_DEFINITIONS.filter((provider) => provider.id !== 'custom').map((provider) => (
                      <option key={provider.id} value={provider.id} className="bg-black">
                        {provider.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4 text-sm text-blue-100/80">
                  {currentSmtpDefinition.helpText}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/35">SMTP Host</label>
                    <input value={draft.smtpHost} onChange={(e) => updateDraft({ smtpHost: e.target.value })} className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/35">SMTP Port</label>
                    <input value={draft.smtpPort} onChange={(e) => updateDraft({ smtpPort: e.target.value })} className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-white/35">SMTP Email</label>
                  <input value={draft.smtpUser} onChange={(e) => updateDraft({ smtpUser: e.target.value })} className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none" />
                </div>
                <SecretField
                  label="App Password"
                  value={draft.smtpPassword}
                  onChange={(value) => updateDraft({ smtpPassword: value })}
                  visible={Boolean(visibleSecrets.smtpPassword)}
                  onToggle={() => toggleSecretVisibility('smtpPassword')}
                  placeholder={editingService ? 'Saved value loaded.' : ''}
                  showSavedBadge={Boolean(editingService && draft.smtpPassword)}
                />
              </>
            )}

            <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/75">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(e) => updateDraft({ isActive: e.target.checked })}
                className="h-4 w-4 rounded border-white/20 bg-black/20"
              />
              Keep this service active in automatic rotation
            </label>

            {message && (
              <div className={`flex items-center gap-2 rounded-xl p-4 text-sm ${message.type === 'success' ? 'border border-green-500/20 bg-green-500/10 text-green-300' : 'border border-red-500/20 bg-red-500/10 text-red-300'}`}>
                {message.type === 'success' ? <CheckCircle2 size={16} /> : <KeyRound size={16} />}
                {message.text}
              </div>
            )}

            <button
              onClick={() => void handleSave()}
              disabled={isSaving}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-4 text-sm font-black uppercase tracking-widest text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
            >
              {isSaving ? <RefreshCw size={16} className="animate-spin" /> : <Plus size={16} />}
              {editingId ? 'Update Service' : 'Save Service'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
