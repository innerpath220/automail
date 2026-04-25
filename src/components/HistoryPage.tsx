import React from 'react';
import { Clock3, Mail, Building2 } from 'lucide-react';
import { SendHistoryEntry } from '../types';

interface HistoryPageProps {
  entries: SendHistoryEntry[];
  onBack: () => void;
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export const HistoryPage: React.FC<HistoryPageProps> = ({ entries, onBack }) => {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="rounded-[32px] border border-brand-border bg-brand-surface p-8 shadow-2xl shadow-blue-950/20">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.3em] text-blue-400">
              <Clock3 size={12} />
              Send History
            </div>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-white">Review what this account has already sent.</h1>
            <p className="mt-2 text-sm leading-relaxed text-white/55">
              This history is stored locally on this device for the current logged-in account.
            </p>
          </div>
          <button
            onClick={onBack}
            className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold uppercase tracking-widest text-white/65 transition-colors hover:bg-white/10 hover:text-white"
          >
            Back
          </button>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-[28px] border border-brand-border bg-brand-surface p-10 text-center text-white/45">
          No sent email history yet.
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map((entry) => (
            <div key={entry.id} className="rounded-[28px] border border-brand-border bg-brand-surface p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-blue-400">
                    <Mail size={14} />
                    {entry.toEmail}
                  </div>
                  <h2 className="text-xl font-bold text-white">{entry.subject}</h2>
                  <div className="flex flex-wrap gap-4 text-xs text-white/45">
                    <span className="inline-flex items-center gap-1">
                      <Clock3 size={12} />
                      {formatTimestamp(entry.sentAt)}
                    </span>
                    {entry.companyName && (
                      <span className="inline-flex items-center gap-1">
                        <Building2 size={12} />
                        {entry.companyName}
                      </span>
                    )}
                    <span>{entry.providerLabel || entry.provider}</span>
                    {entry.senderEmail && <span>{entry.senderEmail}</span>}
                  </div>
                </div>
              </div>
              <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm leading-relaxed text-white/75 whitespace-pre-line">
                {entry.message}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
