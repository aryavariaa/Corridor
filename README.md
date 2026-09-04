This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Analytics

Two layers, deliberately separate:

- **Plausible** (`app/layout.tsx`) — privacy-friendly pageview counts, no config needed.
- **Amplitude** (`lib/analytics.ts`) — behavioral/funnel tracking, since Plausible only gives pageviews. Initialized client-side only, and only when `NEXT_PUBLIC_AMPLITUDE_API_KEY` is set (see `.env.example`); with no key it's a silent no-op, so it's safe to leave unset in local dev.

  Tracked events, in funnel order:
  1. `Corridor Viewed` — a corridor's comparison results actually load (send/receive country + currency, tier).
  2. `Rate Alert Signup Started` — first genuine focus of the email field for the currently viewed corridor.
  3. `Rate Alert Signup Completed` — the subscribe request to Buttondown succeeds.
  4. `Rate Alert Signup Failed` — the subscribe request fails, with the error reason.

  Submissions caught by the subscribe endpoint's honeypot/bot check (`app/api/subscribe/route.ts`) are never sent to Amplitude, even though the server still returns a fake success to the bot — so the funnel only reflects real visitors.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
