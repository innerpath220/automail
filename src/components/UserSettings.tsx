import React, { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { CheckCircle2, Loader2, Save, Settings } from 'lucide-react';
import { db } from '../lib/firebase';
import { SmtpSettings } from '../types';

interface UserSettingsProps {
  user: User;
}

const defaultSmtpSettings: SmtpSettings = {
  smtpHost: '',
  smtpPort: '587',
  smtpUser: '',
  smtpPass: '',
  senderName: '',
  senderEmail: '',
};

export const UserSettings: React.FC<UserSettingsProps> = ({ user }) => {
  const isGuestUser = user.uid === 'guest-user';
  const [smtpSettings, setSmtpSettings] = useState<SmtpSettings>(defaultSmtpSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      if (isGuestUser) {
        setIsLoading(false);
        return;
      }

      try {
        const docRef = doc(db, `users/${user.uid}/settings/smtp`);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setSmtpSettings({
            ...defaultSmtpSettings,
            ...(docSnap.data() as Partial<SmtpSettings>),
          });
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, [isGuestUser, user.uid]);

  const handleSave = async () => {
    if (isGuestUser) {
      setMessage({ type: 'error', text: 'Guest mode cannot save SMTP settings.' });
      return;
    }

    setIsSaving(true);
    setMessage(null);
    try {
      await setDoc(doc(db, `users/${user.uid}/settings/smtp`), smtpSettings);
      setMessage({ type: 'success', text: 'Settings saved successfully!' });
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage({ type: 'error', text: 'Failed to save settings.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setSmtpSettings((prev) => ({ ...prev, [name]: value }));
  };

  const handleSyncGoogle = () => {
    setSmtpSettings((prev) => ({
      ...prev,
      senderName: user.displayName || prev.senderName,
      senderEmail: user.email || prev.senderEmail,
      smtpUser: user.email || prev.smtpUser,
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between border-b border-brand-border pb-6">
        <div className="flex items-center gap-3">
          <Settings className="text-blue-500" size={24} />
          <h2 className="text-xl font-bold tracking-tight text-white">Direct Send (SMTP)</h2>
        </div>
        <button
          onClick={handleSyncGoogle}
          className="text-[10px] px-3 py-1.5 bg-white/5 border border-white/10 rounded font-bold uppercase tracking-widest hover:bg-white/10 transition-colors"
        >
          Sync from Google
        </button>
      </div>

      {isGuestUser && (
        <div className="p-4 rounded-xl border border-yellow-500/20 bg-yellow-500/10">
          <p className="text-[10px] text-yellow-400 leading-relaxed uppercase tracking-widest font-bold mb-1">Guest Mode</p>
          <p className="text-xs text-yellow-100/60">
            Draft generation works in guest mode. SMTP saving and direct send require a signed-in account.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">SMTP Host</label>
          <input
            type="text"
            name="smtpHost"
            value={smtpSettings.smtpHost}
            onChange={handleChange}
            placeholder="smtp.gmail.com"
            className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none transition-all text-sm text-white"
          />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">SMTP Port</label>
          <input
            type="text"
            name="smtpPort"
            value={smtpSettings.smtpPort}
            onChange={handleChange}
            placeholder="587"
            className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none transition-all text-sm text-white"
          />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">SMTP Username</label>
          <input
            type="text"
            name="smtpUser"
            value={smtpSettings.smtpUser}
            onChange={handleChange}
            placeholder="user@example.com"
            className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none transition-all text-sm text-white"
          />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">SMTP Password / App Key</label>
          <input
            type="password"
            name="smtpPass"
            value={smtpSettings.smtpPass}
            onChange={handleChange}
            placeholder="SMTP app password"
            className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none transition-all text-sm text-white"
          />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Sender Display Name</label>
          <input
            type="text"
            name="senderName"
            value={smtpSettings.senderName}
            onChange={handleChange}
            placeholder="John Doe"
            className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none transition-all text-sm text-white"
          />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Sender Email Address</label>
          <input
            type="email"
            name="senderEmail"
            value={smtpSettings.senderEmail}
            onChange={handleChange}
            placeholder="john@example.com"
            className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none transition-all text-sm text-white"
          />
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-lg flex items-center gap-2 ${message.type === 'success' ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
          {message.type === 'success' && <CheckCircle2 size={16} />}
          <span className="text-sm">{message.text}</span>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={isSaving || isGuestUser}
        className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
        Save SMTP Settings
      </button>

      <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
        <p className="text-[10px] text-yellow-400 leading-relaxed uppercase tracking-widest font-bold mb-1">Optional Upgrade</p>
        <p className="text-xs text-yellow-100/60 mb-2">
          SMTP credentials are only required if you want to use the <strong>Auto-Send</strong> button on the dashboard.
        </p>
        <p className="text-xs text-yellow-100/60">
          You can skip this entirely and use the <strong>"Send via Mail App"</strong> button for free to send drafts from your local computer.
        </p>
      </div>
    </div>
  );
};
