import type { Locator, Page } from 'playwright';
import type { TempMailAdapter, TempMailMessage } from './types';

const EMAIL_RE = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i;
const STOP = Symbol('stop');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function extractCode(text: string) {
  return text.match(/\b(\d{6})\b/)?.[1] ?? text.match(/\b(\d{4,8})\b/)?.[1] ?? null;
}

async function firstVisible(page: Page, selectors: string[]): Promise<Locator | null> {
  for (const selector of selectors) {
    try {
      const loc = page.locator(selector).first();
      if (await loc.count() && await loc.isVisible()) return loc;
    } catch { /* try next selector */ }
  }
  return null;
}

async function visibleRows(page: Page, selectors: string[]): Promise<Locator[]> {
  for (const selector of selectors) {
    try {
      const loc = page.locator(selector);
      const rows: Locator[] = [];
      for (let i = 0; i < await loc.count(); i++) {
        if (await loc.nth(i).isVisible()) rows.push(loc.nth(i));
      }
      if (rows.length) return rows;
    } catch { /* try next selector */ }
  }
  return [];
}

async function textOf(loc: Locator) {
  const tag = await loc.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
  return (tag === 'input' || tag === 'textarea' ? await loc.inputValue() : await loc.innerText()).trim();
}

export type Selectors = Partial<Record<'address' | 'copy' | 'regenerate' | 'inbox' | 'body', string[]>>;

const DEFAULT_SELECTORS: Required<Selectors> = {
  address: ['input[readonly]', 'input#mail', 'input[name="email"]', '[data-testid="email-address"]', '.email-address'],
  copy: ['button[title*="copy" i]', 'button[aria-label*="copy" i]', '[data-testid="copy-email"]', '.copy-button'],
  regenerate: ['button:has-text("Generate")', 'button:has-text("New")', 'button[title*="refresh" i]', '.generate-button'],
  inbox: ['.email-list li', '.message-list li', '.mail-list .mail-item', '[data-testid="email-item"]', 'li:has-text("Verify")'],
  body: ['.email-content', '.message-body', '.mail-content', '[data-testid="email-body"]', 'article'],
};

/** Playwright-driven temp-mail adapter. Selectors are intentionally overridable for live tuning. */
export class GenericTempMailAdapter implements TempMailAdapter {
  private selectors: Required<Selectors>;

  constructor(
    public key: string,
    public name: string,
    private page: Page,
    overrides: Selectors = {},
  ) {
    this.selectors = { ...DEFAULT_SELECTORS, ...overrides };
  }

  async readAddress() {
    const loc = await firstVisible(this.page, this.selectors.address);
    if (!loc) throw new Error(`${this.name}: email address not found`);
    const email = (await textOf(loc)).match(EMAIL_RE)?.[0];
    if (!email) throw new Error(`${this.name}: unrecognized email address`);
    return email;
  }

  async copyAddress() {
    const button = await firstVisible(this.page, this.selectors.copy);
    if (button) await button.click({ timeout: 3000 }).catch(() => undefined);
    const clipboard = await this.page.evaluate(async () => {
      try { return await navigator.clipboard.readText(); } catch { return ''; }
    }).catch(() => '');
    return clipboard.match(EMAIL_RE)?.[0] ?? this.readAddress();
  }

  async regenerate() {
    const button = await firstVisible(this.page, this.selectors.regenerate);
    if (button) await button.click({ timeout: 3000 }).catch(() => undefined);
    else await this.page.reload({ waitUntil: 'domcontentloaded' });
    await this.page.waitForTimeout(500);
    return this.copyAddress().catch(() => this.readAddress());
  }

  async listMessages(): Promise<TempMailMessage[]> {
    const rows = await visibleRows(this.page, this.selectors.inbox);
    const messages: TempMailMessage[] = [];
    for (const row of rows) {
      const preview = await textOf(row);
      if (!preview) continue;
      messages.push({
        subject: preview.split('\n')[0].slice(0, 160),
        preview: preview.slice(0, 300),
        code: extractCode(preview),
      });
    }
    return messages;
  }

  async openMessage(index: number): Promise<TempMailMessage> {
    const rows = await visibleRows(this.page, this.selectors.inbox);
    const row = rows[index];
    if (!row) throw new Error(`${this.name}: message ${index} not found`);

    const preview = await textOf(row);
    await row.click({ timeout: 3000 }).catch(() => undefined);
    const bodyLoc = await firstVisible(this.page, this.selectors.body);
    const body = bodyLoc ? await textOf(bodyLoc) : await this.page.locator('body').innerText();

    return {
      subject: preview.split('\n')[0].slice(0, 160),
      preview: preview.slice(0, 300),
      body: body.slice(0, 4000),
      code: extractCode(`${preview}\n${body}`),
    };
  }

  async waitForCode(timeoutMs = 180_000, abort?: Promise<unknown>): Promise<{ code: string; message: TempMailMessage }> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = (abort
        ? await Promise.race([this.findCode().catch(() => null), abort.then(() => STOP)])
        : await this.findCode().catch(() => null)) as TempMailMessage | null | typeof STOP;

      if (found === STOP) throw new Error('Stopped');
      if (found?.code) return { code: found.code, message: found };
      await sleep(2000);
    }
    throw new Error(`${this.name}: OTP timeout`);
  }

  private async findCode(): Promise<TempMailMessage | null> {
    const rows = await visibleRows(this.page, this.selectors.inbox);
    for (let i = 0; i < rows.length; i++) {
      const preview = await textOf(rows[i]);
      const direct = extractCode(preview);
      if (direct) return { subject: preview.split('\n')[0], preview, code: direct };

      const opened = await this.openMessage(i).catch(() => null);
      if (opened?.code) return opened;
    }
    return null;
  }
}
