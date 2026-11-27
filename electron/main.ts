import { app, BrowserWindow, WebContentsView, ipcMain } from 'electron';
import path from 'node:path';
import { startAutomation, stopAutomation } from '../server/automation/engine';
import { SERVICES } from '../server/automation/registry';
import type { TempMailEvent } from '../server/automation/types';
import { getConfig, setConfig } from '../server/config';
import * as dbOps from '../server/dbOps';
import { prisma } from '../server/db';
import { getNumber } from '../server/numbers/client';
import * as serviceView from './serviceView';
import * as tempView from './tempMailView';

let win: BrowserWindow | null = null;
let freeView: WebContentsView | null = null;
let freeTop = 120;

function updateFreeBounds() {
  if (!freeView || !win) return;
  const [width, height] = win.getContentSize();
  freeView.setBounds({ x: 0, y: freeTop, width, height: Math.max(height - freeTop, 0) });
}

async function selectedService() {
  const [cfg, services] = await Promise.all([getConfig(), dbOps.listServices()]);
  const key = cfg.selected_service || services[0]?.key;
  const service = services.find((s) => s.key === key) ?? services[0];
  if (!service) throw new Error('No services configured');
  const startUrl = serviceView.getUrl() || SERVICES[service.key]?.startUrl;
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
  win.on('closed', () => { win = null; freeView = null; });
  win.on('resize', () => { updateFreeBounds(); tempView.updateBounds(); });
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
  ipcMain.handle('tempSite:back', () => tempView.back());
  ipcMain.handle('tempSite:forward', () => tempView.forward());
  ipcMain.handle('tempSite:reload', () => tempView.reload());
  ipcMain.handle('tempSite:address', () => tempView.readAddress());
  ipcMain.handle('tempSite:copy', () => tempView.copyAddress());
  ipcMain.handle('tempSite:regenerate', () => tempView.regenerate());
  ipcMain.handle('tempSite:delete', () => tempView.deleteAddress());
  ipcMain.handle('tempSite:messages', () => tempView.listMessages());
  ipcMain.handle('tempSite:openMessage', (_e, index: number) => tempView.openMessage(index));
  ipcMain.handle('tempSite:waitForCode', async (_e, timeoutMs?: number) => {
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

  ipcMain.handle('freeBrowser:attach', async (_e, url: string, top?: number) => {
    if (!win) return;
    if (!freeView) {
      freeView = new WebContentsView({ webPreferences: { sandbox: true } });
      win.contentView.addChildView(freeView);
      freeView.webContents.on('did-navigate', (_wc, next) => win?.webContents.send('freeBrowser:url', next));
    }
    if (top !== undefined) freeTop = top;
    updateFreeBounds();
    if (url) await freeView.webContents.loadURL(url);
  });
  ipcMain.handle('freeBrowser:setTop', (_e, top: number) => {
    freeTop = top;
    updateFreeBounds();
  });
  ipcMain.handle('freeBrowser:navigate', (_e, url: string) => freeView?.webContents.loadURL(url));
  ipcMain.handle('freeBrowser:detach', () => {
    if (freeView && win) {
      win.contentView.removeChildView(freeView);
      freeView = null;
    }
  });
  ipcMain.handle('freeBrowser:back', () => { if (freeView?.webContents.canGoBack()) freeView.webContents.goBack(); });
  ipcMain.handle('freeBrowser:forward', () => { if (freeView?.webContents.canGoForward()) freeView.webContents.goForward(); });
  ipcMain.handle('freeBrowser:reload', () => freeView?.webContents.reload());
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
});

app.on('window-all-closed', () => {
  stopAutomation();
  if (process.platform !== 'darwin') app.quit();
});
