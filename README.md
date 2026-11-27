# Twilio Signup Automation (prototype)

A local Electron desktop tool with five tabs: **Configuration**, **Automation**, **Service**, **Temp Mail Site**, and **Free Browser**. It uses the shadcn dark theme by default. Both the temp-mail website and the selected service are embedded with `WebContentsView` and driven through DOM automation in the main process. Zustand keeps renderer state (active tab, current URL, extracted email/code, flow stage) in sync while automation switches focus between tabs.

## Setup

```bash
npm install                             # postinstall also downloads Electron's binary
npm run db:setup                        # migrate + seed SQLite
npm run dev
```

`npm run typecheck` and `npm run build` are the fast verification commands. `npm run dist:dir` produces an unpacked packaged app.

## Notes

- Only one temp-mail site is seeded: **https://temp-mail.org/en/**. It is the sole option in the **Selected site** dropdown.
- On Start, the app reads the generated temp-mail address, opens the selected service, fills Twilio stage 1 (name, email, password, terms checkbox), and submits.
- The app watches the temp-mail inbox for the Twilio verification mail, opens the message link, extracts the code from the table/span, and fills Twilio stage 2.
- Stage 3 selects the country from the number API response (country name/code/dial code, with prefix matching against the page options), fills the national number, and submits it. The flow then resets to the signup URL.
- The **Temp Mail Site** tab shows the embedded website with **Extracted email** and **Extracted code** fields. **Delete address** starts the next attempt with a fresh email.
- The **Service** tab keeps its current URL in main-process state and the Zustand store, so switching tabs does not restart the form.
- Number parsing supports `data.full_number`, `data.no_plus_number`, `data.national_number`, country fields, and common flat shapes. The API still requires a `mauthapi` header (`mauthapi="token"`); **Test getnum** uses the unsaved form value.
- Service selectors live in `server/automation/services/twilio.ts`; temp-mail selectors live in `electron/tempMailView.ts`. Both are best-effort for live tuning.
- SMS verification is intentionally out of scope; the flow stops after phone submission.

## Persistence

SQLite lives at `prisma/data/app.db`. Settings, ranges, providers, services, runs, and run logs are stored there. Use **Save settings** in Configuration; values survive restarts.
