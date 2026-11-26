import type { Page } from 'playwright';
import { GenericTempMailAdapter, type Selectors } from './generic';
import type { TempMailAdapter } from './types';

export function getAdapter(key: string, name: string, page: Page): TempMailAdapter {
  if (key === 'tempmail-org') {
    const overrides: Selectors = {
      address: ['input#mail', 'input[name="mail"]', 'input[readonly]', '[data-testid="email-address"]'],
      copy: ['button[title*="copy" i]', 'button[aria-label*="copy" i]', '.copy-button', '[data-testid="copy-email"]'],
      regenerate: ['button:has-text("Generate")', 'button:has-text("New")', 'button[title*="refresh" i]'],
      inbox: ['.email-list li', '.message-list li', '.mail-list .mail-item', '[data-testid="email-item"]'],
      body: ['.email-content', '.message-body', '.mail-content', '[data-testid="email-body"]'],
    };
    return new GenericTempMailAdapter(key, name, page, overrides);
  }

  return new GenericTempMailAdapter(key || 'generic', name, page);
}
