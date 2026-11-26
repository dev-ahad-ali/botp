import { MailBucket } from 'mailbucket';
import type { MailPackage } from './types';
import { findOtp, sleep } from './types';

type Account = {
  providerName: string;
  address: string;
  providerData: Record<string, unknown>;
};

export class MailBucketPackage implements MailPackage {
  key: string;
  private client = new MailBucket();

  constructor(private provider?: string) {
    this.key = `mailbucket:${provider ?? 'random'}`;
  }

  async createInbox() {
    const res = await this.client.createAccount(this.provider);
    if (!res.success || !res.data) throw new Error(`mailbucket: ${res.message ?? 'inbox failed'}`);
    return { address: res.data.address, session: res.data as Account };
  }

  async waitForOtp(session: unknown, timeoutMs = 180_000) {
    const account = session as Account;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const res = await this.client.getMessages(account);
      for (const summary of res.data ?? []) {
        const detail = await this.client.getMessage(account, summary.id);
        const text = `${detail.data?.subject ?? summary.subject}\n${detail.data?.bodyText ?? detail.data?.bodyHtml ?? summary.intro ?? ''}`;
        const otp = findOtp(text);
        if (otp) return otp;
      }
      await sleep(4000);
    }
    return null;
  }

  async dispose(session: unknown) {
    await this.client.deleteAccount(session as Account).catch(() => undefined);
  }
}
