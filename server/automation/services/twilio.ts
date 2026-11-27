import type { AutomationService, ServiceView } from '../types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const AT_STAGE = `(stage) => {
  const heading = (document.querySelector('#form-heading')?.textContent || '').toLowerCase();
  const text = (document.body.innerText || '').toLowerCase();
  if (stage === 'signup') return !!document.querySelector('#first-name') && !!document.querySelector('#email');
  if (stage === 'email') return heading.includes('verify your email') || !!document.querySelector('[data-testid="verify-btn"]');
  if (stage === 'phone') return heading.includes('two-factor') || !!document.querySelector('#phone-input');
  return false;
}`;

const FILL_SIGNUP = `(arg) => {
  const set = (el, value) => {
    if (!el) return false;
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  };
  const firstName = set(document.querySelector('#first-name') || document.querySelector('input[name="ulp-first-name"]'), arg.firstName);
  const lastName = set(document.querySelector('#last-name') || document.querySelector('input[name="ulp-last-name"]'), arg.lastName);
  const email = set(document.querySelector('#email') || document.querySelector('input[name="email"]'), arg.email);
  const password = set(document.querySelector('#password') || document.querySelector('input[name="password"]'), arg.password);
  const checkbox = document.querySelector('#terms-of-service') || document.querySelector('input[name="ulp-terms-of-service"]') || document.querySelector('input[type="checkbox"]');
  if (checkbox && !checkbox.checked) checkbox.click();
  const button = document.querySelector('button[data-action-button-primary][type="submit"]')
    || document.querySelector('form[data-form-primary] button[type="submit"]')
    || document.querySelector('button[type="submit"]');
  if (button) button.click();
  return { firstName, lastName, email, password, submitted: !!button };
}`;

const FILL_CODE = `(arg) => {
  const set = (el, value) => {
    if (!el) return false;
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  };
  const input = document.querySelector('#mui-1')
    || document.querySelector('input[placeholder=" "]')
    || document.querySelector('input[type="text"]');
  const filled = set(input, arg.code);
  const button = document.querySelector('[data-testid="verify-btn"]')
    || Array.from(document.querySelectorAll('button')).find((b) => /verify/i.test(b.textContent || ''));
  if (button) button.click();
  return { filled, submitted: !!button };
}`;

const COUNTRY_OPTIONS = `() => {
  const input = document.querySelector('#mui-2') || document.querySelector('input[role="combobox"]');
  if (input) input.focus();
  const open = document.querySelector('button[aria-label="Open"]') || document.querySelector('button[title="Open"]');
  if (open) open.click();
  const options = Array.from(document.querySelectorAll('[role="option"], li'));
  return options
    .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    .map((el) => ((el.textContent || el.innerText || '') + '').trim().replace(/\\s+/g, ' '))
    .filter((text) => text && text.length < 100)
    .slice(0, 300);
}`;

const SELECT_COUNTRY = `(arg) => {
  const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const names = [arg.country, arg.countryCode].filter(Boolean).map(normalize).filter((w) => w.length > 1 && !/^\\d+$/.test(w));
  const dial = normalize(arg.dialCode);
  const fullDigits = (arg.full || '').replace(/\\D/g, '');
  const options = Array.from(document.querySelectorAll('[role="option"], li'))
    .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    .map((el) => ({ el, text: ((el.textContent || el.innerText || '') + '').trim().replace(/\\s+/g, ' ') }))
    .filter((o) => o.text && o.text.length < 100);

  const match = options.find((o) => names.some((w) => normalize(o.text).includes(w)))
    || (dial && options.find((o) => normalize(o.text).includes(dial)))
    || (fullDigits && options.find((o) => {
      const optionDial = (o.text.match(/\\+\\d+/) || [''])[0].replace(/\\D/g, '');
      return optionDial && fullDigits.startsWith(optionDial);
    }));

  if (match) {
    match.el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    match.el.click();
    return match.text;
  }
  return '';
}`;

const FILL_PHONE = `(arg) => {
  const set = (el, value) => {
    if (!el) return false;
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  };
  const input = document.querySelector('#phone-input') || document.querySelector('input[name="phoneNumber"]') || document.querySelector('input[type="tel"]');
  const filled = set(input, arg.phone);
  const button = document.querySelector('#send-sms-btn') || document.querySelector('button[type="submit"]');
  if (button) button.click();
  return { filled, submitted: !!button };
}`;

async function waitForStage(view: ServiceView, stage: 'signup' | 'email' | 'phone', stop: () => boolean, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (stop()) throw new Error('Stopped');
    if (await view.evaluate<boolean>(AT_STAGE, stage)) return;
    await sleep(250);
  }
  throw new Error(`Twilio: ${stage} stage not reached`);
}

export const twilioService: AutomationService = {
  key: 'twilio',
  name: 'Twilio',
  startUrl: 'https://www.twilio.com/try-twilio',

  async run(ctx) {
    const { view, email, password, firstName, lastName, number, getCode, log, stop } = ctx;
    const fields = { firstName, lastName, email, password };

    await view.goto(this.startUrl);
    await waitForStage(view, 'signup', stop);
    let signup = await view.evaluate<Record<string, boolean>>(FILL_SIGNUP, fields);
    // React can mount the inputs just after our first pass; retry once before giving up.
    if (!signup.firstName || !signup.lastName || !signup.email || !signup.password) {
      await sleep(500);
      signup = await view.evaluate<Record<string, boolean>>(FILL_SIGNUP, fields);
    }
    if (!signup.submitted) throw new Error('Twilio: signup submit button not found');
    await log('signup form submitted', signup);

    await waitForStage(view, 'email', stop);
    if (stop()) return;
    await log('waiting for email verification code');
    const code = await getCode();
    if (stop()) return;
    const verify = await view.evaluate<Record<string, boolean>>(FILL_CODE, { code });
    if (!verify.submitted) throw new Error('Twilio: verify button not found');
    await log(`email code submitted: ${code}`);

    await waitForStage(view, 'phone', stop);
    if (stop()) return;
    const options = await view.evaluate<string[]>(COUNTRY_OPTIONS);
    const selectedCountry = await view.evaluate<string>(SELECT_COUNTRY, {
      country: number.country,
      countryCode: number.countryCode,
      dialCode: number.dialCode,
      full: number.full,
    });
    await log('country selected', { selectedCountry, options: options.slice(0, 12) });
    const phone = await view.evaluate<Record<string, boolean>>(FILL_PHONE, { phone: number.national });
    if (!phone.submitted) throw new Error('Twilio: send SMS button not found');
    await log(`phone submitted: ${number.phone}`, { selectedCountry });

    if (stop()) return;
  },
};
