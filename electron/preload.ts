import { contextBridge, ipcRenderer } from 'electron';
import type { Api } from '../src/lib/ipc';

const api: Api = {
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    set: (key, value) => ipcRenderer.invoke('config:set', key, value),
  },
  providers: {
    list: () => ipcRenderer.invoke('providers:list'),
    add: (p) => ipcRenderer.invoke('providers:add', p),
    setEnabled: (id, enabled) => ipcRenderer.invoke('providers:setEnabled', id, enabled),
  },
  ranges: {
    list: () => ipcRenderer.invoke('ranges:list'),
    add: (r) => ipcRenderer.invoke('ranges:add', r),
    setEnabled: (id, enabled) => ipcRenderer.invoke('ranges:setEnabled', id, enabled),
  },
  services: { list: () => ipcRenderer.invoke('services:list') },
  runs: { list: (limit) => ipcRenderer.invoke('runs:list', limit) },
  smoke: { number: (cfg) => ipcRenderer.invoke('smoke:number', cfg) },
  tempMail: {
    open: (providerId) => ipcRenderer.invoke('tempMail:open', providerId),
    refresh: () => ipcRenderer.invoke('tempMail:refresh'),
    copy: () => ipcRenderer.invoke('tempMail:copy'),
    regenerate: () => ipcRenderer.invoke('tempMail:regenerate'),
    waitForCode: (timeoutMs) => ipcRenderer.invoke('tempMail:waitForCode', timeoutMs),
    close: () => ipcRenderer.invoke('tempMail:close'),
    onEvent: (cb) => {
      const listener = (_e: unknown, evt: Parameters<typeof cb>[0]) => cb(evt);
      ipcRenderer.on('tempMail:event', listener);
      return () => ipcRenderer.removeListener('tempMail:event', listener);
    },
  },
  automation: {
    start: () => ipcRenderer.invoke('automation:start'),
    stop: () => ipcRenderer.invoke('automation:stop'),
    onEvent: (cb) => {
      const listener = (_e: unknown, evt: Parameters<typeof cb>[0]) => cb(evt);
      ipcRenderer.on('automation:event', listener);
      return () => ipcRenderer.removeListener('automation:event', listener);
    },
  },
  freeBrowser: {
    attach: (url, top) => ipcRenderer.invoke('freeBrowser:attach', url, top),
    setTop: (top) => ipcRenderer.invoke('freeBrowser:setTop', top),
    navigate: (url) => ipcRenderer.invoke('freeBrowser:navigate', url),
    detach: () => ipcRenderer.invoke('freeBrowser:detach'),
    back: () => ipcRenderer.invoke('freeBrowser:back'),
    forward: () => ipcRenderer.invoke('freeBrowser:forward'),
    reload: () => ipcRenderer.invoke('freeBrowser:reload'),
    onUrl: (cb) => {
      const listener = (_e: unknown, url: string) => cb(url);
      ipcRenderer.on('freeBrowser:url', listener);
      return () => ipcRenderer.removeListener('freeBrowser:url', listener);
    },
  },
};

contextBridge.exposeInMainWorld('api', api);
