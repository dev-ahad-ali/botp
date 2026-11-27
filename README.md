# Twilio Signup Automation (prototype)

A local Electron desktop tool with five tabs: **Configuration**, **Automation**, **Service**, **Temp Mail Site**, and **Free Browser**. It uses the shadcn dark theme by default. The temp-mail website and the selected service are embedded in the app with `WebContentsView`; the temp-mail page is driven through DOM automation in the main process. Playwright drives a separate headed Chromium window only for the Twilio signup flow.

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

- The selected temp-mail site in Configuration is a real website URL. On Start, the app loads it in the embedded view, copies the generated address from the DOM, and reads the inbox from that same view.
- The **Temp Mail Site** tab shows the embedded website inside the app, with fields for the extracted email and extracted code.
- The **Service** tab embeds the selected service (Twilio by default, opening `https://www.twilio.com/try-twilio`). Account creation automation will be added later.
- Only one temp-mail site is seeded: **https://temp-mail.org/en/**. It is the sole option in the **Selected site** dropdown; click **Open site** to persist and open it in the embedded tab. No site-name, search, or add-site fields remain.
- Temp-mail selectors live in `electron/tempMailView.ts`. They are best-effort and meant for live tuning.
- The number API requires a `mauthapi` header. Enter it in Configuration as `mauthapi="token"`; **Test getnum** uses the value currently in the form. Click **Save settings** so automation uses it too. Without it, the API returns `401 missing mauthapi header`.
- Number parsing supports the observed response shape (`data.full_number`, `data.no_plus_number`, `data.national_number`) plus common flat fields.
- Twilio selectors in `server/automation/services/twilio.ts` are best-effort placeholders for live tuning.
- SMS verification is intentionally out of scope for this prototype; the flow stops after phone submission.

## Persistence

SQLite lives at `prisma/data/app.db`. Settings, ranges, providers, services, runs, and run logs are all stored there. Use the **Save settings** button in Configuration; values survive restarts.
