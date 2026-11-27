import type { BrowserWindow } from 'electron';
import { WebContentsView } from 'electron';

let win: BrowserWindow | null = null;
let view: WebContentsView | null = null;
let attached = false;
let top = 190;
let home = 'https://www.google.com';

export function setMainWindow(window: BrowserWindow) {
  win = window;
}

export function getUrl() {
  return view?.webContents.getURL() || '';
}

export function updateBounds() {
  if (!view || !win) return;
  const [width, height] = win.getContentSize();
  view.setBounds({ x: 0, y: top, width, height: Math.max(height - top, 0) });
}

async function ensureView() {
  if (!view) {
    view = new WebContentsView({ webPreferences: { sandbox: true } });
    view.webContents.on('did-navigate', (_e, url) => win?.webContents.send('freeBrowser:url', url));
    view.webContents.on('did-navigate-in-page', (_e, url) => win?.webContents.send('freeBrowser:url', url));
  }
  return view;
}

export async function openSite(url: string) {
  if (!url) throw new Error('Free browser URL is not configured');
  const current = await ensureView();
  if (current.webContents.getURL() !== url) await current.webContents.loadURL(url);
  return current;
}

export async function attach(url?: string, nextTop?: number) {
  const current = await openSite(url || home);
  if (nextTop !== undefined) top = nextTop;
  if (win && !attached) {
    win.contentView.addChildView(current);
    attached = true;
  }
  updateBounds();
  return current.webContents.getURL();
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
  await openSite(url);
}

export function back() { void view?.webContents.goBack(); }
export function forward() { void view?.webContents.goForward(); }
export function reload() { view?.webContents.reload(); }
