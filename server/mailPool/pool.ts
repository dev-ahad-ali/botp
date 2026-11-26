import { MailBucketPackage } from './mailbucket';
import { TempMailSdkPackage } from './tempmailsdk';
import type { MailPackage } from './types';

const PACKAGES: MailPackage[] = [
  new MailBucketPackage('mail.tm'),
  new MailBucketPackage('mail.gw'),
  new TempMailSdkPackage(),
];

const health: Record<string, { fails: number; cooldownUntil: number; active: number }> = {};
for (const p of PACKAGES) health[p.key] = { fails: 0, cooldownUntil: 0, active: 0 };

export const listPackages = () => PACKAGES.map((p) => p.key);

export function pickPackage(): MailPackage {
  const now = Date.now();
  const eligible = PACKAGES.filter((p) => health[p.key].cooldownUntil < now && health[p.key].active < 3);
  const chosen = eligible.length ? eligible[Math.floor(Math.random() * eligible.length)] : PACKAGES[0];
  health[chosen.key].active++;
  return chosen;
}

export function reportPackageResult(key: string, ok: boolean) {
  const h = health[key];
  if (!h) return;
  h.active = Math.max(h.active - 1, 0);
  if (ok) h.fails = 0;
  else {
    h.fails++;
    h.cooldownUntil = Date.now() + h.fails * 120_000;
  }
}

export async function smokeTestInbox() {
  const pkg = pickPackage();
  try {
    const inbox = await pkg.createInbox();
    return { pkg: pkg.key, address: inbox.address };
  } finally {
    reportPackageResult(pkg.key, true);
  }
}
