import React from 'react';
import { CampaignContext } from '../types';

interface CampaignFormProps {
  campaign: CampaignContext;
  onChange: (campaign: CampaignContext) => void;
}

export const CampaignForm: React.FC<CampaignFormProps> = ({ campaign, onChange }) => {
  const loadTestStrategy = () => {
    onChange({
      campaign_goal: 'Book 15-minute intro calls with local businesses that need more leads and better follow-up.',
      offer: 'We set up AI-assisted lead capture, follow-up emails, and simple CRM workflows for service businesses.',
      sender_name: 'Youssef',
      sender_company: 'LeadGenius AI',
      sender_email: 'innerpathbusiness@gmail.com',
      sender_context: 'We help small businesses stop losing leads by automating outreach and follow-up with a lightweight setup.',
      cta: 'Would you be open to a quick 15-minute call next week to see if this could fit your business?',
      tone_preference: 'Professional',
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    onChange({ ...campaign, [name]: value });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={loadTestStrategy}
          className="px-3 py-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 text-[10px] font-bold uppercase tracking-widest text-blue-400 transition-colors hover:bg-blue-500/20"
        >
          Load Test Strategy
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Sender Name</label>
          <input
            type="text"
            name="sender_name"
            value={campaign.sender_name}
            onChange={handleChange}
            className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none transition-all text-sm text-white placeholder:text-white/20"
            placeholder="John Doe"
          />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Sender Company</label>
          <input
            type="text"
            name="sender_company"
            value={campaign.sender_company}
            onChange={handleChange}
            className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none transition-all text-sm text-white placeholder:text-white/20"
            placeholder="Acme Inc."
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Campaign Goal</label>
        <textarea
          name="campaign_goal"
          value={campaign.campaign_goal}
          onChange={handleChange}
          rows={2}
          className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none transition-all text-sm text-white placeholder:text-white/20"
          placeholder="Boost demo bookings for our new lead management tool..."
        />
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Offer</label>
        <textarea
          name="offer"
          value={campaign.offer}
          onChange={handleChange}
          rows={2}
          className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none transition-all text-sm text-white placeholder:text-white/20"
          placeholder="A free 15-minute audit of their current sales process..."
        />
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Call to Action (CTA)</label>
        <input
          type="text"
          name="cta"
          value={campaign.cta}
          onChange={handleChange}
          className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none transition-all text-sm text-white placeholder:text-white/20"
          placeholder="Book a quick discovery call here: [link]"
        />
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Sender Context</label>
        <textarea
          name="sender_context"
          value={campaign.sender_context}
          onChange={handleChange}
          rows={2}
          className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none transition-all text-sm text-white placeholder:text-white/20"
          placeholder="I noticed your company was expanding..."
        />
      </div>
    </div>
  );
};
