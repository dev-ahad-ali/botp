import { chromium, type Browser } from 'playwright';
import { prisma } from '../db';
import { getConfig } from '../config';
import { randomPassword, randomFirstName, randomLastName } from '../generators';
import { pickPackage, reportPackageResult } from '../mailPool/pool';
import { getNumber } from '../numbers/client';
import { SERVICES } from './registry';
import type { AutomationEvent } from './types';

let running = false;
let shouldStop = false;
let browser: Browser | null = null;
let signalStop: () => void = () => undefined;

export async function startAutomation(onEvent: (e: AutomationEvent) => void) {
  if (running) return;
  running = true;
  shouldStop = false;

  const stopped = new Promise<null>((resolve) => { signalStop = () => resolve(null); });
  const emit = (e: AutomationEvent) => onEvent(e);
  emit({ type: 'status', running: true });

  try {
    const cfg = await getConfig();
    const service = SERVICES[cfg.selected_service || 'twilio'];
    if (!service) throw new Error(`Unknown service: ${cfg.selected_service || 'twilio'}`);

    const ranges = await prisma.range.findMany({ where: { enabled: true }, orderBy: { sortOrder: 'asc' } });
    if (!ranges.length) throw new Error('No ranges configured');

    const selectedId = cfg.selected_range_id ? Number(cfg.selected_range_id) : null;
    const selected = ranges.filter((r) => r.id === selectedId);
    const rotation = selected.length ? selected : ranges;

    const providerId = cfg.selected_tempmail_id ? Number(cfg.selected_tempmail_id) : null;
    browser = await chromium.launch({ headless: false });

    let attempt = 0;
    while (!shouldStop) {
      const range = rotation[attempt++ % rotation.length];
      const run = await prisma.run.create({
        data: { serviceKey: service.key, rangeId: range.id, providerId, status: 'running' },
      });

      const log = async (message: string, data?: unknown) => {
        await prisma.runLog.create({
          data: { runId: run.id, level: 'info', message, data: data === undefined ? null : JSON.stringify(data) },
        });
        emit({ type: 'log', runId: run.id, message, data });
      };

      const pkg = pickPackage();
      let inbox: { address: string; session: unknown } | null = null;
      let page: Awaited<ReturnType<Browser['newPage']>> | null = null;
      let reported = false;

      emit({ type: 'run:start', runId: run.id, range: range.display, pkg: pkg.key });

      try {
        const phone = await getNumber({ url: cfg.number_api_url, headerRaw: cfg.number_api_header, rid: range.prefix });
        await log(`phone fetched: ${phone}`);

        inbox = await pkg.createInbox();
        await log(`inbox created: ${inbox.address}`);
        emit({ type: 'run:info', runId: run.id, phone, email: inbox.address, range: range.display });

        page = await browser.newPage();
        await service.run({
          page,
          email: inbox.address,
          password: randomPassword(16),
          firstName: randomFirstName(),
          lastName: randomLastName(),
          phone,
          rangeDisplay: range.display,
          getOtp: async () => {
            const otp = await Promise.race([pkg.waitForOtp(inbox!.session, 180_000), stopped]);
            if (!otp) throw new Error(shouldStop ? 'Stopped' : 'OTP timeout');
            return otp;
          },
          log,
          stop: () => shouldStop,
        });

        await prisma.run.update({ where: { id: run.id }, data: { status: 'success', endedAt: new Date() } });
        reportPackageResult(pkg.key, true);
        reported = true;
        emit({ type: 'run:done', runId: run.id, status: 'success' });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const status = shouldStop ? 'stopped' : 'failed';
        await prisma.run.update({
          where: { id: run.id },
          data: { status, endedAt: new Date(), error: message },
        });
        reportPackageResult(pkg.key, !shouldStop);
        reported = true;
        emit({ type: 'run:done', runId: run.id, status, error: message });
      } finally {
        if (!reported) reportPackageResult(pkg.key, true);
        if (page) await page.close().catch(() => undefined);
        if (inbox) await pkg.dispose(inbox.session).catch(() => undefined);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emit({ type: 'log', runId: 0, message: `automation error: ${message}` });
  } finally {
    await browser?.close().catch(() => undefined);
    browser = null;
    running = false;
    emit({ type: 'status', running: false });
  }
}

export function stopAutomation() {
  if (!running) return;
  shouldStop = true;
  signalStop();
  void browser?.close().catch(() => undefined);
}
