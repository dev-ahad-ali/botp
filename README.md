# Twilio Signup Automation (prototype)

A local Electron desktop tool with three tabs: **Configuration**, **Automation**, and **Free Browser**. Playwright drives a separate headed Chromium window for the Twilio flow; the automation tab is the control panel and live log.

## Setup

```bash
npm install
node node_modules/electron/install.js   # only if electron's binary was skipped
npm run db:setup                        # migrate + seed SQLite
npx playwright install chromium         # one-time browser download
npm run dev
```

`npm run typecheck` and `npm run build` are the fast verification commands. `npm run dist:dir` produces an unpacked packaged app.

## Notes

- The seed script reads the provider/range lists directly from `setps.md`, so there is only one copy of those lists.
- `mailbucket` and `tempmail-sdk` provide real inboxes and OTP polling. `maily-client` is not published on npm, so it is not wired in yet.
- The selected temp-mail "site" is cosmetic: it is stored on each run for logging, but the package pool decides the actual inbox.
- Number API response parsing supports common shapes (`number`, `num`, `data.number`, `phone`, or a raw string). Adjust `server/numbers/client.ts` when the real shape is confirmed.
- Twilio selectors in `server/automation/services/twilio.ts` are best-effort placeholders for live tuning.
- SMS verification is intentionally out of scope for this prototype; the flow stops after phone submission.

## Persistence

SQLite lives at `prisma/data/app.db`. Settings, ranges, providers, services, runs, and run logs are all stored there. Use the **Save settings** button in Configuration; values survive restarts.
