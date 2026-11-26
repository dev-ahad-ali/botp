export interface Inbox {
  address: string;
  session: unknown;
}

export interface MailPackage {
  key: string;
  createInbox(): Promise<Inbox>;
  waitForOtp(session: unknown, timeoutMs?: number): Promise<string | null>;
  dispose(session: unknown): Promise<void>;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const findOtp = (text: string) => text.match(/\b(\d{6})\b/)?.[1] ?? null;
