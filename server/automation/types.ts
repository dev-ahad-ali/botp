import type { NumberInfo } from '../numbers/client';

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

/** Minimal view contract so service adapters do not depend on Playwright or Electron directly. */
export type ServiceView = {
  goto: (url: string) => Promise<void>;
  evaluate: <T>(fn: string, arg?: unknown) => Promise<T>;
  url: () => string;
};

export type RunContext = {
  view: ServiceView;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  number: NumberInfo;
  rangeDisplay: string;
  getCode: () => Promise<string>;
  log: (msg: string, data?: unknown) => Promise<void>;
  stop: () => boolean;
};

export interface AutomationService {
  key: string;
  name: string;
  startUrl: string;
  /** Optional hook used after a reset to confirm the form is ready before the next run. */
  waitForStart?(view: ServiceView, stop: () => boolean, timeoutMs?: number): Promise<void>;
  run(ctx: RunContext): Promise<void>;
}
