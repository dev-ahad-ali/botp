# Twilio Signup Automation (prototype)

A local Electron desktop tool with four tabs: **Configuration**, **Automation**, **Temp Mail**, and **Free Browser**. Playwright drives a separate headed Chromium window: one page is the real temp-mail website (address + inbox + OTP), and the other page is the Twilio signup flow.

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

- The selected temp-mail site in Configuration is a real website URL. On Start, the app opens that site in Playwright, copies the generated address from it, and reads the inbox from that same page.
- The Temp Mail tab lets you open/refresh the site, copy or regenerate the address, inspect messages, and wait for a verification code manually.
- Site-specific selectors live in `server/tempMail/generic.ts` and `server/tempMail/adapters.ts`. They are best-effort and meant for live tuning.
- The number API requires a `mauthapi` header. Enter it in Configuration as `mauthapi="token"`; **Test getnum** uses the value currently in the form. Click **Save settings** so automation uses it too. Without it, the API returns `401 missing mauthapi header`.
- Number parsing supports the observed response shape (`data.full_number`, `data.no_plus_number`, `data.national_number`) plus common flat fields.
- Twilio selectors in `server/automation/services/twilio.ts` are best-effort placeholders for live tuning.
- SMS verification is intentionally out of scope for this prototype; the flow stops after phone submission.

## Persistence

SQLite lives at `prisma/data/app.db`. Settings, ranges, providers, services, runs, and run logs are all stored there. Use the **Save settings** button in Configuration; values survive restarts.
