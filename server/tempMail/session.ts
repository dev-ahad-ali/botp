import * as tempSite from '../../electron/tempMailView';
import type { TempMailMessage, TempMailProviderConfig } from './types';

export async function openTempMail(config: TempMailProviderConfig) {
  tempSite.setHomeUrl(config.url);
  await tempSite.openSite(config.url);
  const address = await tempSite.copyAddress().catch(() => tempSite.readAddress());
  return { address, service: config.name, url: config.url };
}

export async function refresh() {
  return {
    address: await tempSite.copyAddress().catch(() => tempSite.readAddress()),
    messages: await tempSite.listMessages(),
  };
}

export const copyAddress = () => tempSite.copyAddress();
export const regenerate = () => tempSite.regenerate();
export const deleteAddress = () => tempSite.deleteAddress();
export const freshAddress = (previous?: string, timeoutMs?: number) => tempSite.freshAddress(previous ?? '', timeoutMs ?? 30_000);
export const waitForCode = (timeoutMs?: number) => tempSite.waitForCode(timeoutMs ?? 180_000);
export const waitForTwilioCode = (timeoutMs?: number) => tempSite.waitForTwilioCode(timeoutMs ?? 180_000);
export const resetStop = () => tempSite.resetStop();
export const stopWaits = () => tempSite.stopWaits();
export const closeTempMail = () => tempSite.detach();
export const closeAll = () => tempSite.stopWaits();

export type { TempMailMessage };
