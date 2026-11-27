import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { startAutomation, stopAutomation } from '../server/automation/engine';
import { SERVICES } from '../server/automation/registry';
import type { TempMailEvent } from '../server/automation/types';
import { getConfig, setConfig } from '../server/config';
import * as dbOps from '../server/dbOps';
import { prisma } from '../server/db';
import { getNumber } from '../server/numbers/client';
import * as freeBrowser from './freeBrowserView';
import * as serviceView from './serviceView';
import * as tempView from './tempMailView';

let win: BrowserWindow | null = null;

async function selectedService() {
  const [cfg, services] = await Promise.all([getConfig(), dbOps.listServices()]);
  const key = cfg.selected_service || services[0]?.key;
  const service = services.find((s) => s.key === key) ?? services[0];
  if (!service) throw new Error('No services configured');
  // Always use the adapter's entry URL. A URL left over from a finished signup must never
  // become the reset target for the next run.
  const startUrl = SERVICES[service.key]?.startUrl || serviceView.getStartUrl();
  if (!startUrl) throw new Error(`No start URL configured for ${service.name}`);
  serviceView.rememberStartUrl(startUrl);
  return { service: service.name, url: startUrl, key: service.key };
}

const emitTemp = (event: TempMailEvent) => win?.webContents.send('tempMail:event', event);

async function selectedProvider(id?: number) {
  const cfg = await getConfig();
  const providerId = id ?? (cfg.selected_tempmail_id ? Number(cfg.selected_tempmail_id) : null);
  const byId = providerId ? await dbOps.getProvider(providerId) : null;
  const provider = byId?.url
    ? byId
    : await prisma.tempMailProvider.findFirst({ where: { enabled: true, url: { not: '' } }, orderBy: { sortOrder: 'asc' } });
  if (!provider?.url) throw new Error('Select a temp-mail website in Configuration');
  return provider;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const url = process.env.ELECTRON_RENDERER_URL ?? `file://${path.join(__dirname, '../renderer/index.html')}`;
  void win.loadURL(url);
  tempView.setMainWindow(win);
  serviceView.setMainWindow(win);
  freeBrowser.setMainWindow(win);
  win.on('closed', () => { win = null; });
  win.on('resize', () => { tempView.updateBounds(); serviceView.updateBounds(); freeBrowser.updateBounds(); });
}

function registerIpc() {
  ipcMain.handle('config:get', () => getConfig());
  ipcMain.handle('config:set', (_e, key: string, value: string) => setConfig(key, value));

  ipcMain.handle('providers:list', () => dbOps.listProviders());
  ipcMain.handle('providers:add', (_e, p: Parameters<typeof dbOps.addProvider>[0]) => dbOps.addProvider(p));
  ipcMain.handle('providers:setEnabled', (_e, id: number, enabled: boolean) => dbOps.setProviderEnabled(id, enabled));

  ipcMain.handle('ranges:list', () => dbOps.listRanges());
  ipcMain.handle('ranges:add', (_e, r: { display: string }) => dbOps.addRange(r));
  ipcMain.handle('ranges:setEnabled', (_e, id: number, enabled: boolean) => dbOps.setRangeEnabled(id, enabled));

  ipcMain.handle('services:list', () => dbOps.listServices());
  ipcMain.handle('serviceSite:resolve', () => selectedService());
  ipcMain.handle('serviceSite:reset', () => serviceView.reset());
  ipcMain.handle('serviceSite:attach', (_e, url: string, top?: number) => serviceView.attach(url, top));
  ipcMain.handle('serviceSite:setTop', (_e, top: number) => serviceView.setTop(top));
  ipcMain.handle('serviceSite:navigate', (_e, url: string) => serviceView.navigate(url));
  ipcMain.handle('serviceSite:detach', () => serviceView.detach());
  ipcMain.handle('serviceSite:back', () => serviceView.back());
  ipcMain.handle('serviceSite:forward', () => serviceView.forward());
  ipcMain.handle('serviceSite:reload', () => serviceView.reload());

  ipcMain.handle('runs:list', (_e, limit?: number) => dbOps.listRuns(limit ?? 20));

  ipcMain.handle('smoke:number', async (_e, overrides?: { url?: string; header?: string; rangeId?: string }) => {
    const cfg = await getConfig();
    const ranges = await dbOps.listRanges();
    const selectedId = Number(overrides?.rangeId || cfg.selected_range_id || 0);
    const range = ranges.find((r) => r.id === selectedId) ?? ranges[0];
    if (!range) throw new Error('No ranges configured');
    const number = await getNumber({
      url: overrides?.url?.trim() || cfg.number_api_url,
      headerRaw: overrides?.header ?? cfg.number_api_header ?? '',
      rid: range.prefix,
    });
    return { phone: number.phone, range: range.display };
  });

  ipcMain.handle('tempSite:open', async (_e, id?: number) => {
    const provider = await selectedProvider(id);
    tempView.setHomeUrl(provider.url);
    await tempView.openSite(provider.url);
    const address = await tempView.copyAddress().catch(() => tempView.readAddress());
    emitTemp({ type: 'temp:open', service: provider.name, url: provider.url });
    emitTemp({ type: 'temp:address', address });
    return { address, service: provider.name, url: provider.url };
  });
  ipcMain.handle('tempSite:attach', async (_e, url?: string, top?: number) => {
    await tempView.attach(url, top);
    return tempView.getUrl();
  });
  ipcMain.handle('tempSite:setTop', (_e, top: number) => tempView.setTop(top));
  ipcMain.handle('tempSite:navigate', (_e, url: string) => tempView.navigate(url));
  ipcMain.handle('tempSite:detach', () => tempView.detach());
  ipcMain.handle('tempSite:reload', () => tempView.reload());
  ipcMain.handle('tempSite:address', () => tempView.readAddress());
  ipcMain.handle('tempSite:copy', () => tempView.copyAddress());
  ipcMain.handle('tempSite:regenerate', () => tempView.regenerate());
  ipcMain.handle('tempSite:delete', () => {
    tempView.resetStop();
    return tempView.deleteAddress();
  });
  ipcMain.handle('tempSite:messages', () => tempView.listMessages());
  ipcMain.handle('tempSite:openMessage', (_e, index: number) => tempView.openMessage(index));
  ipcMain.handle('tempSite:waitForCode', async (_e, timeoutMs?: number) => {
    tempView.resetStop();
    const found = await tempView.waitForCode(timeoutMs ?? 180_000);
    emitTemp({ type: 'temp:code', code: found.code });
    return found;
  });

  ipcMain.handle('automation:start', () => {
    if (!win) return;
    void startAutomation((evt) => {
      win?.webContents.send('automation:event', evt);
      if (evt.type === 'temp:open' || evt.type === 'temp:address' || evt.type === 'temp:code') emitTemp(evt);
    });
  });
  ipcMain.handle('automation:stop', () => stopAutomation());

  // Full browser reset: stop the run, throw away every embedded view/session, then
  // reopen the pages that were visible. New views use empty in-memory partitions.
  ipcMain.handle('browser:reset', async () => {
    await stopAutomation();
    const hadService = serviceView.isAttached();
    const hadTemp = tempView.isAttached();
    const hadFree = freeBrowser.isAttached();
    await Promise.all([
      serviceView.resetSession(),
      tempView.resetSession(),
      freeBrowser.resetSession(),
    ]);
    const serviceUrl = serviceView.getStartUrl();
    const tempUrl = tempView.getHomeUrl();
    if (hadService && serviceUrl) await serviceView.attach(serviceUrl);
    if (hadTemp && tempUrl) await tempView.attach(tempUrl);
    if (hadFree) await freeBrowser.attach(freeBrowser.getHomeUrl());
  });

  ipcMain.handle('freeBrowser:attach', (_e, url: string, top?: number) => freeBrowser.attach(url, top));
  ipcMain.handle('freeBrowser:setTop', (_e, top: number) => freeBrowser.setTop(top));
  ipcMain.handle('freeBrowser:navigate', (_e, url: string) => freeBrowser.navigate(url));
  ipcMain.handle('freeBrowser:detach', () => freeBrowser.detach());
  ipcMain.handle('freeBrowser:back', () => freeBrowser.back());
  ipcMain.handle('freeBrowser:forward', () => freeBrowser.forward());
  ipcMain.handle('freeBrowser:reload', () => freeBrowser.reload());
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
});

app.on('window-all-closed', () => {
  stopAutomation();
  if (process.platform !== 'darwin') app.quit();
});
