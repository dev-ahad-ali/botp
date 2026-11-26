import { generateEmail, getEmails, type EmailInfo } from 'tempmail-sdk';
import type { MailPackage } from './types';
import { findOtp, sleep } from './types';

export class TempMailSdkPackage implements MailPackage {
  key = 'tempmail-sdk';

  async createInbox() {
    const info = await generateEmail();
    if (!info) throw new Error('tempmail-sdk: no channel available');
    return { address: info.email, session: info };
  }

  async waitForOtp(session: unknown, timeoutMs = 180_000) {
    const info = session as EmailInfo;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const res = await getEmails(info);
      for (const mail of res.emails) {
        const otp = findOtp(`${mail.subject}\n${mail.text}\n${mail.html}`);
        if (otp) return otp;
      }
      await sleep(4000);
    }
    return null;
  }

  async dispose() {
    // The SDK has no inbox deletion API; inboxes expire on their own.
  }
}
