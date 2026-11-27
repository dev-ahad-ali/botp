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
  serviceSite: {
    resolve: () => ipcRenderer.invoke('serviceSite:resolve'),
    reset: () => ipcRenderer.invoke('serviceSite:reset'),
    attach: (url, top) => ipcRenderer.invoke('serviceSite:attach', url, top),
    setTop: (top) => ipcRenderer.invoke('serviceSite:setTop', top),
    navigate: (url) => ipcRenderer.invoke('serviceSite:navigate', url),
    detach: () => ipcRenderer.invoke('serviceSite:detach'),
    back: () => ipcRenderer.invoke('serviceSite:back'),
    forward: () => ipcRenderer.invoke('serviceSite:forward'),
    reload: () => ipcRenderer.invoke('serviceSite:reload'),
    onUrl: (cb) => {
      const listener = (_e: unknown, url: string) => cb(url);
      ipcRenderer.on('serviceSite:url', listener);
      return () => ipcRenderer.removeListener('serviceSite:url', listener);
    },
  },
  runs: { list: (limit) => ipcRenderer.invoke('runs:list', limit) },
  smoke: { number: (cfg) => ipcRenderer.invoke('smoke:number', cfg) },
  tempMail: {
    onEvent: (cb) => {
      const listener = (_e: unknown, evt: Parameters<typeof cb>[0]) => cb(evt);
      ipcRenderer.on('tempMail:event', listener);
      return () => ipcRenderer.removeListener('tempMail:event', listener);
    },
  },
  tempSite: {
    open: (providerId) => ipcRenderer.invoke('tempSite:open', providerId),
    attach: (url, top) => ipcRenderer.invoke('tempSite:attach', url, top),
    setTop: (top) => ipcRenderer.invoke('tempSite:setTop', top),
    navigate: (url) => ipcRenderer.invoke('tempSite:navigate', url),
    detach: () => ipcRenderer.invoke('tempSite:detach'),
    reload: () => ipcRenderer.invoke('tempSite:reload'),
    address: () => ipcRenderer.invoke('tempSite:address'),
    copy: () => ipcRenderer.invoke('tempSite:copy'),
    regenerate: () => ipcRenderer.invoke('tempSite:regenerate'),
    delete: () => ipcRenderer.invoke('tempSite:delete'),
    messages: () => ipcRenderer.invoke('tempSite:messages'),
    openMessage: (index) => ipcRenderer.invoke('tempSite:openMessage', index),
    waitForCode: (timeoutMs) => ipcRenderer.invoke('tempSite:waitForCode', timeoutMs),
    onUrl: (cb) => {
      const listener = (_e: unknown, url: string) => cb(url);
      ipcRenderer.on('tempSite:url', listener);
      return () => ipcRenderer.removeListener('tempSite:url', listener);
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
  browser: { reset: () => ipcRenderer.invoke('browser:reset') },
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
