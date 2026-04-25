import React, { useEffect, useState } from 'react';
import { CreditCard, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import { User } from 'firebase/auth';
import { PlanId, StripeCheckoutConfig, UserProfile } from '../types';
import { PLAN_DEFINITIONS, DEFAULT_STRIPE_CONFIG, getPlanDefinition } from '../lib/platform';
import { createCheckoutSession, createPortalSession, fetchStripeConfig } from '../services/platformService';

interface SubscriptionsPageProps {
  profile: UserProfile;
  user: User | null;
  onBack: () => void;
}

export const SubscriptionsPage: React.FC<SubscriptionsPageProps> = ({ profile, user, onBack }) => {
  const [stripeConfig, setStripeConfig] = useState<StripeCheckoutConfig>(DEFAULT_STRIPE_CONFIG);
  const [message, setMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<PlanId | 'portal' | null>(null);

  useEffect(() => {
    void fetchStripeConfig().then(setStripeConfig);
  }, []);

  const handleCheckout = async (planId: Exclude<PlanId, 'free'>) => {
    if (!user) {
      setMessage('Sign in first to upgrade your plan.');
      return;
    }

    try {
      setBusyKey(planId);
      setMessage(null);
      const idToken = await user.getIdToken();
      const session = await createCheckoutSession(idToken, planId);
      window.location.href = session.url;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to start checkout.');
    } finally {
      setBusyKey(null);
    }
  };

  const handlePortal = async () => {
    if (!user) {
      setMessage('Sign in first to manage billing.');
      return;
    }

    try {
      setBusyKey('portal');
      setMessage(null);
      const idToken = await user.getIdToken();
      const session = await createPortalSession(idToken, profile.stripeCustomerId);
      window.location.href = session.url;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to open billing portal.');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="rounded-[32px] border border-brand-border bg-brand-surface p-8 shadow-2xl shadow-blue-950/20">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.3em] text-blue-400">
              <Sparkles size={12} />
              AI Generations
            </div>
            <div>
              <h1 className="text-4xl font-black tracking-tight text-white">Pay only for AI generation. Sending stays on your own connected accounts.</h1>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/55">
                Every generated message costs 1 generation. Email sending limits are separate and come from the services your users connect.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-white/35">Current Plan</div>
            <div className="mt-2 text-3xl font-black text-white">{getPlanDefinition(profile.planId).name}</div>
            <div className="mt-1 text-xs uppercase tracking-widest text-blue-400">{profile.subscriptionStatus}</div>
            <div className="mt-3 text-sm text-white/65">
              {profile.remainingGenerations} generations left this month
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-white/35">Used This Month</div>
            <div className="mt-2 text-3xl font-black text-white">{profile.usedGenerationsThisPeriod}</div>
            <p className="mt-1 text-xs text-white/50">Messages already generated this billing cycle.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-white/35">Monthly Limit</div>
            <div className="mt-2 text-3xl font-black text-white">{profile.monthlyGenerationLimit}</div>
            <p className="mt-1 text-xs text-white/50">Resets every month after renewal or downgrade reset.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-white/35">Billing</div>
            <div className="mt-2 flex items-center gap-2 text-white">
              <ShieldCheck size={18} className="text-blue-400" />
              <span className="text-sm font-bold">{stripeConfig.ready ? 'Stripe Ready' : 'Stripe Not Configured'}</span>
            </div>
            <p className="mt-1 text-xs text-white/50">Hosted Stripe checkout and billing portal only.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {PLAN_DEFINITIONS.filter(p => p.id !== 'owner').map((plan) => {
          const isCurrent = profile.planId === plan.id;
          const isPaid = plan.id !== 'free';
          const canCheckout = isPaid && stripeConfig.checkoutEnabled && Boolean(stripeConfig.plans[plan.id as Exclude<PlanId, 'free'>]);
          return (
            <div
              key={plan.id}
              className={`rounded-[28px] border p-6 shadow-xl ${isCurrent ? 'border-blue-500/30 bg-blue-500/10 shadow-blue-950/30' : 'border-brand-border bg-brand-surface'}`}
            >
              <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/35">{plan.id}</div>
              <h2 className="mt-3 text-3xl font-black text-white">{plan.name}</h2>
              <div className="mt-2 text-4xl font-black text-white">{plan.monthlyPriceUsd === 0 ? '$0' : `$${plan.monthlyPriceUsd}`}</div>
              <div className="text-xs uppercase tracking-widest text-white/35">{plan.monthlyPriceUsd === 0 ? 'forever' : 'per month'}</div>
              <p className="mt-4 text-sm leading-relaxed text-white/55">{plan.description}</p>
              <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
                {plan.monthlyGenerationLimit} generations / month
              </div>
              <div className="mt-6">
                {isCurrent ? (
                  <button
                    disabled
                    className="flex w-full items-center justify-center rounded-2xl border border-blue-500/30 bg-blue-600/20 px-4 py-3 text-sm font-bold uppercase tracking-widest text-blue-300"
                  >
                    Current Plan
                  </button>
                ) : isPaid ? (
                  <button
                    onClick={() => void handleCheckout(plan.id as Exclude<PlanId, 'free'>)}
                    disabled={!canCheckout || busyKey === plan.id}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold uppercase tracking-widest text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
                  >
                    {busyKey === plan.id ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
                    {canCheckout ? plan.cta : 'Checkout Not Active'}
                  </button>
                ) : (
                  <button
                    disabled
                    className="flex w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold uppercase tracking-widest text-white/50"
                  >
                    Free Included
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-[28px] border border-brand-border bg-brand-surface p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-xl font-bold text-white">Manage subscription</h3>
            <p className="mt-2 text-sm text-white/55">Billing changes go through Stripe-hosted pages. Nothing sensitive is handled in-app.</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => void handlePortal()}
              disabled={!stripeConfig.portalEnabled || !profile.stripeCustomerId || busyKey === 'portal'}
              className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold uppercase tracking-widest text-white transition-colors hover:bg-white/10 disabled:opacity-40"
            >
              {busyKey === 'portal' ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
              Billing Portal
            </button>
            <button
              onClick={onBack}
              className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold uppercase tracking-widest text-white/65 transition-colors hover:bg-white/10 hover:text-white"
            >
              Back
            </button>
          </div>
        </div>

        {message && (
          <div className="mt-4 rounded-2xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-200">
            {message}
          </div>
        )}
      </div>
    </div>
  );
};
