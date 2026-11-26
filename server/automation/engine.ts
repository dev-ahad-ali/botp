import { prisma } from '../db';
import { getConfig } from '../config';
import { getProvider } from '../dbOps';
import { randomPassword, randomFirstName, randomLastName } from '../generators';
import { getNumber } from '../numbers/client';
import * as tempMail from '../tempMail/session';
import { SERVICES } from './registry';
import type { AutomationEvent } from './types';

let running = false;
let shouldStop = false;

export async function startAutomation(onEvent: (e: AutomationEvent) => void) {
  if (running) return;
  running = true;
  shouldStop = false;

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
    const byId = providerId ? await getProvider(providerId) : null;
    const provider = byId?.url
      ? byId
      : await prisma.tempMailProvider.findFirst({ where: { enabled: true, url: { not: '' } }, orderBy: { sortOrder: 'asc' } });
    if (!provider?.url) throw new Error('Select a temp-mail website in Configuration');

    const opened = await tempMail.openTempMail(provider);
    emit({ type: 'temp:open', service: provider.name, url: provider.url });
    emit({ type: 'temp:address', address: opened.address });

    let attempt = 0;
    let address = opened.address;
    while (!shouldStop) {
      const range = rotation[attempt++ % rotation.length];
      if (attempt > 1) {
        address = await tempMail.regenerate();
        emit({ type: 'temp:address', address });
      }

      const run = await prisma.run.create({
        data: { serviceKey: service.key, rangeId: range.id, providerId: provider.id, status: 'running' },
      });

      const log = async (message: string, data?: unknown) => {
        await prisma.runLog.create({
          data: { runId: run.id, level: 'info', message, data: data === undefined ? null : JSON.stringify(data) },
        });
        emit({ type: 'log', runId: run.id, message, data });
      };

      let page: Awaited<ReturnType<typeof tempMail.newAutomationPage>> | null = null;
      emit({ type: 'run:start', runId: run.id, range: range.display, pkg: provider.adapterKey });
      await log(`temp-mail site: ${provider.name} (${address})`);

      try {
        const phone = await getNumber({ url: cfg.number_api_url, headerRaw: cfg.number_api_header, rid: range.prefix });
        await log(`phone fetched: ${phone}`);
        emit({ type: 'run:info', runId: run.id, phone, email: address, range: range.display });

        page = await tempMail.newAutomationPage();
        await service.run({
          page,
          email: address,
          password: randomPassword(16),
          firstName: randomFirstName(),
          lastName: randomLastName(),
          phone,
          rangeDisplay: range.display,
          getOtp: async () => {
            const found = await tempMail.waitForCode(180_000);
            emit({ type: 'temp:code', code: found.code });
            await log(`verification code: ${found.code}`);
            return found.code;
          },
          log,
          stop: () => shouldStop,
        });

        await prisma.run.update({ where: { id: run.id }, data: { status: 'success', endedAt: new Date() } });
        emit({ type: 'run:done', runId: run.id, status: 'success' });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const status = shouldStop ? 'stopped' : 'failed';
        await prisma.run.update({
          where: { id: run.id },
          data: { status, endedAt: new Date(), error: message },
        });
        emit({ type: 'run:done', runId: run.id, status, error: message });
      } finally {
        if (page) await page.close().catch(() => undefined);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emit({ type: 'log', runId: 0, message: `automation error: ${message}` });
  } finally {
    await tempMail.closeAll();
    running = false;
    emit({ type: 'status', running: false });
  }
}

export function stopAutomation() {
  if (!running) return;
  shouldStop = true;
  tempMail.stopWaits();
  void tempMail.closeAll();
}
