import { chromium, type Browser } from 'playwright';
import * as tempSite from '../../electron/tempMailView';
import type { TempMailMessage, TempMailProviderConfig } from './types';

let browser: Browser | null = null;

export async function openTempMail(config: TempMailProviderConfig) {
  tempSite.resetStop();
  await tempSite.openSite(config.url);
  const address = await tempSite.copyAddress().catch(() => tempSite.readAddress());
  return { address, service: config.name, url: config.url };
}

/** Playwright stays headed for the Twilio signup flow; the mail site itself is embedded in the app. */
export async function newAutomationPage() {
  if (!browser || !browser.isConnected()) browser = await chromium.launch({ headless: false });
  return browser.newPage();
}

export async function refresh() {
  return {
    address: await tempSite.copyAddress().catch(() => tempSite.readAddress()),
    messages: await tempSite.listMessages(),
  };
}

export const copyAddress = () => tempSite.copyAddress();
export const regenerate = () => tempSite.regenerate();
export const waitForCode = (timeoutMs?: number) => tempSite.waitForCode(timeoutMs ?? 180_000);
export const stopWaits = () => tempSite.stopWaits();
export const closeTempMail = () => tempSite.detach();

export async function closeAll() {
  tempSite.stopWaits();
  await browser?.close().catch(() => undefined);
  browser = null;
}

export type { TempMailMessage };
