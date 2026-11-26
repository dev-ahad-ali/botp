import type { Page } from 'playwright';

export type AutomationEvent =
  | { type: 'status'; running: boolean }
  | { type: 'log'; runId: number; message: string; data?: unknown }
  | { type: 'run:start'; runId: number; range: string; pkg: string }
  | { type: 'run:info'; runId: number; phone?: string; email?: string; range?: string }
  | { type: 'run:done'; runId: number; status: 'success' | 'failed' | 'stopped'; error?: string };

export type RunContext = {
  page: Page;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  rangeDisplay: string;
  getOtp: () => Promise<string>;
  log: (msg: string, data?: unknown) => Promise<void>;
  stop: () => boolean;
};

export interface AutomationService {
  key: string;
  name: string;
  startUrl: string;
  run(ctx: RunContext): Promise<void>;
}
