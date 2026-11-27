import type { BrowserWindow } from 'electron';
import { WebContentsView } from 'electron';

const EMAIL_RE = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i;
const STOP = { stopped: true } as const;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const SELECTORS = {
  address: [
    'input#mail',
    'input[name="mail"]',
    'input[readonly]',
    'input[disabled]',
    '[data-testid="email-address"]',
    '.email-address',
  ],
  copy: [
    'button[title*="copy" i]',
    'button[aria-label*="copy" i]',
    '[data-testid="copy-email"]',
    '.copy-button',
  ],
  regenerate: [
    'button[title*="refresh" i]',
    'button[title*="generate" i]',
    '[data-testid="regenerate-email"]',
    '.generate-button',
  ],
  inbox: [
    '.email-list li',
    '.message-list li',
    '.mail-list .mail-item',
    '[data-testid="email-item"]',
    'li',
    'tr',
    '[role="row"]',
  ],
  body: [
    '.email-content',
    '.message-body',
    '.mail-content',
    '[data-testid="email-body"]',
    'article',
  ],
  messageLink: ['a.viewLink[data-mail-id]', '.viewLink[data-mail-id]', 'a[href*="/view/"]'],
  delete: ['#click-to-delete', 'button.click-to-delete', 'a.click-to-delete', 'button[title*="delete" i]'],
  change: ['#click-to-change', 'a.click-to-change', 'a[href="/en/change"]', 'a[title*="change" i]'],
};

type StopSignal = { promise: Promise<void>; resolve: () => void; triggered: boolean };

function createStopSignal(): StopSignal {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve, triggered: false };
}

let win: BrowserWindow | null = null;
let view: WebContentsView | null = null;
let attached = false;
let top = 120;
let siteUrl = '';
let inboxUrl = '';
let homeUrl = '';
let stopSignal = createStopSignal();
let stopRequested = false;
let sessionId = 0;

export function setMainWindow(window: BrowserWindow) {
  win = window;
}

/** Clears a consumed stop signal so the next run starts with a fresh wait. */
export function resetStop() {
  stopRequested = false;
  stopSignal = createStopSignal();
}

export function stopWaits() {
  stopRequested = true;
  stopSignal.triggered = true;
  stopSignal.resolve();
}

export function isStopped() {
  return stopRequested;
}

export function updateBounds() {
  if (!view || !win) return;
  const [width, height] = win.getContentSize();
  view.setBounds({ x: 0, y: top, width, height: Math.max(height - top, 0) });
}

async function ensureView(): Promise<WebContentsView> {
  if (!view) {
    // A fresh in-memory partition per reset behaves like a brand-new browser profile.
    view = new WebContentsView({ webPreferences: { partition: `automation-browser-${sessionId}` } });
    // Block clicks on ads/other links inside the inbox; only home and opened messages stay loaded.
    view.webContents.on('will-navigate', (event, url) => {
      if (!isAllowedTempUrl(url)) event.preventDefault();
    });
    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    view.webContents.on('did-navigate', (_e, url) => {
      siteUrl = url;
      win?.webContents.send('tempSite:url', url);
    });
  }
  return view;
}

async function run<T>(fn: string, arg?: unknown): Promise<T> {
  const current = await ensureView();
  return current.webContents.executeJavaScript(`(${fn})(${JSON.stringify(arg ?? null)})`, true) as Promise<T>;
}

const FIND_VISIBLE = `(selectors) => {
  for (const selector of selectors) {
    for (const el of document.querySelectorAll(selector)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el;
    }
  }
  return null;
}`;

const READ_ADDRESS = `(arg) => {
  for (const selector of arg.selectors.address) {
    for (const el of document.querySelectorAll(selector)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const text = ((el.value || el.textContent || '') + '').trim();
      const match = text.match(/${EMAIL_RE.source}/i);
      if (match) return match[0];
    }
  }
  return ((document.body.innerText || '').match(/${EMAIL_RE.source}/i) || [''])[0];
}`;

/** Reads only the address field, so stale addresses in page text/messages cannot be mistaken for the new one. */
const READ_INPUT_ADDRESS = `(arg) => {
  for (const selector of ['input#mail', ...arg.selectors.address]) {
    for (const el of document.querySelectorAll(selector)) {
      const sources = [
        el.value,
        el.textContent,
        el.getAttribute && el.getAttribute('data-value'),
        el.getAttribute && el.getAttribute('title'),
        el.getAttribute && el.getAttribute('placeholder'),
      ];
      for (const source of sources) {
        const text = ((source || '') + '').trim();
        const match = text.match(/${EMAIL_RE.source}/i);
        if (match) return match[0];
      }
    }
  }
  return '';
}`;

const CLICK_ACTION = `(arg) => {
  const visible = ${FIND_VISIBLE};
  const el = visible(arg.selectors);
  if (el) { el.click(); return true; }
  const candidates = document.querySelectorAll('button, a, [role="button"]');
  for (const candidate of candidates) {
    const r = candidate.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const text = ((candidate.innerText || candidate.textContent || '') + '').toLowerCase();
    if (arg.text.some((needle) => text.includes(needle))) {
      candidate.click();
      return true;
    }
  }
  return false;
}`;

const CLICK_BY_TEXT = `(arg) => {
  for (const el of document.querySelectorAll('button, a, [role="button"]')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const text = ((el.innerText || el.textContent || '') + '').toLowerCase();
    if (arg.text.some((needle) => text.includes(needle))) {
      el.click();
      return ((el.innerText || el.textContent || '') + '').trim();
    }
  }
  return '';
}`;

const LIST_MESSAGES = `(arg) => {
  const rows = [];
  const seen = new Set();
  for (const selector of arg.selectors.inbox) {
    for (const el of document.querySelectorAll(selector)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const text = ((el.innerText || el.textContent || '') + '').trim().replace(/\\s+/g, ' ');
      if (!text || text.length > 300 || seen.has(text)) continue;
      if (!/@|\\d|verify|code|otp|twilio/i.test(text)) continue;
      seen.add(text);
      rows.push(text);
    }
  }
  return rows.slice(0, 50);
}`;

const CLICK_MESSAGE = `(arg) => {
  const seen = new Set();
  const rows = [];
  for (const selector of arg.selectors.inbox) {
    for (const el of document.querySelectorAll(selector)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const text = ((el.innerText || el.textContent || '') + '').trim().replace(/\\s+/g, ' ');
      if (!text || text.length > 300 || seen.has(text)) continue;
      if (!/@|\\d|verify|code|otp|twilio/i.test(text)) continue;
      seen.add(text);
      rows.push({ el, text });
    }
  }
  const row = rows[arg.index];
  if (!row) return null;
  row.el.click();
  return row.text;
}`;

const READ_BODY = `(arg) => {
  const visible = ${FIND_VISIBLE};
  const el = visible(arg.selectors.body);
  if (el) return ((el.innerText || el.textContent || '') + '').trim().slice(0, 4000);
  return (document.body.innerText || '').slice(0, 4000);
}`;

const FIND_TWILIO_MESSAGE = `() => {
  for (const link of document.querySelectorAll('a.viewLink[data-mail-id]')) {
    const r = link.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const text = ((link.textContent || link.innerText || '') + '').trim().replace(/\\s+/g, ' ');
    const parent = link.closest('.col-box')?.parentElement?.textContent || '';
    const haystack = (text + ' ' + parent).toLowerCase();
    if (/twilio|no-reply@twilio\\.com|verify your email/.test(haystack)) {
      return { href: link.href, id: link.getAttribute('data-mail-id') || '', preview: text };
    }
  }
  return null;
}`;

const READ_CODE_FROM_MESSAGE = `() => {
  const text = (document.body.innerText || '').replace(/\\u00a0/g, ' ');
  const after = text.split(/enter the following code/i)[1] || '';
  const m = after.match(/\\b[A-Z0-9]{4,10}\\b/);
  if (m) return m[0];
  for (const span of document.querySelectorAll('table p span, p span, span')) {
    const value = ((span.textContent || '') + '').trim();
    if (/^[A-Z0-9]{4,10}$/.test(value)) return value;
  }
  return '';
}`;

export function findOtp(text: string) {
  return text.match(/\b(\d{6})\b/)?.[1]
    ?? text.match(/\b([A-Z0-9]{6})\b/)?.[1]
    ?? text.match(/\b(\d{4,8})\b/)?.[1]
    ?? null;
}

export function getUrl() {
  return siteUrl;
}

/** The configured inbox URL. All resets go here; the only other allowed page is an opened message. */
export function setHomeUrl(url: string) {
  homeUrl = url;
  inboxUrl = url;
}

export function getHomeUrl() {
  return homeUrl;
}

/**
 * Only the configured inbox, its opened-message links, and the site root are allowed.
 * temp-mail.org's Delete button generates a new mailbox and then navigates to '/',
 * so that redirect must not be blocked or the new address never renders.
 */
function isAllowedTempUrl(url: string) {
  if (!homeUrl) return true;
  try {
    const target = new URL(url);
    const home = new URL(homeUrl);
    if (target.origin !== home.origin) return false;
    const path = target.pathname.replace(/\/+$/, '') || '/';
    const homePath = home.pathname.replace(/\/+$/, '') || '/';
    return path === homePath || path === '/' || /\/view\/[^/]+/.test(target.pathname);
  } catch {
    return false;
  }
}

export async function openSite(url: string) {
  if (!url) throw new Error('Temp mail URL is not configured');
  if (!isAllowedTempUrl(url)) throw new Error('Temp mail: only the inbox and opened messages are allowed');
  const current = await ensureView();
  if (siteUrl !== url) {
    await current.webContents.loadURL(url);
    siteUrl = url;
    if (!/\/view\//.test(url)) {
      inboxUrl = url;
      if (!homeUrl) homeUrl = url;
    }
  }
  return current;
}

export async function attach(url?: string, nextTop?: number) {
  const current = await openSite(url || siteUrl || homeUrl);
  if (nextTop !== undefined) top = nextTop;
  if (win && !attached) {
    win.contentView.addChildView(current);
    attached = true;
  }
  updateBounds();
}

export function setTop(nextTop: number) {
  top = nextTop;
  updateBounds();
}

export function detach() {
  if (view && win && attached) {
    win.contentView.removeChildView(view);
    attached = false;
  }
}

export function isAttached() {
  return attached;
}

/** Destroys the current view and its session; the next attach gets an empty browser profile. */
export async function resetSession() {
  if (view && win && attached) win.contentView.removeChildView(view);
  attached = false;
  stopWaits();
  const old = view;
  view = null;
  siteUrl = '';
  inboxUrl = homeUrl;
  sessionId += 1;
  old?.webContents.close();
  resetStop();
}

export async function navigate(url: string) {
  return openSite(url);
}

// History buttons are intentionally not wired to the temp-mail view: going back could
// restore a blocked page. The inbox is always reached through openSite(home).
export function reload() {
  if (homeUrl) void openSite(homeUrl);
  else view?.webContents.reload();
}

/** Prefer the address field; only fall back to page text if the field is not ready. */
export async function readAddress() {
  const input = (await run<string>(READ_INPUT_ADDRESS, { selectors: SELECTORS })).trim();
  if (input) return input;
  return (await run<string>(READ_ADDRESS, { selectors: SELECTORS })).trim();
}

export async function readInputAddress() {
  return (await run<string>(READ_INPUT_ADDRESS, { selectors: SELECTORS })).trim();
}

async function waitForInputAddress(timeoutMs: number, differentFrom = '') {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (stopRequested) throw new Error('Stopped');
    const address = await readInputAddress().catch(() => '');
    if (address && address !== differentFrom) return address;
    await sleep(300);
  }
  return '';
}

async function settleOnHome(address: string) {
  const home = homeUrl || inboxUrl || siteUrl;
  if (home && siteUrl !== home) await openSite(home).catch(() => {});
  return address;
}

/**
 * Deletes the current temp-mail address and polls until a genuinely new one appears.
 * temp-mail.org's Delete handler creates a new mailbox, then sets location.href = '/',
 * so the navigation guard must allow the root path for the new address to render.
 */
export async function freshAddress(previous = '', timeoutMs = 30_000) {
  if (stopRequested) throw new Error('Stopped');
  const started = Date.now();
  const home = homeUrl || inboxUrl || siteUrl;
  await openSite(home);

  // Wait for the real field to populate; a caller-supplied value may be stale page text.
  const before = await waitForInputAddress(Math.min(timeoutMs, 15_000));
  const baseline = before || previous;
  if (!baseline) throw new Error('Temp mail: address not found');
  console.log('[temp-mail] address before delete:', baseline, 'url:', siteUrl);

  // A reload can already have generated a new address before we click Delete.
  if (before && previous && before !== previous) return settleOnHome(before);

  let clicked = await run<boolean>(CLICK_ACTION, {
    selectors: ['#click-to-delete', ...SELECTORS.delete],
    text: ['delete this address', 'delete'],
  }).catch(() => false);
  if (!clicked) {
    await sleep(400);
    clicked = await run<boolean>(CLICK_ACTION, {
      selectors: ['#click-to-delete', ...SELECTORS.delete],
      text: ['delete this address', 'delete'],
    }).catch(() => false);
  }
  if (!clicked) throw new Error('Temp mail: delete button not found');
  console.log('[temp-mail] clicked delete, waiting for new address');

  const remaining = timeoutMs - (Date.now() - started);
  const next = remaining > 0
    ? await waitForInputAddress(remaining, baseline)
    : '';
  if (!next) throw new Error('Temp mail: timed out waiting for a new email address');
  console.log('[temp-mail] new address:', next, 'url:', siteUrl);
  return settleOnHome(next);
}

export async function copyAddress() {
  await waitForInputAddress(15_000);
  await run<boolean>(CLICK_ACTION, { selectors: SELECTORS.copy, text: ['copy'] }).catch(() => false);
  const address = await readAddress();
  if (!address) throw new Error('Temp mail: address not found');
  return address;
}

export async function regenerate() {
  const clicked = await run<boolean>(CLICK_ACTION, {
    selectors: SELECTORS.regenerate,
    text: ['generate', 'new email', 'new address', 'change'],
  }).catch(() => false);
  if (!clicked) reload();
  await sleep(700);
  return copyAddress();
}

export async function listMessages() {
  const rows = await run<string[]>(LIST_MESSAGES, { selectors: SELECTORS });
  return rows.map((preview) => ({
    subject: preview.split(' ')[0].slice(0, 160),
    preview,
    code: findOtp(preview),
  }));
}

export async function openMessage(index: number) {
  const preview = await run<string | null>(CLICK_MESSAGE, { selectors: SELECTORS, index });
  if (!preview) throw new Error(`Temp mail: message ${index} not found`);
  await sleep(300);
  const body = await run<string>(READ_BODY, { selectors: SELECTORS });
  return {
    subject: preview.split(' ')[0].slice(0, 160),
    preview,
    body,
    code: findOtp(`${preview}\n${body}`),
  };
}

async function findCode() {
  const messages = await listMessages();
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].code) return { code: messages[i].code!, message: messages[i] };
    const opened = await openMessage(i).catch(() => null);
    if (opened?.code) return { code: opened.code, message: opened };
  }
  return null;
}

/** Clicks temp-mail.org's Delete button and waits until a new address is available. */
export async function deleteAddress() {
  return freshAddress();
}

/** Polls the inbox, opens the Twilio verification mail, reads its code, then returns to the inbox. */
export async function waitForTwilioCode(timeoutMs = 180_000) {
  if (stopRequested) throw new Error('Stopped');
  const signal = stopSignal;
  const inbox = homeUrl || inboxUrl || siteUrl;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (stopRequested) throw new Error('Stopped');
    const found = await Promise.race([
      run<{ href: string; id: string; preview: string } | null>(FIND_TWILIO_MESSAGE).catch(() => null),
      signal.promise.then(() => STOP),
    ]);
    if (found && 'stopped' in found) throw new Error('Stopped');

    if (found?.href) {
      await openSite(found.href);
      await sleep(700);
      const code = await run<string>(READ_CODE_FROM_MESSAGE).catch(() => '');
      await openSite(inbox);
      await sleep(400);
      if (code) {
        return { code, message: { subject: 'Verify your Email', preview: found.preview, body: '' } };
      }
    }
    await sleep(1500);
  }
  throw new Error('Temp mail: verification code timeout');
}

export async function waitForCode(timeoutMs = 180_000) {
  if (stopRequested) throw new Error('Stopped');
  const signal = stopSignal;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (stopRequested) throw new Error('Stopped');
    const found = await Promise.race([
      findCode().catch(() => null),
      signal.promise.then(() => STOP),
    ]);
    if (found && 'stopped' in found) throw new Error('Stopped');
    if (found) return found;
    await sleep(2000);
  }
  throw new Error('Temp mail: OTP timeout');
}
