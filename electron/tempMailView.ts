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
let stopSignal = createStopSignal();

export function setMainWindow(window: BrowserWindow) {
  win = window;
}

/** Clears a consumed stop signal so a later manual wait can run after Stop. */
export function resetStop() {
  if (stopSignal.triggered) stopSignal = createStopSignal();
}

export function stopWaits() {
  stopSignal.triggered = true;
  stopSignal.resolve();
}

export function updateBounds() {
  if (!view || !win) return;
  const [width, height] = win.getContentSize();
  view.setBounds({ x: 0, y: top, width, height: Math.max(height - top, 0) });
}

async function ensureView(): Promise<WebContentsView> {
  if (!view) {
    view = new WebContentsView();
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

export function findOtp(text: string) {
  const normalized = text.replace(/\u00a0/g, ' ');
  const patterns = [
    /(?:verification|confirmation|one[- ]?time|otp|security)\s*(?:code)?\s*(?:is|:|=)?\s*[#*]?\s*(\d{4,8})\b/i,
    /\b(?:code|pin)\s*(?:is|:|=)?\s*[#*]?\s*(\d{4,8})\b/i,
    /\b(\d{6})\b/,
    /\b(\d{4,8})\b/,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) return match[1];
  }

  // Twilio sometimes renders codes with spaces or dashes (e.g. "482 913").
  const groups = normalized.match(/\b(?:\d[\s-]?){3,7}\d\b/g) ?? [];
  for (const group of groups) {
    const digits = group.replace(/\D/g, '');
    if (digits.length >= 4 && digits.length <= 8) return digits;
  }
  return null;
}

export function getUrl() {
  return siteUrl;
}

export async function openSite(url: string) {
  resetStop();
  if (!url) throw new Error('Temp mail URL is not configured');
  const current = await ensureView();
  if (siteUrl !== url) {
    await current.webContents.loadURL(url);
    siteUrl = url;
  }
  return current;
}

export async function attach(url?: string, nextTop?: number) {
  const current = await openSite(url || siteUrl);
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

export async function navigate(url: string) {
  const current = await openSite(url);
  return current;
}

export function back() { void view?.webContents.goBack(); }
export function forward() { void view?.webContents.goForward(); }
export function reload() { view?.webContents.reload(); }

export async function readAddress() {
  return (await run<string>(READ_ADDRESS, { selectors: SELECTORS })).trim();
}

export async function copyAddress() {
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

export async function waitForCode(timeoutMs = 180_000) {
  resetStop();
  const signal = stopSignal;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
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
