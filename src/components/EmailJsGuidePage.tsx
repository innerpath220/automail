import React from 'react';
import { ArrowRight, CheckCircle2, HelpCircle, Layers3, Mail, Shield, TriangleAlert, Wrench } from 'lucide-react';

interface EmailJsGuidePageProps {
  onContinue: () => void;
  onMarkSeen: () => void;
}

type GuideSection = {
  badge: string;
  title: string;
  limit: string;
  steps: string[];
  details: string[];
  diagram: string[];
};

const sections: GuideSection[] = [
  {
    badge: 'EmailJS',
    title: 'EmailJS setup',
    limit: '200 emails / month',
    steps: [
      'Create a free EmailJS account and log in.',
      'Create an email service and connect the mailbox you want to send from.',
      'Create one template for outreach and note the Template ID.',
      'Open Account > API Keys and copy your Public Key.',
      'If strict mode is enabled, copy the Private Key too, then paste Public Key, Private Key, Service ID, and Template ID into Settings > EmailJS.',
    ],
    details: [
      'Recommend watching the official EmailJS tutorial video if the dashboard is unfamiliar.',
      'Use template variables like `to_email`, `subject`, `message`, `message_html`, `from_name`, and `reply_to`.',
      'Enable non-browser API access in EmailJS Dashboard > Account > Security because Automail rotates EmailJS from the server.',
      'If EmailJS strict mode is enabled, the backend must also send the EmailJS Private Key as `accessToken`.',
      'EmailJS free plan uses a monthly limit, so rotation should move away once 200 sends are reached.',
    ],
    diagram: [
      'Email Services',
      '  -> My Services',
      '     -> service_xxx',
      '  -> Email Templates',
      '     -> template_xxx',
      'Account',
      '  -> API Keys',
      '     -> Public Key',
      '     -> Private Key (strict mode)',
    ],
  },
  {
    badge: 'Brevo',
    title: 'Brevo / Sendinblue setup',
    limit: '300 emails / day',
    steps: [
      'Create a free Brevo account.',
      'Open SMTP & API and generate a new API key.',
      'Copy the API key and store it in Settings > Brevo.',
      'Save a verified sender email address in Settings > Brevo and verify it inside Brevo before sending.',
    ],
    details: [
      'Brevo rotation uses your transactional email API key only.',
      'Daily limits reset automatically the next UTC day inside the platform.',
    ],
    diagram: [
      'Top Right Menu',
      '  -> SMTP & API',
      '     -> API Keys',
      '        -> Generate New Key',
    ],
  },
  {
    badge: 'SendGrid',
    title: 'SendGrid setup',
    limit: '100 emails / day',
    steps: [
      'Create a free Twilio SendGrid account.',
      'Open Settings > API Keys and create an API key with Mail Send access.',
      'Copy the API key and paste it into Settings > SendGrid.',
      'Verify your sender identity inside SendGrid before using it.',
    ],
    details: [
      'Use a full-access Mail Send key, not a read-only key.',
      'The platform switches to SendGrid automatically after Brevo if it is connected and available.',
    ],
    diagram: [
      'Settings',
      '  -> API Keys',
      '     -> Create API Key',
      'Sender Authentication',
      '  -> Verify Sender',
    ],
  },
  {
    badge: 'Resend',
    title: 'Resend setup',
    limit: '100 emails / day',
    steps: [
      'Create a free Resend account.',
      'Add and verify a sending domain or sender identity inside Resend.',
      'Open API Keys and create a new API key.',
      'Copy the API key and paste it into Settings > Resend.',
      'Save the same verified sender email in Settings > Resend before sending.',
    ],
    details: [
      'The backend sends through Resend with its email API.',
      'The platform uses your saved sender email as the `from` address.',
      'Resend free accounts currently allow 100 emails per day and 3,000 per month.',
    ],
    diagram: [
      'Domains',
      '  -> Add Domain',
      '  -> Verify DNS',
      'API Keys',
      '  -> Create API Key',
    ],
  },
  {
    badge: 'Gmail SMTP',
    title: 'Gmail SMTP setup',
    limit: '500 emails / day',
    steps: [
      'Enable 2-Step Verification on your Google account first.',
      'Open Google Account > Security > App Passwords.',
      'Generate an app password for Mail or a custom app label.',
      'In Settings > SMTP choose Gmail, then enter your Gmail address and the app password.',
    ],
    details: [
      'Your regular Gmail password will not work here.',
      'Gmail SMTP uses host `smtp.gmail.com` and port `587` in the platform by default.',
    ],
    diagram: [
      'Google Account',
      '  -> Security',
      '     -> 2-Step Verification',
      '     -> App Passwords',
    ],
  },
  {
    badge: 'Outlook SMTP',
    title: 'Outlook / Hotmail SMTP setup',
    limit: '300 emails / day',
    steps: [
      'Enable 2-factor authentication on your Microsoft account.',
      'Generate an app password from the Security settings.',
      'In Settings > SMTP choose Outlook / Hotmail.',
      'Enter your Outlook address and the generated app password.',
    ],
    details: [
      'Outlook SMTP uses host `smtp.office365.com` and port `587` by default.',
      'Use an app password rather than your normal Microsoft login password.',
    ],
    diagram: [
      'Microsoft Account',
      '  -> Security',
      '     -> Advanced Security Options',
      '        -> Create App Password',
    ],
  },
  {
    badge: 'Yahoo SMTP',
    title: 'Yahoo SMTP setup',
    limit: '500 emails / day',
    steps: [
      'Enable 2-factor authentication on Yahoo first.',
      'Open Account Security and generate an app password.',
      'In Settings > SMTP choose Yahoo.',
      'Enter your Yahoo email address and the generated app password.',
    ],
    details: [
      'Yahoo SMTP uses host `smtp.mail.yahoo.com` and port `587` by default.',
      'Do not use your regular Yahoo password here.',
    ],
    diagram: [
      'Yahoo Account',
      '  -> Account Security',
      '     -> Two-step verification',
      '     -> Generate app password',
    ],
  },
];

const faq = [
  'Why is my email not sending? Check credentials first, then confirm not all connected services have hit their limits.',
  'Can I connect multiple services at the same time? Yes. It is recommended for maximum free capacity.',
  'Is my API key and password safe? Credentials are stored per user and encrypted before they are persisted.',
  'What happens when I run out of AI generations? Message generation is blocked until the plan resets or the user upgrades.',
  'What happens when all my email services hit their limit? Sending stops until reset or until more services are connected.',
  'Can I switch between services manually? Rotation is handled automatically by the platform.',
  'Why do I need an app password for SMTP? Major providers require app passwords for secure third-party SMTP access.',
  'Which service should I connect first? Connect all supported services for maximum capacity and best rotation coverage.',
];

const troubleshooting = [
  'Authentication failed: wrong credentials, expired key, or wrong app password. Regenerate and update Settings.',
  'Daily limit exceeded on all services: every connected daily service is exhausted. Wait until tomorrow or add more services.',
  'Monthly limit exceeded: EmailJS hit its monthly cap. Wait for next month or rely on other connected services.',
  'Connection timeout: check internet access, provider availability, or switch provider by letting rotation continue.',
  'Invalid EmailJS keys: verify Service ID, Template ID, and Public Key exactly as shown in EmailJS.',
  'Invalid API key: regenerate the Brevo, SendGrid, or Resend key and save the new one.',
];

export const EmailJsGuidePage: React.FC<EmailJsGuidePageProps> = ({ onContinue, onMarkSeen }) => {
  return (
    <div className="flex-1 overflow-y-auto bg-brand-bg px-6 py-12">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="rounded-[32px] border border-brand-border bg-brand-surface p-8 shadow-2xl shadow-blue-950/20 md:p-10">
          <div className="max-w-5xl space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.3em] text-blue-400">
              <Mail size={12} />
              Full Setup Guide
            </div>

            <div className="space-y-4">
              <h1 className="text-4xl font-black tracking-tight text-white md:text-6xl">
                Connect every service once. Then let automatic rotation do the work.
              </h1>
              <p className="max-w-4xl text-lg leading-relaxed text-white/55">
                Platform limits are only for AI message generations. Email sending limits are separate, belong to each connected provider, and rotate automatically in this order:
                <span className="ml-2 font-bold text-white">EmailJS → Brevo → SendGrid → Resend → SMTP</span>.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.25em] text-white/30">AI Limits</div>
                <div className="text-lg font-bold text-white">Generations only</div>
                <p className="mt-2 text-sm leading-relaxed text-white/50">Free: 20/month. Starter: 200/month. Pro: 2000/month.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.25em] text-white/30">Send Limits</div>
                <div className="text-lg font-bold text-white">Provider-based</div>
                <p className="mt-2 text-sm leading-relaxed text-white/50">Daily or monthly sending caps are enforced per connected service.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.25em] text-white/30">Capacity Tip</div>
                <div className="text-lg font-bold text-white">Connect all services</div>
                <p className="mt-2 text-sm leading-relaxed text-white/50">Users can reach 1500+ daily sends for free when all supported services are connected.</p>
              </div>
            </div>
          </div>
        </div>

        {sections.map((section) => (
          <div key={section.badge} className="rounded-[28px] border border-brand-border bg-brand-surface p-8">
            <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-blue-400">
                  {section.badge}
                </div>
                <h2 className="mt-4 text-3xl font-black text-white">{section.title}</h2>
                <p className="mt-2 text-sm uppercase tracking-widest text-emerald-300">{section.limit}</p>

                <div className="mt-6 space-y-3">
                  {section.steps.map((step, index) => (
                    <div key={step} className="flex gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white/80">
                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-black text-white">
                        {index + 1}
                      </div>
                      <div>{step}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 space-y-3">
                  {section.details.map((detail) => (
                    <div key={detail} className="flex gap-3 text-sm text-white/60">
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-400" />
                      <div>{detail}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-black/20 p-6">
                <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white/40">
                  <Layers3 size={16} />
                  Visual Diagram
                </div>
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-5 font-mono text-sm leading-7 text-white/80">
                  {section.diagram.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}

        <div className="grid gap-8 lg:grid-cols-2">
          <div className="rounded-[28px] border border-brand-border bg-brand-surface p-8">
            <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white/40">
              <HelpCircle size={16} />
              FAQ
            </div>
            <div className="mt-5 space-y-4">
              {faq.map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white/75">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-brand-border bg-brand-surface p-8">
            <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white/40">
              <Wrench size={16} />
              Troubleshooting
            </div>
            <div className="mt-5 space-y-4">
              {troubleshooting.map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white/75">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-amber-500/20 bg-amber-500/10 p-8">
          <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-amber-300">
            <TriangleAlert size={16} />
            Understanding Limits
          </div>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-amber-100/85">
            <p>Our platform limits are only about AI message generations per month.</p>
            <p>Email sending limits are completely separate and depend on the connected provider accounts.</p>
            <p>If one service reaches its limit, the platform automatically switches to the next available service.</p>
            <p>If all services are exhausted, sending stops until reset or until the user connects more services.</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            onClick={() => {
              onMarkSeen();
              onContinue();
            }}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-8 py-4 text-sm font-black uppercase tracking-[0.25em] text-white transition-all hover:bg-blue-700"
          >
            Back To App
            <ArrowRight size={16} />
          </button>
          <button
            onClick={onMarkSeen}
            className="rounded-2xl border border-white/10 bg-white/5 px-8 py-4 text-sm font-black uppercase tracking-[0.25em] text-white/50 transition-all hover:bg-white/10 hover:text-white/80"
          >
            Hide Guide Next Time
          </button>
        </div>
      </div>
    </div>
  );
};
