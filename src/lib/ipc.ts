export type Provider = {
  id: number;
  name: string;
  domain: string;
  url: string;
  adapterKey: string;
  enabled: boolean;
  isBuiltin: boolean;
  sortOrder: number;
};
export type Range = { id: number; display: string; prefix: string; enabled: boolean; sortOrder: number };
export type Service = { id: number; key: string; name: string; enabled: boolean };
export type RunRow = {
  id: number;
  serviceKey: string;
  rangeId: number | null;
  status: string;
  startedAt: string | Date;
  endedAt: string | Date | null;
  error: string | null;
  logs: { level: string; message: string; createdAt: string | Date }[];
};

export type TempMailMessage = { subject: string; preview: string; body?: string; code?: string | null };
export type TempMailEvent =
  | { type: 'temp:open'; service: string; url: string }
  | { type: 'temp:address'; address: string }
  | { type: 'temp:code'; code: string };

export type AutomationEvent =
  | { type: 'status'; running: boolean }
  | { type: 'stage'; stage: 'idle' | 'signup' | 'email-code' | 'phone' | 'done' }
  | { type: 'focus'; tab: 'service' | 'tempsite' }
  | { type: 'log'; runId: number; message: string; data?: unknown }
  | { type: 'run:start'; runId: number; range: string; pkg: string }
  | { type: 'run:info'; runId: number; phone?: string; email?: string; range?: string }
  | { type: 'run:done'; runId: number; status: 'success' | 'failed' | 'stopped'; error?: string }
  | TempMailEvent;

export type Api = {
  config: {
    get: () => Promise<Record<string, string>>;
    set: (key: string, value: string) => Promise<unknown>;
  };
  providers: {
    list: () => Promise<Provider[]>;
    add: (p: { url: string; name?: string; domain?: string; adapterKey?: string }) => Promise<Provider>;
    setEnabled: (id: number, enabled: boolean) => Promise<Provider>;
  };
  ranges: {
    list: () => Promise<Range[]>;
    add: (r: { display: string }) => Promise<Range>;
    setEnabled: (id: number, enabled: boolean) => Promise<Range>;
  };
  services: { list: () => Promise<Service[]> };
  serviceSite: {
    resolve: () => Promise<{ service: string; url: string; key: string }>;
    reset: () => Promise<void>;
    attach: (url: string, top?: number) => Promise<void>;
    setTop: (top: number) => Promise<void>;
    navigate: (url: string) => Promise<void>;
    detach: () => Promise<void>;
    back: () => Promise<void>;
    forward: () => Promise<void>;
    reload: () => Promise<void>;
    onUrl: (cb: (url: string) => void) => () => void;
  };
  runs: { list: (limit?: number) => Promise<RunRow[]> };
  smoke: {
    number: (cfg?: { url?: string; header?: string; rangeId?: string }) => Promise<{ phone: string; range: string }>;
  };
  tempMail: {
    onEvent: (cb: (e: TempMailEvent) => void) => () => void;
  };
  tempSite: {
    open: (providerId?: number) => Promise<{ address: string; service: string; url: string }>;
    attach: (url?: string, top?: number) => Promise<string>;
    setTop: (top: number) => Promise<void>;
    navigate: (url: string) => Promise<void>;
    detach: () => Promise<void>;
    reload: () => Promise<void>;
    address: () => Promise<string>;
    copy: () => Promise<string>;
    regenerate: () => Promise<string>;
    delete: () => Promise<string>;
    messages: () => Promise<TempMailMessage[]>;
    openMessage: (index: number) => Promise<TempMailMessage>;
    waitForCode: (timeoutMs?: number) => Promise<{ code: string; message: TempMailMessage }>;
    onUrl: (cb: (url: string) => void) => () => void;
  };
  automation: {
    start: () => Promise<void>;
    stop: () => Promise<void>;
    onEvent: (cb: (e: AutomationEvent) => void) => () => void;
  };
  browser: { reset: () => Promise<void> };
  freeBrowser: {
    attach: (url: string, top?: number) => Promise<void>;
    setTop: (top: number) => Promise<void>;
    navigate: (url: string) => Promise<void>;
    detach: () => Promise<void>;
    back: () => Promise<void>;
    forward: () => Promise<void>;
    reload: () => Promise<void>;
    onUrl: (cb: (url: string) => void) => () => void;
  };
};

declare global {
  interface Window { api: Api }
}

export const api = window.api;
