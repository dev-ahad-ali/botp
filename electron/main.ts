import { app, BrowserWindow, WebContentsView, ipcMain } from 'electron';
import path from 'node:path';
import { startAutomation, stopAutomation } from '../server/automation/engine';
import type { TempMailEvent } from '../server/automation/types';
import { getConfig, setConfig } from '../server/config';
import * as dbOps from '../server/dbOps';
import { prisma } from '../server/db';
import { getNumber } from '../server/numbers/client';
import * as tempMail from '../server/tempMail/session';

let win: BrowserWindow | null = null;
let freeView: WebContentsView | null = null;
let freeTop = 120;

function updateFreeBounds() {
  if (!freeView || !win) return;
  const [width, height] = win.getContentSize();
  freeView.setBounds({ x: 0, y: freeTop, width, height: Math.max(height - freeTop, 0) });
}

const emitTemp = (event: TempMailEvent) => win?.webContents.send('tempMail:event', event);

async function selectedProvider(id?: number) {
  const cfg = await getConfig();
  const providerId = id ?? (cfg.selected_tempmail_id ? Number(cfg.selected_tempmail_id) : null);
  const provider = providerId
    ? await dbOps.getProvider(providerId)
    : await prisma.tempMailProvider.findFirst({ where: { enabled: true, url: { not: '' } }, orderBy: { sortOrder: 'asc' } });
  if (!provider?.url) throw new Error('Select a temp-mail website in Configuration');
  return provider;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const url = process.env.ELECTRON_RENDERER_URL ?? `file://${path.join(__dirname, '../renderer/index.html')}`;
  void win.loadURL(url);
  win.on('closed', () => { win = null; freeView = null; });
  win.on('resize', updateFreeBounds);
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
  ipcMain.handle('runs:list', (_e, limit?: number) => dbOps.listRuns(limit ?? 20));

  ipcMain.handle('smoke:number', async () => {
    const cfg = await getConfig();
    const ranges = await dbOps.listRanges();
    const range = ranges.find((r) => r.id === Number(cfg.selected_range_id)) ?? ranges[0];
    if (!range) throw new Error('No ranges configured');
    const phone = await getNumber({ url: cfg.number_api_url, headerRaw: cfg.number_api_header, rid: range.prefix });
    return { phone, range: range.display };
  });

  ipcMain.handle('tempMail:open', async (_e, id?: number) => {
    const provider = await selectedProvider(id);
    const result = await tempMail.openTempMail(provider);
    emitTemp({ type: 'temp:open', service: provider.name, url: provider.url });
    emitTemp({ type: 'temp:address', address: result.address });
    return result;
  });
  ipcMain.handle('tempMail:refresh', () => tempMail.refresh());
  ipcMain.handle('tempMail:copy', () => tempMail.copyAddress());
  ipcMain.handle('tempMail:regenerate', () => tempMail.regenerate());
  ipcMain.handle('tempMail:waitForCode', async (_e, timeoutMs?: number) => {
    const found = await tempMail.waitForCode(timeoutMs ?? 180_000);
    emitTemp({ type: 'temp:code', code: found.code });
    return found;
  });
  ipcMain.handle('tempMail:close', () => tempMail.closeTempMail());

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
