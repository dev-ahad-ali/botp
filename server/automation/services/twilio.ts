import type { AutomationService } from '../types';

export const twilioService: AutomationService = {
  key: 'twilio',
  name: 'Twilio',
  startUrl: 'https://www.twilio.com/try-twilio',

  async run(ctx) {
    const { page, email, password, firstName, lastName, phone, getOtp, log, stop } = ctx;

    await page.goto(this.startUrl, { waitUntil: 'domcontentloaded' });
    await log('opened Twilio signup');

    await page.getByLabel(/first name/i).fill(firstName);
    await page.getByLabel(/last name/i).fill(lastName);
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await log('signup form filled');

    const cb = page.locator('input[type="checkbox"]').first();
    if (await cb.count() && !(await cb.isChecked())) await cb.check();

    await page.getByRole('button', { name: /submit|next|continue|start/i }).first().click();
    await log('signup form submitted');

    await log('waiting for email OTP…');
    const otp = await getOtp();
    await page.getByRole('textbox').first().fill(otp);
    await page.getByRole('button', { name: /submit|verify|next|continue/i }).first().click();
    await log(`email OTP accepted: ${otp}`);

    const phoneInput = page.getByRole('textbox', { name: /phone|number/i }).first();
    await phoneInput.fill(phone);
    await page.getByRole('button', { name: /submit|verify|next|continue/i }).first().click();
    await log(`phone submitted: ${phone}`);

    if (stop()) return;
  },
};
