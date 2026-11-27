import type { BrowserWindow } from 'electron';
import { WebContentsView } from 'electron';

let win: BrowserWindow | null = null;
let view: WebContentsView | null = null;
let attached = false;
let top = 120;
let siteUrl = '';
let startUrl = '';

export function setMainWindow(window: BrowserWindow) {
  win = window;
}

export function getUrl() {
  return siteUrl;
}

export function getStartUrl() {
  return startUrl;
}

export function updateBounds() {
  if (!view || !win) return;
  const [width, height] = win.getContentSize();
  view.setBounds({ x: 0, y: top, width, height: Math.max(height - top, 0) });
}

async function ensureView() {
  if (!view) {
    view = new WebContentsView({ webPreferences: { sandbox: true } });
    const track = (_e: Electron.Event, url: string) => {
      siteUrl = url;
      win?.webContents.send('serviceSite:url', url);
    };
    view.webContents.on('did-navigate', track);
    view.webContents.on('did-navigate-in-page', track);
  }
  return view;
}

/** Loads a URL without attaching the view. Used by the automation engine. */
export async function openSite(url: string) {
  if (!url) throw new Error('Service URL is not configured');
  const current = await ensureView();
  if (siteUrl !== url) {
    await current.webContents.loadURL(url);
    siteUrl = url;
  }
  return current;
}

export async function attach(url?: string, nextTop?: number) {
  const current = await openSite(url || siteUrl || startUrl);
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
  // Manual navigation stays on the configured service entry page; the adapter may still
  // move through its own internal pages while the automation is running.
  if (startUrl && url !== startUrl) throw new Error('Service: only the configured start URL is allowed');
  await openSite(url);
}

export function back() { void view?.webContents.goBack(); }
export function forward() { void view?.webContents.goForward(); }
export function reload() { view?.webContents.reload(); }

export async function evaluate<T>(fn: string, arg?: unknown): Promise<T> {
  const current = await ensureView();
  return current.webContents.executeJavaScript(`(${fn})(${JSON.stringify(arg ?? null)})`, true) as Promise<T>;
}

export function rememberStartUrl(url: string) {
  startUrl = url;
}

export async function reset() {
  if (!startUrl) return;
  const current = await ensureView();
  // Always reload: the form may still be on the start URL after an in-page navigation.
  await current.webContents.loadURL(startUrl);
  siteUrl = startUrl;
  win?.webContents.send('serviceSite:url', startUrl);
}
