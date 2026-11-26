import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { getAdapter } from './adapters';
import type { TempMailMessage, TempMailProviderConfig } from './types';

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;
let provider: TempMailProviderConfig | null = null;
let stopResolve: (() => void) | null = null;
let stopped: Promise<symbol> = Promise.resolve(Symbol('idle'));

export function resetStop() {
  stopped = new Promise((resolve) => { stopResolve = () => resolve(Symbol('stop')); });
}

export function stopWaits() {
  stopResolve?.();
}

async function ensureContext() {
  if (!browser || !context || !browser.isConnected()) {
    browser = await chromium.launch({ headless: false });
    context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  }
  return context;
}

function current() {
  if (!page || page.isClosed()) throw new Error('Temp mail page is not open');
  return { page, adapter: getAdapter(provider?.adapterKey ?? 'generic', provider?.name ?? 'Temp mail', page) };
}

export async function openTempMail(config: TempMailProviderConfig) {
  if (!config.url) throw new Error(`${config.name}: no URL configured`);
  const ctx = await ensureContext();
  if (page && !page.isClosed()) await page.close().catch(() => undefined);

  resetStop();
  provider = config;
  page = await ctx.newPage();
  await page.goto(config.url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);

  const { adapter } = current();
  const address = await adapter.copyAddress().catch(() => adapter.readAddress());
  await page.bringToFront();
  return { address, service: config.name, url: config.url };
}

export async function newAutomationPage() {
  const ctx = await ensureContext();
  return ctx.newPage();
}

export function isOpen() {
  return !!page && !page.isClosed();
}

export async function bringToFront() {
  if (isOpen()) await page?.bringToFront();
}

export async function refresh() {
  const { adapter } = current();
  return {
    address: await adapter.copyAddress().catch(() => adapter.readAddress()),
    messages: await adapter.listMessages(),
  };
}

export async function copyAddress() {
  const { adapter } = current();
  return adapter.copyAddress().catch(() => adapter.readAddress());
}

export async function regenerate() {
  const { adapter } = current();
  return adapter.regenerate();
}

export async function waitForCode(timeoutMs = 180_000, externalAbort?: Promise<unknown>) {
  const { adapter } = current();
  const abort = externalAbort ? Promise.race([stopped, externalAbort]) : stopped;
  return adapter.waitForCode(timeoutMs, abort);
}

export async function closeTempMail() {
  if (page && !page.isClosed()) await page.close().catch(() => undefined);
  page = null;
  provider = null;
}

export async function closeAll() {
  stopWaits();
  await browser?.close().catch(() => undefined);
  browser = null;
  context = null;
  page = null;
  provider = null;
}

export type { TempMailMessage };
