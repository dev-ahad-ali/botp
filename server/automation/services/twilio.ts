import type { AutomationService, ServiceView } from '../types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Deliberate pause between steps so the page can settle before the next action. */
const pause = () => sleep(400);

const AT_STAGE = `(stage) => {
  const heading = (document.querySelector('#form-heading')?.textContent || '').toLowerCase();
  if (stage === 'signup') return !!document.querySelector('#first-name') && !!document.querySelector('#email');
  if (stage === 'email') return heading.includes('verify your email') || !!document.querySelector('[data-testid="verify-btn"]');
  if (stage === 'phone') return heading.includes('two-factor') || !!document.querySelector('#phone-input');
  return false;
}`;

const SET_VALUE = `(el, value) => {
  if (!el) return false;
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}`;

const FILL_SIGNUP = `(arg) => {
  const set = ${SET_VALUE};
  const firstName = set(document.querySelector('#first-name') || document.querySelector('input[name="ulp-first-name"]'), arg.firstName);
  const lastName = set(document.querySelector('#last-name') || document.querySelector('input[name="ulp-last-name"]'), arg.lastName);
  const email = set(document.querySelector('#email') || document.querySelector('input[name="email"]'), arg.email);
  const password = set(document.querySelector('#password') || document.querySelector('input[name="password"]'), arg.password);
  const checkbox = document.querySelector('#terms-of-service') || document.querySelector('input[name="ulp-terms-of-service"]') || document.querySelector('input[type="checkbox"]');
  if (checkbox && !checkbox.checked) checkbox.click();
  return { firstName, lastName, email, password, terms: !!(checkbox && checkbox.checked) };
}`;

const READ_SIGNUP = `() => {
  const value = (selector) => (document.querySelector(selector)?.value || '').trim();
  const checkbox = document.querySelector('#terms-of-service') || document.querySelector('input[name="ulp-terms-of-service"]') || document.querySelector('input[type="checkbox"]');
  return {
    firstName: value('#first-name') || value('input[name="ulp-first-name"]'),
    lastName: value('#last-name') || value('input[name="ulp-last-name"]'),
    email: value('#email') || value('input[name="email"]'),
    password: value('#password') || value('input[name="password"]'),
    terms: !!(checkbox && checkbox.checked),
  };
}`;

const SUBMIT_SIGNUP = `() => {
  const button = document.querySelector('button[data-action-button-primary][type="submit"]')
    || document.querySelector('form[data-form-primary] button[type="submit"]')
    || document.querySelector('button[type="submit"]');
  if (button) { button.click(); return true; }
  return false;
}`;

const FILL_CODE = `(arg) => {
  const set = ${SET_VALUE};
  const input = document.querySelector('#mui-1') || document.querySelector('input[placeholder=" "]') || document.querySelector('input[type="text"]');
  return set(input, arg.code);
}`;

const READ_CODE = `() => {
  const input = document.querySelector('#mui-1') || document.querySelector('input[placeholder=" "]') || document.querySelector('input[type="text"]');
  return (input?.value || '').trim();
}`;

const SUBMIT_CODE = `() => {
  const button = document.querySelector('[data-testid="verify-btn"]')
    || Array.from(document.querySelectorAll('button')).find((b) => /verify/i.test(b.textContent || ''));
  if (button) { button.click(); return true; }
  return false;
}`;

const COUNTRY_OPTIONS = `() => {
  const input = document.querySelector('#mui-2') || document.querySelector('input[role="combobox"]');
  if (input) input.focus();
  const open = document.querySelector('button[aria-label="Open"]') || document.querySelector('button[title="Open"]');
  if (open) open.click();
  return Array.from(document.querySelectorAll('[role="option"], li'))
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
  const set = ${SET_VALUE};
  const input = document.querySelector('#phone-input') || document.querySelector('input[name="phoneNumber"]') || document.querySelector('input[type="tel"]');
  return set(input, arg.phone);
}`;

const READ_PHONE = `() => {
  const input = document.querySelector('#phone-input') || document.querySelector('input[name="phoneNumber"]') || document.querySelector('input[type="tel"]');
  return (input?.value || '').trim();
}`;

const SUBMIT_PHONE = `() => {
  const button = document.querySelector('#send-sms-btn') || document.querySelector('button[type="submit"]');
  if (button) { button.click(); return true; }
  return false;
}`;

export async function waitForStage(view: ServiceView, stage: 'signup' | 'email' | 'phone', stop: () => boolean, timeoutMs = 45_000) {
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

  async waitForStart(view, stop, timeoutMs) {
    await waitForStage(view, 'signup', stop, timeoutMs ?? 30_000);
  },

  async run(ctx) {
    const { view, email, password, firstName, lastName, number, getCode, log, stop } = ctx;
    const fields = { firstName, lastName, email, password };

    await view.goto(this.startUrl);
    await waitForStage(view, 'signup', stop);
    await pause();

    let read = await view.evaluate<typeof fields & { terms: boolean }>(READ_SIGNUP);
    const matches = (v: typeof read) => v.firstName === firstName && v.lastName === lastName && v.email === email && v.password === password && v.terms;
    if (!matches(read)) {
      await view.evaluate(FILL_SIGNUP, fields);
      await pause();
      read = await view.evaluate<typeof read>(READ_SIGNUP);
    }
    if (!matches(read)) throw new Error('Twilio: signup form was not filled correctly');
    await pause();
    if (!await view.evaluate<boolean>(SUBMIT_SIGNUP)) throw new Error('Twilio: signup submit button not found');
    await log('signup form submitted', read);
    await pause();

    await waitForStage(view, 'email', stop);
    if (stop()) return;
    await pause();
    await log('waiting for email verification code');
    const code = await getCode();
    if (stop()) return;
    await pause();
    await view.evaluate<boolean>(FILL_CODE, { code });
    await pause();
    if ((await view.evaluate<string>(READ_CODE)) !== code) throw new Error('Twilio: code was not entered');
    await pause();
    if (!await view.evaluate<boolean>(SUBMIT_CODE)) throw new Error('Twilio: verify button not found');
    await log(`email code submitted: ${code}`);
    await pause();

    await waitForStage(view, 'phone', stop);
    if (stop()) return;
    await pause();
    await view.evaluate<string[]>(COUNTRY_OPTIONS);
    await pause();
    const selectedCountry = await view.evaluate<string>(SELECT_COUNTRY, {
      country: number.country,
      countryCode: number.countryCode,
      dialCode: number.dialCode,
      full: number.full,
    });
    await log('country selected', { selectedCountry });
    await pause();
    await view.evaluate<boolean>(FILL_PHONE, { phone: number.national });
    await pause();
    if ((await view.evaluate<string>(READ_PHONE)) !== number.national) throw new Error('Twilio: phone was not entered');
    await pause();
    if (!await view.evaluate<boolean>(SUBMIT_PHONE)) throw new Error('Twilio: send SMS button not found');
    await log(`phone submitted: ${number.phone}`, { selectedCountry });
    await pause();

    if (stop()) return;
  },
};
