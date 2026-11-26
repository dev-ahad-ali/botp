export type Provider = {
  id: number; name: string; domain: string; enabled: boolean; isBuiltin: boolean; sortOrder: number;
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

export type AutomationEvent =
  | { type: 'status'; running: boolean }
  | { type: 'log'; runId: number; message: string; data?: unknown }
  | { type: 'run:start'; runId: number; range: string; pkg: string }
  | { type: 'run:info'; runId: number; phone?: string; email?: string; range?: string }
  | { type: 'run:done'; runId: number; status: 'success' | 'failed' | 'stopped'; error?: string };

export type Api = {
  config: {
    get: () => Promise<Record<string, string>>;
    set: (key: string, value: string) => Promise<unknown>;
  };
  providers: {
    list: () => Promise<Provider[]>;
    add: (p: { name: string; domain?: string }) => Promise<Provider>;
    setEnabled: (id: number, enabled: boolean) => Promise<Provider>;
  };
  ranges: {
    list: () => Promise<Range[]>;
    add: (r: { display: string }) => Promise<Range>;
    setEnabled: (id: number, enabled: boolean) => Promise<Range>;
  };
  services: { list: () => Promise<Service[]> };
  runs: { list: (limit?: number) => Promise<RunRow[]> };
  smoke: {
    inbox: () => Promise<{ pkg: string; address: string }>;
    number: () => Promise<{ phone: string; range: string }>;
  };
  automation: {
    start: () => Promise<void>;
    stop: () => Promise<void>;
    onEvent: (cb: (e: AutomationEvent) => void) => () => void;
  };
  freeBrowser: {
    attach: (url: string) => Promise<void>;
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
