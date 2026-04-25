# Automail AI

AI-generated outreach platform with:

- monthly AI generation limits by plan
- Stripe subscriptions for `free`, `starter`, and `pro`
- encrypted per-user email service credentials
- automatic send rotation across `EmailJS -> Brevo -> SendGrid -> Resend -> SMTP`
- dashboard visibility into remaining generations and provider limits

## Local run

Prerequisites:

- Node.js
- Firebase project config in `firebase-applet-config.json`
- Stripe keys if you want live billing
- `SMTP_SETTINGS_ENCRYPTION_KEY` for encrypted provider secrets

Setup:

1. Install dependencies with `npm install`
2. Copy `.env.example` to `.env.local`
3. Fill in at least:
   - `GROQ_API_KEY`
   - `SMTP_SETTINGS_ENCRYPTION_KEY`
4. If the frontend is deployed on static hosting like GitHub Pages, also set:
   - `VITE_BILLING_API_BASE_URL` to your deployed backend origin
5. Add Stripe keys and price IDs if billing should work locally
6. Start the app with `npm run dev`

AI generation defaults to `Groq` through `AI_PROVIDER=groq`. The default model is `llama-3.3-70b-versatile`, and you can override it with `GROQ_MODEL`.

## Main Firestore data

- `users/{userId}/profile/main`
  - plan, subscription status, monthly generation usage, Stripe metadata
- `users/{userId}/emailServices/{serviceId}`
  - encrypted provider credentials, active status, usage counters, last failure state

## Supported sending services

- EmailJS: `200/month`
- Brevo: `300/day`
- SendGrid: `100/day`
- Resend: `100/day`
- Gmail SMTP: `500/day`
- Outlook SMTP: `300/day`
- Yahoo SMTP: `500/day`

## Billing model

- Free: `20` AI generations/month
- Starter: `200` AI generations/month
- Pro: `2000` AI generations/month

Email sending uses user-owned provider credentials. Pricing covers AI generation only.

## GitHub Pages note

GitHub Pages can only host the frontend. It cannot serve this app's `/api/*` routes.

If you deploy the UI to GitHub Pages, you must also deploy the Express backend somewhere else and set `VITE_BILLING_API_BASE_URL` to that backend origin during the Pages build. Otherwise the frontend will try to call `/api/*` on `github.io`, which causes broken auth-adjacent account loads, lead processing, billing, and email sending.
