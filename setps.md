# Twilio Signup Automation Tool — Implementation Doc

**Version:** 0.1 (Prototype)
**Stack:** Electron · React · shadcn/ui · Playwright · SQLite (Prisma)
**First service:** Twilio (modular — more services later)
**Goal:** A working prototype base that demonstrates the full loop end-to-end. Twilio selectors will be tuned after live testing; this doc focuses on the parts we already know work.

---

## 1. Overview

The app is a local desktop tool with **four tabs**:

| # | Tab | Purpose |
|---|-----|---------|
| 1 | **Configuration** | Select a real temp-mail website (name + URL + adapter), configure the number API (URL + auth header), manage the range list, select a target service (Twilio first) |
| 2 | **Automation** | Control panel: Start / Stop, live status, step log, per-run stats. Playwright drives a separate Chromium window for both the temp-mail site and the Twilio signup flow |
| 3 | **Temp Mail** | Manual control of the temp-mail page: show current address, copy/regenerate, refresh inbox, read messages, wait for a verification code |
| 4 | **Free Browser** | Plain browser for the user (URL bar + embedded `WebContentsView`) — no automation, sign in to whatever else they want |

The automation loop depends on tab 1 for:
- The number API URL + auth header (used to fetch a phone number)
- The list of ranges (either a single selected range or full rotation)
- The selected temp-mail **website URL** (opened with Playwright)
- The selected target service (Twilio for now)

There is **no programmatic inbox creation** and no temp-mail npm package. The app opens the real site (e.g. `https://temp-mail.org/en/`), clicks its copy-to-clipboard button to read the address, clicks messages in its inbox, and extracts the OTP from the message body with Playwright. The site choice is no longer cosmetic: it determines which page is automated.

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
┌────────────────────────────────────────────────────────────────────┐
│ Electron Main Window                                               │
│                                                                    │
│  ┌────────────┐ ┌───────────────┐ ┌────────────┐ ┌──────────────┐  │
│  │ Config Tab │ │ Automation Tab│ │ Temp Mail  │ │ Free Browser │  │
│  │ (React)    │ │ (React + log) │ │ Tab (React)│ │ (WebContents)│  │
│  └────────────┘ └───────────────┘ └────────────┘ └──────────────┘  │
│         │               │               │                          │
│         └────── IPC ────┴───────────────┘                          │
└────────────────────────────┼───────────────────────────────────────┘
                             │
             ┌───────────────┼────────────────┐
             │               │                │
             ▼               ▼                ▼
      ┌────────────┐  ┌────────────┐   ┌──────────────────┐
      │ Prisma DB  │  │ Automation │   │ Temp Mail Session│
      │ (SQLite)   │  │  Engine    │   │ + Site Adapter   │
      └────────────┘  └─────┬──────┘   └────────┬─────────┘
                            │                   │
                            ▼                   ▼
                     ┌───────────────────────────────┐
                     │  Playwright headed Chromium   │
                     │  Page A: temp-mail website    │
                     │  Page B: Twilio signup flow   │
                     └───────────────────────────────┘
```

**Prototype note:** Playwright runs in a **separate OS window**, not embedded. The Temp Mail and Automation tabs read its state over IPC. Embedding via CDP is listed under Future Extensions.

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
│  ├─ tabs/TempMailTab.tsx
│  ├─ tabs/FreeBrowserTab.tsx
│  ├─ components/ui/…         # lightweight Tailwind primitives
│  └─ lib/ipc.ts              # typed ipc wrappers
├─ server/                    # runs in Electron main process
│  ├─ db.ts                   # Prisma client singleton
│  ├─ config.ts               # read/write settings
│  ├─ dbOps.ts                # providers/ranges/services CRUD
│  ├─ tempMail/
│  │  ├─ types.ts             # TempMailAdapter + message shapes
│  │  ├─ generic.ts           # Playwright selectors + OTP extraction
│  │  ├─ adapters.ts          # site-specific selector overrides
│  │  └─ session.ts           # shared Playwright page + stop signal
│  ├─ numbers/
│  │  └─ client.ts            # POST getnum
│  ├─ generators.ts           # random name/pass helpers
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

// A real temp-mail website that Playwright will open.
model TempMailProvider {
  id         Int      @id @default(autoincrement())
  name       String
  domain     String   @unique
  url        String   @default("")      // e.g. https://temp-mail.org/en/
  adapterKey String   @default("generic") // selector set in server/tempMail/adapters.ts
  enabled    Boolean  @default(true)
  isBuiltin  Boolean  @default(false)
  sortOrder  Int      @default(0)
  createdAt  DateTime @default(now())
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

### 6.3 Temp Mail Providers — real websites only

The old domain list from `Temp mail provider list.txt` is retained but disabled (`url = ''`). Only entries with a real URL can be selected. The seed inserts three ready-made sites:

```ts
const sites = [
  { name: 'Temp Mail', domain: 'temp-mail.org', url: 'https://temp-mail.org/en/', adapterKey: 'tempmail-org' },
  { name: 'Temp Mail IO', domain: 'temp-mail.io', url: 'https://temp-mail.io/en/', adapterKey: 'generic' },
  { name: '1SecMail', domain: '1secmail.com', url: 'https://www.1secmail.com/', adapterKey: 'generic' },
];

await prisma.tempMailProvider.updateMany({
  where: { url: '' },
  data: { enabled: false },
});

await Promise.all(sites.map((data, i) => prisma.tempMailProvider.upsert({
  where: { domain: data.domain },
  create: { ...data, enabled: i === 0, isBuiltin: true, sortOrder: i },
  update: { ...data, enabled: i === 0, sortOrder: i },
})));
```

> Only the first site is enabled by default. The user can add any temp-mail website in Configuration by supplying a name and URL; its `adapterKey` defaults to `generic`, which uses the shared selector list in `server/tempMail/generic.ts`.

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

### 7.2 Temp Mail Website Automation (`server/tempMail/`)

There is no package that creates inboxes. Playwright opens the selected website and drives it like a user.

**Adapter interface (`types.ts`):**

```ts
export type TempMailMessage = {
  subject: string;
  preview: string;
  body?: string;
  code?: string | null;
};

export type TempMailAdapter = {
  key: string;
  name: string;
  readAddress(): Promise<string>;
  copyAddress(): Promise<string>;
  regenerate(): Promise<string>;
  listMessages(): Promise<TempMailMessage[]>;
  openMessage(index: number): Promise<TempMailMessage>;
  waitForCode(timeoutMs: number, abort?: Promise<unknown>): Promise<{ code: string; message: TempMailMessage }>;
};
```

**`generic.ts`** contains the shared selector lists and OTP regex:

```ts
const EMAIL_RE = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i;

const DEFAULT_SELECTORS = {
  address:    ['input[readonly]', 'input#mail', '[data-testid="email-address"]', '.email-address'],
  copy:       ['button[title*="copy" i]', 'button[aria-label*="copy" i]', '[data-testid="copy-email"]'],
  regenerate: ['button:has-text("Generate")', 'button:has-text("New")', 'button[title*="refresh" i]'],
  inbox:      ['.email-list li', '.message-list li', '[data-testid="email-item"]'],
  body:       ['.email-content', '.message-body', '[data-testid="email-body"]'],
};

function extractCode(text: string) {
  return text.match(/\b(\d{6})\b/)?.[1] ?? text.match(/\b(\d{4,8})\b/)?.[1] ?? null;
}
```

`copyAddress()` clicks the site's copy button, then reads the clipboard (with a fallback to the visible address input). `waitForCode()` polls inbox rows, clicks a message if the code is not in the preview, and stops when the abort promise resolves.

**`adapters.ts`** applies per-site selector overrides. `tempmail-org` has its own list; every other site uses `generic`.

**`session.ts`** owns one headed Chromium context with two pages:

```ts
export async function openTempMail(config) {
  // new page -> goto(config.url) -> click copy -> return { address, service, url }
}

export async function newAutomationPage() {
  // same context, second page for the Twilio flow
}

export async function waitForCode(timeoutMs, externalAbort?) { /* adapter polling */ }
export function stopWaits() { /* resolve pending waits */ }
export async function closeAll() { /* close browser */ }
```

### 7.3 Number API Client (`server/numbers/client.ts`)

The API requires a `mauthapi` header. The setting `number_api_header` accepts `mauthapi="token"`, `mauthapi=token`, `mauthapi: token`, or a bare token. A missing header produces `HTTP 401: missing mauthapi header`.

```ts
export async function getNumber({ url, headerRaw, rid }: {
  url: string; headerRaw?: string; rid: string;
}): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const header = parseHeader(headerRaw);
  if (header) headers[header[0]] = header[1];

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ rid }),
  });
  if (!res.ok) throw new Error(`getnum HTTP ${res.status}: ${await errorMessage(res)}`);

  const data = await res.json();
  // Real response: { meta, data: { full_number, national_number, ... }, message, rid }
  const number = extractNumber(data);
  if (!number) throw new Error(`getnum: unrecognized response ${JSON.stringify(data)}`);
  return String(number);
}
```

`extractNumber()` prefers `data.full_number`, then `data.no_plus_number`, `data.national_number`, and common flat fields. `rid` is sent as the range **prefix** (trailing `X`s stripped).

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

The loop is started by the Automation tab's Start button. It opens the selected temp-mail website once, then runs signup attempts in a second page while reusing/regenerating the address.

```ts
import { prisma } from '../db';
import { getConfig } from '../config';
import { getProvider } from '../dbOps';
import { getNumber } from '../numbers/client';
import * as tempMail from '../tempMail/session';
import { SERVICES } from './registry';

let running = false;
let shouldStop = false;

export async function startAutomation(onEvent) {
  if (running) return;
  running = true;
  shouldStop = false;

  const stopped = new Promise((resolve) => { signalStop = () => resolve(null); });
  const cfg = await getConfig();
  const service = SERVICES[cfg.selected_service || 'twilio'];
  const provider = /* selected TempMailProvider with a URL */;

  const opened = await tempMail.openTempMail(provider);
  emit({ type: 'temp:open', service: provider.name, url: provider.url });
  emit({ type: 'temp:address', address: opened.address });

  let attempt = 0;
  let address = opened.address;

  while (!shouldStop) {
    const range = rotation[attempt++ % rotation.length];
    if (attempt > 1) address = await tempMail.regenerate();

    const run = await prisma.run.create({
      data: { serviceKey: service.key, rangeId: range.id, providerId: provider.id, status: 'running' },
    });
    const log = async (msg, data) => { /* persist + emit */ };

    const phone = await getNumber({
      url: cfg.number_api_url,
      headerRaw: cfg.number_api_header,
      rid: range.prefix,
    });
    const page = await tempMail.newAutomationPage();

    await service.run({
      page,
      email: address,
      getOtp: async () => {
        const found = await tempMail.waitForCode(180_000, stopped);
        emit({ type: 'temp:code', code: found.code });
        return found.code;
      },
      log,
      stop: () => shouldStop,
    });

    await page.close();
    // mark run success/failed/stopped and emit run:done
  }

  await tempMail.closeAll();
  running = false;
}

export function stopAutomation() {
  if (!running) return;
  shouldStop = true;
  signalStop();
  tempMail.stopWaits();
  void tempMail.closeAll();
}
```

`automation:event` streams `status`, `log`, `run:start`, `run:info`, `run:done`, plus `temp:open`, `temp:address`, and `temp:code` so the Temp Mail tab stays in sync.

---

## 8. Electron Layer

### 8.1 Main process (`electron/main.ts`)

Responsibilities:
- Create the main `BrowserWindow` (React UI)
- Create and manage the **Free Browser tab**'s `WebContentsView`
- Register IPC handlers that proxy into `server/` modules
- Stream automation and temp-mail events to the renderer via `webContents.send`

```ts
import { app, BrowserWindow, WebContentsView, ipcMain } from 'electron';
import path from 'node:path';
import { startAutomation, stopAutomation } from '../server/automation/engine';
import { getConfig, setConfig } from '../server/config';
import * as dbOps from '../server/dbOps'; // thin CRUD wrappers for providers/ranges/services
import * as tempMail from '../server/tempMail/session';

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

const emitTemp = (event) => win?.webContents.send('tempMail:event', event);

async function selectedProvider(id?: number) {
  const cfg = await getConfig();
  const providerId = id ?? (cfg.selected_tempmail_id ? Number(cfg.selected_tempmail_id) : null);
  const provider = providerId
    ? await dbOps.getProvider(providerId)
    : await prisma.tempMailProvider.findFirst({
        where: { enabled: true, url: { not: '' } },
        orderBy: { sortOrder: 'asc' },
      });
  if (!provider?.url) throw new Error('Select a temp-mail website in Configuration');
  return provider;
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

// ---- Temp Mail (real website driven by Playwright) ----
ipcMain.handle('tempMail:open', async (_e, id?: number) => {
  const provider = await selectedProvider(id);
  const result = await tempMail.openTempMail(provider);
  emitTemp({ type: 'temp:open', service: provider.name, url: provider.url });
  emitTemp({ type: 'temp:address', address: result.address });
  return result;
});
ipcMain.handle('tempMail:refresh',    () => tempMail.refresh());
ipcMain.handle('tempMail:copy',       () => tempMail.copyAddress());
ipcMain.handle('tempMail:regenerate', () => tempMail.regenerate());
ipcMain.handle('tempMail:waitForCode', async (_e, timeoutMs?: number) => {
  const found = await tempMail.waitForCode(timeoutMs ?? 180_000);
  emitTemp({ type: 'temp:code', code: found.code });
  return found;
});
ipcMain.handle('tempMail:close',      () => tempMail.closeTempMail());

// ---- Automation ----
ipcMain.handle('automation:start', async () => {
  await startAutomation((evt) => {
    win.webContents.send('automation:event', evt);
    if (evt.type.startsWith('temp:')) emitTemp(evt);
  });
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
  smoke: { number: (cfg) => ipcRenderer.invoke('smoke:number', cfg) },
  tempMail: {
    open: (id) => ipcRenderer.invoke('tempMail:open', id),
    refresh: () => ipcRenderer.invoke('tempMail:refresh'),
    copy: () => ipcRenderer.invoke('tempMail:copy'),
    regenerate: () => ipcRenderer.invoke('tempMail:regenerate'),
    waitForCode: (timeoutMs) => ipcRenderer.invoke('tempMail:waitForCode', timeoutMs),
    close: () => ipcRenderer.invoke('tempMail:close'),
    onEvent: (cb) => {
      const listener = (_e, evt) => cb(evt);
      ipcRenderer.on('tempMail:event', listener);
      return () => ipcRenderer.removeListener('tempMail:event', listener);
    },
  },
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

## 9. UI — Four Tabs

Wrap in `<Tabs>` in `App.tsx`. The **Free Browser tab** only renders when active, otherwise the `WebContentsView` overlays nothing. The Playwright pages are separate OS windows.

### 9.1 Config Tab (`tabs/ConfigTab.tsx`)

Sections:

| Section | Controls |
|---------|----------|
| **Target service** | `<Select>` from `services.list` (Twilio only for now) |
| **Temp mail website** | Searchable `<Select>` from `providers.list` filtered to rows with a URL; "Add site" form for name + URL; "Open temp mail" smoke test |
| **Number API** | `<Input>` for URL, `<Input>` for required `mauthapi="…"` header, "Test getnum" smoke test |
| **Range** | `<Select>` with "Rotate all" + individual ranges; "Add range" form (accepts `99277XXX`, stores `display` and derived `prefix`) |

On save: `api.config.set('selected_service', …)` etc. Store `selected_range_id` and `selected_tempmail_id` as strings (`''` means default/rotate-all). The **Test getnum** button passes the current form values (`url`, `header`, `rangeId`) into the IPC handler so an unsaved header is still exercised; automation itself always uses the saved settings.

### 9.2 Automation Tab (`tabs/AutomationTab.tsx`)

Layout:
- Top bar: `Start` / `Stop` buttons, current status badge, running attempt counter, selected temp-mail site name
- Left pane: current-run summary (range, adapter, phone, email, verification code)
- Right pane: streaming log (append on `automation:event`)
- Bottom: last 20 persisted runs

```tsx
const off = api.automation.onEvent((e) => {
  if (e.type === 'log')       setLogs((l) => [...l, e.message]);
  if (e.type === 'run:start') setCurrent({ range: e.range, pkg: e.pkg });
  if (e.type === 'run:info')  setCurrent((c) => ({ ...c, ...e }));
  if (e.type === 'run:done')  refreshRuns();
  if (e.type === 'temp:address') setCurrent((c) => ({ ...c, email: e.address }));
});
```

The actual browsing happens in Playwright's Chromium window. The Automation tab is the control panel.

### 9.3 Temp Mail Tab (`tabs/TempMailTab.tsx`)

Shows the real temp-mail page state over IPC:

- Opens the configured site when the tab mounts (or the selected provider on demand)
- Current address with **Copy email**, **New email**, and **Refresh inbox** buttons
- Inbox message list (subject + preview)
- **Wait for code** button that polls the opened message body for a 4–8 digit code
- Listens to `tempMail:event` so codes/addresses discovered during automation appear here too

### 9.4 Free Browser Tab (`tabs/FreeBrowserTab.tsx`)

React renders a URL bar + back/forward/refresh at the top (height measured from the DOM). The `WebContentsView` is attached by IPC below that region. On tab activation: `window.api.freeBrowser.attach(lastUrl, top)`; on tab deactivation: `window.api.freeBrowser.detach()`.

---

## 10. Build Steps (for the agent — ordered)

Follow in order. Each step ends with a concrete verification.

1. **Scaffold Electron + Vite + React + TS** with lightweight Tailwind UI primitives.
   - Verify: `npm run dev` opens a window with placeholder tabs.
2. **Set up Prisma + SQLite.**
   - Add the models from §5, including `TempMailProvider.url` and `adapterKey`.
   - `npx prisma migrate dev --name init`, then `--name temp_mail_sites` after the schema change.
   - Verify: `prisma/data/app.db` exists and the migration is applied.
3. **Write and run `prisma/seed.ts`** with §6 data.
   - Verify: only enabled providers with a URL appear; `Range` rows have correct `prefix`.
4. **Implement `server/config.ts`** and IPC handlers. Wire the Config tab to read/write.
   - Verify: set a value in the UI, restart the app, value persists.
5. **Implement `server/numbers/client.ts`** plus a smoke IPC.
   - Verify: response parses into a phone number string.
6. **Implement generators, `AutomationService`, `twilioService`, registry.**
   - Keep the Twilio selectors as placeholders for live tuning.
7. **Implement `server/tempMail/`** (`types.ts`, `generic.ts`, `adapters.ts`, `session.ts`).
   - Verify: "Open temp mail" opens the real site and copies its address.
8. **Implement `server/automation/engine.ts`.**
   - Verify: Start opens Chromium, opens the temp-mail site and the Twilio page, fills the first form. Stop closes everything cleanly.
9. **Wire Automation and Temp Mail tabs** to IPC and event streams.
   - Verify: log lines stream live; address/code appear in both tabs; runs persist.
10. **Implement the Free Browser tab** with `WebContentsView`.
    - Verify: user can navigate to any site, back/forward works, tab detach hides the view.
11. **Polish:** disable Start while running, disable Stop while idle, show last 20 runs.
12. **Package:** `electron-builder` with `asarUnpack` for Prisma's native engine and the seed DB.

---

## 11. Test Plan (prototype acceptance)

| # | Test | Expected |
|---|------|----------|
| 1 | Config persists across restart | ✔ |
| 2 | Add temp-mail website with URL → appears in dropdown | ✔ |
| 3 | Add range `99277XXX` → row stored with `prefix = "99277"` | ✔ |
| 4 | Single range selected → every request uses that `prefix` | ✔ |
| 5 | "Rotate all" selected → consecutive requests advance through ranges | ✔ |
| 6 | "Open temp mail" opens the real site and reads its generated address | ✔ |
| 7 | Smoke-test getnum returns a phone number string | ✔ |
| 8 | Start → Chromium opens temp-mail site + Twilio signup form fills | ✔ |
| 9 | Email OTP read from the temp-mail inbox → entered | ✔ |
| 10 | Phone number submitted | ✔ (until SMS-OTP wall — expected) |
| 11 | Stop → Chromium closes, no orphan processes | ✔ |
| 12 | Free Browser tab loads google.com and a second URL | ✔ |
| 13 | Run rows + logs are persisted | ✔ |

Failures in tests 8–10 are expected on first run and mean selector tuning, not an architectural problem.

---

## 12. Known Limitations (prototype)

- **Temp-mail selectors** are best-effort. Sites can change their DOM or add bot protection; tune `server/tempMail/generic.ts` / `adapters.ts` against the live page.
- **Twilio selectors** are placeholders; expect to iterate live.
- **SMS verification**: Twilio's final step sends an SMS to the number. If a receive-SMS endpoint exists, add `server/numbers/sms.ts` and wire it into `RunContext`. Without it, the flow stops at phone submission.
- **Playwright Chromium runs in a separate OS window** — not embedded. Intentional for the prototype.
- **`getnum` requires a valid `mauthapi` header**; the app cannot supply it automatically. Enter it in Configuration and click Save settings.
- Old decorative provider rows remain in SQLite but are disabled and hidden from the UI.

---

## 13. Future Extensions

1. **Embed the automation browser** into the Electron window via CDP (`--remote-debugging-port=9222`).
2. **Add more services** (`stripe.ts`, `github.ts`): implement `AutomationService`, add to `SERVICES`, seed into `Service` table.
3. **SMS reception** module: add `server/numbers/sms.ts` and an optional `waitForSms(number, timeoutMs)` in `RunContext`.
4. **Per-site selector profiles** saved in SQLite instead of code.
5. **Run history browser** in the Automation tab (paged from `RunLog`).
6. **Export runs** to CSV/JSON.

---

## 14. Summary of the real flow

| What the user sees | What actually happens |
|--------------------|-----------------------|
| A dropdown of temp-mail websites | `TempMailProvider` rows filtered to `url != ''` |
| "Running with: Temp Mail" in the header | The selected site's URL is opened in Playwright |
| Adding a new "site" in Config | A new `TempMailProvider` row with a real URL; it becomes selectable |
| Generated email address | Copied from the site's clipboard button, with a fallback to reading the address input |
| Inbox message + OTP | Found by clicking rows in the real site's inbox and matching a 4–8 digit code |
| A range dropdown with `99277XXX` | `Range.display` shown; `Range.prefix` (`"99277"`) sent as `rid` |

Everything real happens in Playwright and `server/`; SQLite stores settings, site metadata, runs, and logs.
