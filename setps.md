# Twilio Signup Automation Tool — Implementation Doc

**Version:** 0.1 (Prototype)
**Stack:** Electron · React · shadcn/ui · Playwright · SQLite (Prisma)
**First service:** Twilio (modular — more services later)
**Goal:** A working prototype base that demonstrates the full loop end-to-end. Twilio selectors will be tuned after live testing; this doc focuses on the parts we already know work.

---

## 1. Overview

The app is a local desktop tool with **three tabs**:

| # | Tab | Purpose |
|---|-----|---------|
| 1 | **Configuration** | Select a temp-mail service (cosmetic), configure the number API (URL + auth header), manage the range list, select a target service (Twilio first) |
| 2 | **Automation** | Control panel: Start / Stop, live status, step log, per-run stats. Playwright drives a separate Chromium window that shows the actual Twilio flow |
| 3 | **Free Browser** | Plain browser for the user (URL bar + embedded `WebContentsView`) — no automation, sign in to whatever else they want |

The **only** thing the automation loop depends on from tab 1 is:
- The number API URL + auth header (used to fetch a phone number)
- The list of ranges (either a single selected range or full rotation)
- The selected temp-mail *label* (logged, purely cosmetic)
- The selected target service (Twilio for now)

The actual temp-mail inbox, OTP receipt and code extraction are handled entirely by wrapper packages (`mailbucket`, `tempmail-sdk`, `maily-client`). The user-selected "site" is a label in a SQLite table — nothing else.

---

## 2. Tech Stack

| Layer | Choice |
|-------|--------|
| Shell | Electron (≥ 30 for `WebContentsView`) |
| Renderer UI | React 18 + shadcn/ui + Tailwind |
| State | Zustand or simple React context (prototype) |
| Automation | Playwright (Chromium, headed) |
| DB | SQLite via Prisma |
| Build | Vite + electron-builder (or electron-vite) |
| IPC | Electron `contextBridge` + `ipcMain`/`ipcRenderer` |

---

## 3. Architecture Diagram

```
┌───────────────────────────────────────────────────────────────┐
│ Electron Main Window                                          │
│                                                               │
│  ┌────────────┐   ┌───────────────┐   ┌────────────────────┐  │
│  │ Config Tab │   │ Automation Tab│   │ Free Browser Tab   │  │
│  │ (React)    │   │ (React + log) │   │ (WebContentsView)  │  │
│  └────────────┘   └───────────────┘   └────────────────────┘  │
│         │                │                                    │
│         └── IPC ─────────┤                                    │
└─────────────────────────┼─────────────────────────────────────┘
                          │
          ┌───────────────┼────────────────┐
          │               │                │
          ▼               ▼                ▼
   ┌────────────┐  ┌────────────┐   ┌─────────────┐
   │ Prisma DB  │  │ Automation │   │ Temp Mail   │
   │ (SQLite)   │  │  Engine    │   │ Package Pool│
   └────────────┘  └─────┬──────┘   └─────────────┘
                         │
                         ▼
                  ┌──────────────┐
                  │  Playwright  │   ← drives a separate
                  │  Chromium    │     headed Chromium window
                  └──────────────┘     (the "Twilio browser")
```

**Prototype note:** the Playwright browser is a **separate OS window**, not embedded. The Automation tab shows logs and controls. Embedding via CDP is listed under Future Extensions.

---

## 4. Directory Structure

```
twilio-automation/
├─ electron/
│  ├─ main.ts                 # BrowserWindow, WebContentsView, IPC handlers
│  ├─ preload.ts              # contextBridge API surface
│  └─ tabs/freeBrowser.ts     # WebContentsView management for tab 3
├─ src/                       # React renderer
│  ├─ App.tsx
│  ├─ tabs/ConfigTab.tsx
│  ├─ tabs/AutomationTab.tsx
│  ├─ tabs/FreeBrowserTab.tsx
│  ├─ components/ui/…         # shadcn
│  └─ lib/ipc.ts              # typed ipc wrappers
├─ server/                    # runs in Electron main process
│  ├─ db.ts                   # Prisma client singleton
│  ├─ config.ts               # read/write settings
│  ├─ mailPool/
│  │  ├─ types.ts             # MailPackage interface
│  │  ├─ mailbucket.ts
│  │  ├─ tempmailsdk.ts
│  │  ├─ maily.ts
│  │  └─ pool.ts              # pickPackage + reportResult
│  ├─ numbers/
│  │  └─ client.ts            # POST getnum
│  ├─ generators.ts           # random name/pass/email helpers
│  └─ automation/
│     ├─ engine.ts            # main loop
│     ├─ types.ts             # AutomationService interface
│     ├─ registry.ts          # service registry (Twilio only for now)
│     └─ services/
│        └─ twilio.ts         # Twilio adapter
├─ prisma/
│  ├─ schema.prisma
│  └─ seed.ts
├─ package.json
└─ README.md
```

---

## 5. Data Model (Prisma Schema)

`prisma/schema.prisma`:

```prisma
generator client { provider = "prisma-client-js" }
datasource db    { provider = "sqlite"; url = "file:./data/app.db" }

model Setting {
  key   String @id
  value String
}

// Purely cosmetic — the automation does NOT read adapter info from here.
model TempMailProvider {
  id        Int      @id @default(autoincrement())
  name      String
  domain    String   @unique
  enabled   Boolean  @default(true)
  isBuiltin Boolean  @default(false)
  sortOrder Int      @default(0)
  createdAt DateTime @default(now())
}

// Range rows; "display" is what the user sees (with XXX),
// "prefix" is what gets sent as `rid`.
model Range {
  id        Int      @id @default(autoincrement())
  display   String   @unique
  prefix    String
  enabled   Boolean  @default(true)
  sortOrder Int      @default(0)
  createdAt DateTime @default(now())
}

model Service {
  id        Int      @id @default(autoincrement())
  key       String   @unique   // "twilio"
  name      String             // "Twilio"
  enabled   Boolean  @default(true)
}

model Run {
  id               Int       @id @default(autoincrement())
  serviceKey       String
  providerId       Int?
  rangeId          Int?
  status           String    // running | success | failed | stopped
  startedAt        DateTime  @default(now())
  endedAt          DateTime?
  error            String?
  logs             RunLog[]
}

model RunLog {
  id        Int      @id @default(autoincrement())
  runId     Int
  run       Run      @relation(fields: [runId], references: [id], onDelete: Cascade)
  level     String
  message   String
  data      String?
  createdAt DateTime @default(now())
}
```

---

## 6. Seed Data

`prisma/seed.ts` populates:

### 6.1 Services (initial)

```ts
await prisma.service.createMany({
  data: [{ key: 'twilio', name: 'Twilio', enabled: true }],
});
```

### 6.2 Settings (initial placeholders — user fills these in Config tab)

```ts
await prisma.setting.createMany({
  data: [
    { key: 'number_api_url',    value: 'https://api.2oo9.cloud/MXS47FLFX0U/tness/@public/api/getnum' },
    { key: 'number_api_header', value: '' },   // e.g. mauthapi="<token>"
    { key: 'selected_range_id', value: '' },   // '' = rotate all
    { key: 'selected_tempmail_id', value: '' },
    { key: 'selected_service',  value: 'twilio' },
  ],
});
```

### 6.3 Temp Mail Providers — decorative list

Seed every domain from `Temp mail provider list.txt` with `isBuiltin = true`, `enabled = true`. A compact seed snippet:

```ts
const TEMPMAIL_SEED = [
  '10minutemail.pro','1secmail.com','1tempsms.com','33mail.co','5minutemail.com',
  'adguardtemp.com','alias.email','anonaddy.net','anonymail.io','anonyops.com',
  'anymail.pw','armyspy.com','binnedmail.com','blockimail.com','bouncemail.com',
  'burner.email','byom.de','canarymail.com','catch-all.email','cloaked.email',
  'cowabunga.email','crocovo.net','cryptclear.com','cthash.com','daddymail.com',
  'dayrep.com','deadfake.com','desu-mail.com','disposable-address.com',
  'disposableemail.com','disposableinbox.net','dontregret.com','duckmail.org',
  'e4ward.com','emailfake.com','emailgenerator.org','emailsac.com','emailsucks.net',
  'emailtmp.com','emailu.com','fake-mail.org','fakemailgenerator.com',
  'fastmail.com','forwardmail.net','get1mail.com','getdispostable.com','giga4u.com',
  'gmx-free.com','goemail.io','grandemail.com','harakiri-mail.com','hey.ninja',
  'hide-mail.com','hotfake.com','iheartspam.org','incognitomail.net','inboxbear.com',
  'incognitomail.io','instant-mail.de','jetable.net','kickassfacts.com','klickemail.com',
  'kurze.link','lifeguardhq.com','mail-berry.com','mail.acrivia.com','mail.tm-en.com',
  'mail2tor.com','mailcv.com','maildebris.com','maildrop.net','mailfreeonline.com',
  'mailguard.me','mailinator.net','mailismagic.com','mailnesia.com','mailsac.com',
  'mailsi.ru','mailtemporaire.com','mailtrash.net','manysms.com','meowmail.com',
  'mexem.com','minutely.com','misemail.com','mobiweb.cz','mohmal.com','moment.im',
  'monkeymail.net','mrandmrsmith.com','mydispostable.com','mymailbox.online',
  'mytemp.email','neomailbox.com','neotxt.net','no-spam.ws','notmyemail.com',
  'nowmyemail.com','nukemail.com','onewaymail.com','onlinesmsbox.com',
  'opentemporarymail.com','ownmail.net','papermail.io','passmail.net',
  'petitmail.net','planet-n.com','pookmail.com','postale.io','privacy.net',
  'protonalias.com','quickinbox.net','random-mail.org','rcpt.at','realfakeemail.com',
  'recyclemail.com','redditsms.com','refmail.com','rhylemc.com','roketmail.org',
  'safe-mail.net','safemail.io','selfdestructemail.com','send-free-sms.com',
  'shademail.com','shitmail.org','short-term.email','simplemail.io','slopsbox.com',
  'smailpro.net','spam-me.com','spam4.me','spamgourmet.com','spammotel.com',
  'spybox.de','startfresh.io','stayanonymous.net','stripmyemail.com',
  'temporary-address.com','temporaryinbox.com','tempemail.biz','tempemail.co',
  'tempemail.id','tempemail.lol','tempemail.net','tempemail.org','tempmail.com',
  'tempmail.net','tempmailbox.com','tempomail.com','tempsy.com','tempumail.net',
  'textguard.com','the-one-hand.com','throwaway.email','throwawaymail.net',
  'tmailor.net','trash-mail.com','trashmail.net','truemail.io','tryemailaddress.com',
  'tubemail.com','uglymail.com','verytemp.com','vippemail.com','webcontactinfo.com',
  'webmail.ms','whatismyip.com','whoemail.com','whyspam.com','yopmail.net',
  'zerospam.email','zippymail.com','1pad.de','2ndemail.com','365temp.com','4mail.pw',
  '5ymail.com','6paq.com','7mail.io','9xemail.com','a1.net','abcemail.biz','abuse.net',
  'accessyour.email.com','actionemail.net','adcomail.com','aftermail.com',
  'aliaspost.com','all2easy.com','amilegit.com','anon-email.net','anondotmail.com',
  'avoidspam.com','b1gmai1.com','bagmail.com','bigfoot.com',
];

await prisma.tempMailProvider.createMany({
  data: TEMPMAIL_SEED.map((domain, i) => ({
    name: domain.replace(/\..*$/, ''),
    domain,
    isBuiltin: true,
    sortOrder: i,
  })),
  skipDuplicates: true,
});
```

> Note: Many of these will be dead domains. That is fine — **the list is decorative**. The dropdown never resolves to the actual domain.

### 6.4 Ranges — real list with prefixes

Parse each entry: `display` as-is, `prefix` = strip trailing `X`s.

```ts
const RANGE_SEED = [
  '99277XXX','25777XXX','22870XXX','22898XXX','50234XXX','22365XXX','37533XXX',
  '22890XXX','29170XXX','22501XXX','25565XXX','23674XXX','29175XXX','21627XXX',
  '23276XXX','23278XXX','229019XXX','22465XXX','9377XXX','22897XXX','22891XXX',
  '4037XXX','95942XXX','22395XXX','99210XXX','26134XXX','26138XXX','26136XXX',
  '234805XXX','99622XXX','99677XXX','99665XXX','96657XXX','96656XXX','26667XXX',
  '26664XXX','95926XXX','26669XXX','23762XXX','35462XXX','25477XXX','96477XXX',
  '25577XXX','380917XXX','38091XXX','26668XXX','228713XXX','225013XXX','225070XXX',
  '2235XXX','2236XXX','95944XXX','9376XXX','229016XXX','628183XXX','628560XXX',
  '21277XXX','593996XXX','628182XXX','62818XXX','22362XXX','237622XXX','22367XXX',
  '22896XXX','25676XXX','99870XXX','99877XXX','23058XXX','85531XXX','2666XXX',
  '99250XXX','25886XXX','97798XXX','22784XXX','6017XXX','25675XXX','49176XXX',
  '24384XXX','245966XXX','24596XXX','63954XXX','99650XX','99670XXX','96773XXX',
  '977985XXX','29877XXX','24912XXX','35989XXX','99410XXX','59266XXX','22395625321',
  '26138XXXX','992508XXXX','228719XXXX','223652XXXX','9927716XXXX','228986XXXX',
  '9618157XXXX','3598938XXXX','228987XXXX','2246531XXX','225011361XXXX',
  '25477067XXXX','6017574XXXX','3749582XXXX','4037276XXXX','97797016XXXX',
  '2289958XXXX','21891XXX','38093XXX','24165XXXX',
];

const stripX = (d: string) => d.replace(/X+$/, '');

await prisma.range.createMany({
  data: RANGE_SEED.map((d, i) => ({
    display: d,
    prefix: stripX(d),
    sortOrder: i,
  })),
  skipDuplicates: true,
});
```

> The list has duplicates and a few entries that are already full numbers — that is fine. `skipDuplicates` handles repeats; `stripX` is a no-op for those.

---

## 7. Core Modules

### 7.1 Config Service (`server/config.ts`)

```ts
export async function getConfig() {
  const rows = await prisma.setting.findMany();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}
export async function setConfig(key: string, value: string) {
  return prisma.setting.upsert({
    where: { key }, create: { key, value }, update: { value },
  });
}
```

### 7.2 Temp Mail Package Pool (`server/mailPool/`)

**Interface (`types.ts`):**

```ts
export interface MailPackage {
  key: string;
  createInbox(): Promise<{ address: string; session: unknown }>;
  waitForOtp(session: unknown, timeoutMs?: number): Promise<string | null>;
  dispose(session: unknown): Promise<void>;
}
```

**`mailbucket.ts`** — example wrapper (repeat pattern for `tempmailsdk.ts`, `maily.ts`):

```ts
import { MailBucket } from 'mailbucket';
import type { MailPackage } from './types';

export class MailBucketPackage implements MailPackage {
  key: string;
  private client: MailBucket;

  constructor(provider: string) {
    this.key = `mailbucket:${provider}`;
    this.client = new MailBucket({ provider });
  }

  async createInbox() {
    const inbox = await this.client.createInbox();
    return { address: inbox.address, session: inbox.id };
  }

  async waitForOtp(session: string, timeoutMs = 180_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const msgs = await this.client.getMessages(session);
      for (const m of msgs) {
        const hit = `${m.subject}\n${m.body}`.match(/\b(\d{6})\b/);
        if (hit) return hit[1];
      }
      await new Promise(r => setTimeout(r, 4000));
    }
    return null;
  }

  async dispose() { /* optionally delete inbox */ }
}
```

**Pool (`pool.ts`):** keeps a small in-memory map of package instances, rotates for reliability, tracks health.

```ts
import { MailBucketPackage } from './mailbucket';
import type { MailPackage } from './types';

const PACKAGES: Record<string, MailPackage> = {
  'mailbucket:mailtm':     new MailBucketPackage('mailtm'),
  'mailbucket:1secmail':   new MailBucketPackage('1secmail'),
  // 'tempmail-sdk:mailgw': new SdkPackage('mailgw'),
  // 'maily-client:guerrilla': new MailyPackage('guerrilla'),
};

const health: Record<string, { fails: number; cooldownUntil: number; active: number }> = {};
Object.keys(PACKAGES).forEach(k => (health[k] = { fails: 0, cooldownUntil: 0, active: 0 }));

export function pickPackage(): MailPackage {
  const now = Date.now();
  const eligible = Object.values(PACKAGES).filter(p => {
    const h = health[p.key];
    return h.cooldownUntil < now && h.active < 3;
  });
  const chosen = eligible.length
    ? eligible[Math.floor(Math.random() * eligible.length)]
    : Object.values(PACKAGES)[0];
  health[chosen.key].active++;
  return chosen;
}

export function reportPackageResult(key: string, ok: boolean) {
  const h = health[key];
  h.active = Math.max(h.active - 1, 0);
  if (ok) h.fails = 0;
  else { h.fails++; h.cooldownUntil = Date.now() + h.fails * 120_000; }
}
```

### 7.3 Number API Client (`server/numbers/client.ts`)

```ts
export async function getNumber(cfg: {
  url: string; headerRaw: string; rid: string;
}): Promise<string> {
  // headerRaw e.g.: mauthapi="abc123"
  const [hName, hVal] = parseHeader(cfg.headerRaw);

  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [hName]: hVal },
    body: JSON.stringify({ rid: cfg.rid }),
  });
  if (!res.ok) throw new Error(`getnum HTTP ${res.status}`);
  const data = await res.json();

  // The exact response shape is unknown; support common shapes:
  const number =
    data.number ?? data.num ?? data.data?.number ?? data.phone ??
    (typeof data === 'string' ? data : null);
  if (!number) throw new Error(`getnum: unrecognized response ${JSON.stringify(data)}`);
  return String(number);
}

function parseHeader(raw: string): [string, string] {
  const m = raw.match(/^\s*([^=]+?)\s*=\s*"?(.*?)"?\s*$/);
  if (!m) throw new Error('Invalid header format (expected key="value")');
  return [m[1].trim(), m[2].trim()];
}
```

> **Assumption to verify against the real API:** the response returns a field containing the number. Update `getNumber` once observed. Also, `rid` is sent as the **prefix** (trailing `X`s stripped) per your instruction.

### 7.4 Random Generators (`server/generators.ts`)

```ts
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export const randomPassword = (len = 16) =>
  Array.from({ length: len }, () => ALNUM[Math.floor(Math.random() * ALNUM.length)]).join('');

const FIRST_NAMES = ['James','Olivia','Liam','Emma','Noah','Ava','Ethan','Mia','Lucas','Zoe'];
const LAST_NAMES  = ['Smith','Johnson','Brown','Davis','Miller','Wilson','Moore','Taylor'];
export const randomFirstName = () => FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
export const randomLastName  = () => LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
```

### 7.5 Automation Service Interface (`server/automation/types.ts`)

```ts
import type { Page } from 'playwright';

export interface RunContext {
  page: Page;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  rangeDisplay: string;           // e.g. "99277XXX"
  getOtp: () => Promise<string>;  // resolves to 6-digit code
  log: (msg: string, data?: any) => Promise<void>;
  stop: () => boolean;
}

export interface AutomationService {
  key: string;        // "twilio"
  name: string;       // "Twilio"
  startUrl: string;
  run(ctx: RunContext): Promise<void>;
}
```

### 7.6 Twilio Adapter (`server/automation/services/twilio.ts`)

This is deliberately simple and modular. Selectors are best-effort; tune after live testing.

```ts
import type { AutomationService, RunContext } from '../types';

export const twilioService: AutomationService = {
  key: 'twilio',
  name: 'Twilio',
  startUrl: 'https://www.twilio.com/try-twilio',

  async run(ctx) {
    const { page, email, password, firstName, lastName, phone, getOtp, log, stop } = ctx;

    // 1. Landing page → signup
    await page.goto(this.startUrl, { waitUntil: 'domcontentloaded' });
    await page.getByRole('link', { name: /get started|sign up/i }).first()
      .click().catch(() => page.goto('https://www.twilio.com/try-twilio'));

    // 2. Signup form
    await page.getByLabel(/first name/i).fill(firstName);
    await page.getByLabel(/last name/i).fill(lastName);
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);

    // First checkbox (terms/consent)
    const cb = page.locator('input[type="checkbox"]').first();
    if (!(await cb.isChecked())) await cb.check();

    await page.getByRole('button', { name: /submit|next|continue|start/i })
      .first().click();
    await log('signup form submitted');

    // 3. Email OTP
    await log('waiting for email OTP…');
    const otp = await getOtp();
    await page.getByRole('textbox').first().fill(otp);
    await page.getByRole('button', { name: /submit|verify|next|continue/i })
      .first().click();
    await log(`email OTP accepted: ${otp}`);

    // 4. Phone number
    //    Actual Twilio UI often splits country select from number input;
    //    this is the placeholder to tune live:
    const phoneInput = page.getByRole('textbox', { name: /phone|number/i }).first();
    await phoneInput.fill(phone);
    await page.getByRole('button', { name: /submit|verify|next|continue/i })
      .first().click();
    await log(`phone submitted: ${phone}`);

    // Prototype stop point — SMS verification is a known unknown (see §13).
    if (stop()) return;
  },
};
```

### 7.7 Service Registry (`server/automation/registry.ts`)

```ts
import { twilioService } from './services/twilio';
import type { AutomationService } from './types';

export const SERVICES: Record<string, AutomationService> = {
  twilio: twilioService,
};
```

Future services (e.g. `stripe`, `github`) drop in here and appear in the Config tab automatically.

### 7.8 Engine (`server/automation/engine.ts`)

The loop. Called from the Automation tab's Start button.

```ts
import { chromium, Browser } from 'playwright';
import { pickPackage, reportPackageResult } from '../mailPool/pool';
import { getNumber } from '../numbers/client';
import { getConfig } from '../config';
import { randomPassword, randomFirstName, randomLastName } from '../generators';
import { SERVICES } from './registry';

let running = false;
let browser: Browser | null = null;
let shouldStop = false;

export async function startAutomation(onEvent: (e: any) => void) {
  if (running) return;
  running = true;
  shouldStop = false;

  const cfg = await getConfig();
  const service = SERVICES[cfg.selected_service || 'twilio'];
  if (!service) throw new Error(`Unknown service: ${cfg.selected_service}`);

  const ranges = await prisma.range.findMany({ where: { enabled: true }, orderBy: { sortOrder: 'asc' } });
  if (!ranges.length) throw new Error('No ranges configured');

  const selectedRangeId = cfg.selected_range_id ? Number(cfg.selected_range_id) : null;
  const rotation = selectedRangeId
    ? ranges.filter(r => r.id === selectedRangeId)
    : ranges;

  browser = await chromium.launch({ headless: false });
  let attempt = 0;

  while (!shouldStop) {
    const range = rotation[attempt % rotation.length];
    attempt++;

    const run = await prisma.run.create({
      data: { serviceKey: service.key, rangeId: range.id, status: 'running',
              providerId: cfg.selected_tempmail_id ? Number(cfg.selected_tempmail_id) : null },
    });
    const log = async (msg: string, data?: any) => {
      await prisma.runLog.create({ data: { runId: run.id, level: 'info', message: msg, data: data ? JSON.stringify(data) : null } });
      onEvent({ type: 'log', runId: run.id, message: msg, data });
    };

    const pkg = pickPackage();
    let inbox: { address: string; session: unknown } | null = null;

    try {
      onEvent({ type: 'run:start', runId: run.id, range: range.display, pkg: pkg.key });

      const phone = await getNumber({
        url: cfg.number_api_url,
        headerRaw: cfg.number_api_header,
        rid: range.prefix,
      });
      await log(`phone fetched: ${phone}`);

      inbox = await pkg.createInbox();
      await log(`inbox created: ${inbox.address}`);

      const page = await browser.newPage();
      const ctx = {
        page,
        email: inbox.address,
        password: randomPassword(16),
        firstName: randomFirstName(),
        lastName: randomLastName(),
        phone,
        rangeDisplay: range.display,
        getOtp: async () => {
          const otp = await pkg.waitForOtp(inbox!.session, 180_000);
          if (!otp) throw new Error('OTP timeout');
          return otp;
        },
        log,
        stop: () => shouldStop,
      };

      await service.run(ctx);
      await page.close();

      await prisma.run.update({ where: { id: run.id }, data: { status: 'success', endedAt: new Date() } });
      reportPackageResult(pkg.key, true);
      onEvent({ type: 'run:done', runId: run.id, status: 'success' });
    } catch (err: any) {
      await prisma.run.update({ where: { id: run.id }, data: { status: 'failed', endedAt: new Date(), error: String(err) } });
      reportPackageResult(pkg.key, false);
      onEvent({ type: 'run:done', runId: run.id, status: 'failed', error: String(err) });
    } finally {
      if (inbox) await pkg.dispose(inbox.session).catch(() => {});
    }
  }

  await browser.close();
  browser = null;
  running = false;
}

export function stopAutomation() { shouldStop = true; }
```

---

## 8. Electron Layer

### 8.1 Main process (`electron/main.ts`)

Responsibilities:
- Create the main `BrowserWindow` (React UI)
- Create and manage the **Free Browser tab**'s `WebContentsView`
- Register IPC handlers that proxy into `server/` modules
- Stream automation events to the renderer via `webContents.send`

```ts
import { app, BrowserWindow, WebContentsView, ipcMain } from 'electron';
import path from 'node:path';
import { startAutomation, stopAutomation } from '../server/automation/engine';
import { getConfig, setConfig } from '../server/config';
import * as dbOps from '../server/dbOps'; // thin CRUD wrappers for providers/ranges/services

let win: BrowserWindow;
let freeBrowserView: WebContentsView | null = null;

async function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await win.loadURL('http://localhost:5173'); // Vite dev, or file://dist in prod
}

// ---- Free Browser Tab ----
ipcMain.handle('freeBrowser:attach', async (_e, url: string) => {
  if (!freeBrowserView) {
    freeBrowserView = new WebContentsView({ webPreferences: { sandbox: true } });
    win.contentView.addChildView(freeBrowserView);
  }
  const [w, h] = win.getContentSize();
  freeBrowserView.setBounds({ x: 0, y: 120, width: w, height: h - 120 });
  await freeBrowserView.webContents.loadURL(url || 'https://www.google.com');
});
ipcMain.handle('freeBrowser:navigate', (_e, url: string) =>
  freeBrowserView?.webContents.loadURL(url));
ipcMain.handle('freeBrowser:detach', () => {
  if (freeBrowserView) { win.contentView.removeChildView(freeBrowserView); freeBrowserView = null; }
});

// ---- Config ----
ipcMain.handle('config:get',  () => getConfig());
ipcMain.handle('config:set',  (_e, k: string, v: string) => setConfig(k, v));

// ---- Providers / Ranges / Services CRUD ----
ipcMain.handle('providers:list',  () => dbOps.listProviders());
ipcMain.handle('providers:add',   (_e, p) => dbOps.addProvider(p));
ipcMain.handle('providers:setEnabled', (_e, id, en) => dbOps.setProviderEnabled(id, en));

ipcMain.handle('ranges:list',     () => dbOps.listRanges());
ipcMain.handle('ranges:add',      (_e, r) => dbOps.addRange(r));
ipcMain.handle('ranges:setEnabled', (_e, id, en) => dbOps.setRangeEnabled(id, en));

ipcMain.handle('services:list',   () => dbOps.listServices());

// ---- Automation ----
ipcMain.handle('automation:start', async () => {
  await startAutomation((evt) => win.webContents.send('automation:event', evt));
});
ipcMain.handle('automation:stop',  async () => stopAutomation());

app.whenReady().then(createWindow);
```

### 8.2 Preload (`electron/preload.ts`)

```ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    set: (k: string, v: string) => ipcRenderer.invoke('config:set', k, v),
  },
  providers: {
    list: () => ipcRenderer.invoke('providers:list'),
    add: (p: any) => ipcRenderer.invoke('providers:add', p),
    setEnabled: (id: number, en: boolean) => ipcRenderer.invoke('providers:setEnabled', id, en),
  },
  ranges: {
    list: () => ipcRenderer.invoke('ranges:list'),
    add: (r: any) => ipcRenderer.invoke('ranges:add', r),
    setEnabled: (id: number, en: boolean) => ipcRenderer.invoke('ranges:setEnabled', id, en),
  },
  services: { list: () => ipcRenderer.invoke('services:list') },
  automation: {
    start: () => ipcRenderer.invoke('automation:start'),
    stop:  () => ipcRenderer.invoke('automation:stop'),
    onEvent: (cb: (e: any) => void) =>
      ipcRenderer.on('automation:event', (_e, evt) => cb(evt)),
  },
  freeBrowser: {
    attach: (url: string) => ipcRenderer.invoke('freeBrowser:attach', url),
    navigate: (url: string) => ipcRenderer.invoke('freeBrowser:navigate', url),
    detach: () => ipcRenderer.invoke('freeBrowser:detach'),
  },
});
```

---

## 9. UI — Three Tabs

Wrap in shadcn `<Tabs>` in `App.tsx`. The **Free Browser tab** only renders when active, otherwise the `WebContentsView` overlays nothing.

### 9.1 Config Tab (`tabs/ConfigTab.tsx`)

Sections (each a shadcn `Card`):

| Section | Controls |
|---------|----------|
| **Target service** | `<Select>` from `services.list` (Twilio only for now) |
| **Temp mail (cosmetic)** | `<Select>` from `providers.list`, searchable; plus "Add" form to insert a new decorative name |
| **Number API** | `<Input>` for URL, `<Input>` for header (`mauthapi="…"`) |
| **Range** | `<Select>` with "Rotate all" + individual ranges; "Add range" form (accepts `99277XXX`, stores `display` and derived `prefix`) |

On save: `api.config.set('selected_service', …)` etc. Store `selected_range_id` as string (`''` for rotate-all).

### 9.2 Automation Tab (`tabs/AutomationTab.tsx`)

Layout:
- Top bar: `Start` / `Stop` buttons, current status badge, running attempt counter
- Left pane: current-run summary (range, phone, email, temp-mail label selected in config)
- Right pane: streaming log (append on `automation:event`)

```tsx
useEffect(() => {
  window.api.automation.onEvent((e) => {
    if (e.type === 'log')       setLogs(l => [...l, e.message]);
    if (e.type === 'run:start') setCurrent({ runId: e.runId, range: e.range, pkg: e.pkg });
    if (e.type === 'run:done')  setCurrent(null);
  });
}, []);

<Button onClick={() => window.api.automation.start()}>Start</Button>
<Button variant="destructive" onClick={() => window.api.automation.stop()}>Stop</Button>
```

The actual Twilio browsing happens in **Playwright's Chromium window** (separate OS window). The Automation tab is the control panel. This is the prototype trade-off; see §14.

### 9.3 Free Browser Tab (`tabs/FreeBrowserTab.tsx`)

React renders a URL bar + back/forward/refresh at the top (height 120 px). The `WebContentsView` is attached by IPC **below** that region (`y: 120`). On tab activation: `window.api.freeBrowser.attach(lastUrl)`; on tab deactivation: `window.api.freeBrowser.detach()`.

```tsx
const [url, setUrl] = useState('https://www.google.com');
const [active, setActive] = useState(false);

useEffect(() => {
  if (active) window.api.freeBrowser.attach(url);
  return () => { if (active) window.api.freeBrowser.detach(); };
}, [active]);

<Input value={url} onChange={e => setUrl(e.target.value)}
       onKeyDown={e => e.key === 'Enter' && window.api.freeBrowser.navigate(url)} />
<Button onClick={() => setActive(true)}>Load</Button>
```

---

## 10. Build Steps (for the agent — ordered)

Follow in order. Each step ends with a concrete verification.

1. **Scaffold Electron + Vite + React + TS.**
   - Verify: `npm run dev` opens an empty window.
2. **Add shadcn/ui** with Tailwind. Install `Tabs`, `Card`, `Input`, `Select`, `Button`, `Badge`, `Textarea`.
   - Verify: render three tabs with placeholder content.
3. **Set up Prisma + SQLite.**
   - `npx prisma init --datasource-provider sqlite`
   - Add models from §5.
   - `npx prisma migrate dev --name init`
   - Verify: `data/app.db` exists.
4. **Write and run `prisma/seed.ts`** with §6 data.
   - Verify: `TempMailProvider` row count matches seed list; `Range` rows have correct `prefix`.
5. **Implement `server/config.ts`** and IPC handlers. Wire the Config tab to read/write.
   - Verify: set a value in the UI, restart the app, value persists.
6. **Implement `server/mailPool/`** with the `MailBucketPackage`. Add a tiny dev-only IPC `mailPool:smokeTest` that creates an inbox and logs the address.
   - Verify: pressing a "Test inbox" button prints a live email address.
7. **Implement `server/numbers/client.ts`** plus a `numbers:smokeTest` IPC. Verify against the real API once with a single known range.
   - Verify: response parses into a phone number string.
8. **Implement generators.** Unit-test with a tiny script.
9. **Implement `AutomationService` interface, `twilioService`, registry.** Keep the Twilio selectors as placeholders you can tune.
10. **Implement `server/automation/engine.ts`.**
    - Verify: pressing Start opens Chromium, navigates to Twilio, fills the first form. Stop closes the loop cleanly.
11. **Wire Automation tab** to `Start`/`Stop` and the event stream.
    - Verify: log lines stream live; runs appear in `Run` table.
12. **Implement the Free Browser tab** with `WebContentsView`.
    - Verify: user can navigate to any site, back/forward works, tab detach hides the view.
13. **Polish:**
    - Disable Start while running, disable Stop while idle.
    - Show the currently selected decorative temp-mail name in the Automation header (per user illusion).
    - Optional: show last 20 runs from the DB in a small table.
14. **Package:** `electron-builder` with `asarUnpack` for Prisma's native engine and the seed DB.

---

## 11. Test Plan (prototype acceptance)

| # | Test | Expected |
|---|------|----------|
| 1 | Config persists across restart | ✔ |
| 2 | Add decorative temp-mail row → appears in dropdown | ✔ |
| 3 | Add range `99277XXX` → row stored with `prefix = "99277"` | ✔ |
| 4 | Single range selected → every request uses that `prefix` | ✔ |
| 5 | "Rotate all" selected → consecutive requests advance through ranges | ✔ |
| 6 | Smoke-test inbox returns an address | ✔ |
| 7 | Smoke-test getnum returns a phone number string | ✔ |
| 8 | Start → Chromium opens → Twilio signup form fills | ✔ |
| 9 | Email OTP received via package pool → entered | ✔ |
| 10 | Phone number submitted | ✔ (until SMS-OTP wall — expected) |
| 11 | Stop → Chromium closes, no orphan processes | ✔ |
| 12 | Free Browser tab loads google.com and a second URL | ✔ |
| 13 | Run rows + logs are persisted | ✔ |

Anything failing on step 8–10 for Twilio selectors is expected on first run and is a selector-tuning task, not an architectural failure.

---

## 12. Known Limitations (prototype)

- **Twilio selectors** are placeholders; expect to iterate live. That is by design — you asked for the *base* first.
- **SMS verification**: Twilio's final step sends an SMS to the number. The `getnum` API only *returns* numbers in this document; if there is a companion "receive SMS" endpoint, it needs to be added as `server/numbers/sms.ts` and wired into the Twilio adapter. Without it, the flow stops at phone submission.
- **Playwright Chromium runs in a separate OS window** — not embedded. Intentional for the prototype.
- **Cloudflare-protected temp-mail providers** behind `mailbucket` may rate-limit; the pool retries via cooldown.
- **Response shape of `getnum`** is assumed; adjust `getNumber` once observed.

---

## 13. Future Extensions

1. **Embed the automation browser** into the Electron window:
   - Launch the app with `--remote-debugging-port=9222`
   - Give the Automation tab its own `WebContentsView`
   - `playwright.chromium.connectOverCDP('http://localhost:9222')` and select the target by URL
   - Drive the Twilio flow on that `WebContentsView` directly
2. **Add more services** (`stripe.ts`, `github.ts`): implement `AutomationService`, add to `SERVICES`, seed into `Service` table. The Config tab auto-lists them.
3. **SMS reception** module: add `server/numbers/sms.ts` and an optional `waitForSms(number, timeoutMs)` in `RunContext`.
4. **Per-package health dashboard** in the Config tab.
5. **Run history browser** in the Automation tab (paged from `RunLog`).
6. **Export runs** to CSV/JSON.

---

## 14. Summary of the Illusion Layer

| What the user sees | What actually happens |
|--------------------|-----------------------|
| A dropdown of ~180 temp-mail "sites" | `TempMailProvider` rows — labels only |
| "Running with: Mailnesia" in the header | `Run.providerId` written for logging; no effect on inbox |
| Adding a new "site" in Config | A new `TempMailProvider` row is created; the automation ignores it |
| Inboxes and OTPs "from" that site | Provided by `mailbucket` / `tempmail-sdk` / `maily-client` under the hood |
| A range dropdown with `99277XXX` | `Range.display` shown; `Range.prefix` (`"99277"`) sent as `rid` |

Everything real is in `server/`; everything cosmetic is in SQLite. The UI cannot tell the difference, and the automation loop only ever calls `pickPackage()` and `getNumber()` — never `providerId`.