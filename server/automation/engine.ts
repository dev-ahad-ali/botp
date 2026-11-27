import { prisma } from '../db';
import { getConfig } from '../config';
import { getProvider } from '../dbOps';
import { randomPassword, randomFirstName, randomLastName } from '../generators';
import { getNumber } from '../numbers/client';
import * as tempMail from '../tempMail/session';
import * as serviceView from '../../electron/serviceView';
import { SERVICES } from './registry';
import type { AutomationEvent, ServiceView } from './types';

let running = false;
let shouldStop = false;
let stopSignal = makeStopSignal();

function makeStopSignal() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

/** Sleep that is interrupted immediately by Stop. */
function wait(ms: number) {
  if (shouldStop) return Promise.resolve();
  return Promise.race([new Promise<void>((resolve) => setTimeout(resolve, ms)), stopSignal.promise]);
}

/** Rejects as soon as Stop is pressed, so a slow API call cannot swallow the stop request. */
function stoppable<T>(work: Promise<T>): Promise<T> {
  const stopped = stopSignal.promise.then(() => { throw new Error('Stopped'); });
  void stopped.catch(() => undefined);
  return Promise.race([work, stopped]);
}

export async function startAutomation(onEvent: (e: AutomationEvent) => void) {
  if (running) return;
  running = true;
  shouldStop = false;
  stopSignal = makeStopSignal();
  tempMail.resetStop();

  const emit = (e: AutomationEvent) => onEvent(e);
  emit({ type: 'status', running: true });
  emit({ type: 'stage', stage: 'signup' });

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
    if (shouldStop) throw new Error('Stopped');

    serviceView.rememberStartUrl(service.startUrl);
    const view: ServiceView = {
      goto: async (url) => { await serviceView.openSite(url); },
      evaluate: <T>(fn: string, arg?: unknown) => serviceView.evaluate<T>(fn, arg),
      url: () => serviceView.getUrl(),
    };

    // Start clean: reload the service form and throw away the address left over from the previous run.
    await stoppable(serviceView.reset());
    if (shouldStop) throw new Error('Stopped');
    const opened = await stoppable(tempMail.openTempMail(provider));
    emit({ type: 'temp:open', service: provider.name, url: provider.url });
    let address = await stoppable(tempMail.freshAddress(opened.address));
    emit({ type: 'temp:address', address });
    emit({ type: 'focus', tab: 'tempsite' });
    if (shouldStop) throw new Error('Stopped');

    let attempt = 0;
    while (!shouldStop) {
      const range = rotation[attempt++ % rotation.length];
      if (attempt > 1) {
        emit({ type: 'focus', tab: 'tempsite' });
        address = await stoppable(tempMail.freshAddress(address));
        emit({ type: 'temp:address', address });
        if (shouldStop) break;
      }

      emit({ type: 'focus', tab: 'service' });
      emit({ type: 'stage', stage: 'signup' });
      const run = await prisma.run.create({
        data: { serviceKey: service.key, rangeId: range.id, providerId: provider.id, status: 'running' },
      });

      const log = async (message: string, data?: unknown) => {
        await prisma.runLog.create({
          data: { runId: run.id, level: 'info', message, data: data === undefined ? null : JSON.stringify(data) },
        });
        emit({ type: 'log', runId: run.id, message, data });
      };

      emit({ type: 'run:start', runId: run.id, range: range.display, pkg: provider.adapterKey });
      await log(`temp-mail site: ${provider.name} (${address})`);

      try {
        const number = await stoppable(getNumber({ url: cfg.number_api_url, headerRaw: cfg.number_api_header, rid: range.prefix }));
        if (shouldStop) throw new Error('Stopped');
        await log(`phone fetched: ${number.phone}`, { country: number.country, countryCode: number.countryCode, dialCode: number.dialCode });
        emit({ type: 'run:info', runId: run.id, phone: number.phone, email: address, range: range.display });

        await service.run({
          view,
          email: address,
          password: randomPassword(16),
          firstName: randomFirstName(),
          lastName: randomLastName(),
          number,
          rangeDisplay: range.display,
          getCode: async () => {
            emit({ type: 'stage', stage: 'email-code' });
            emit({ type: 'focus', tab: 'tempsite' });
            const found = await tempMail.waitForTwilioCode(180_000);
            if (shouldStop) throw new Error('Stopped');
            emit({ type: 'temp:code', code: found.code });
            await log(`verification code: ${found.code}`);
            emit({ type: 'focus', tab: 'service' });
            return found.code;
          },
          log,
          stop: () => shouldStop,
        });

        if (shouldStop) throw new Error('Stopped');
        await prisma.run.update({ where: { id: run.id }, data: { status: 'success', endedAt: new Date() } });
        emit({ type: 'run:done', runId: run.id, status: 'success' });
        emit({ type: 'stage', stage: 'done' });
        if (!shouldStop) {
          await stoppable(serviceView.reset());
          await wait(1500);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const status = shouldStop ? 'stopped' : 'failed';
        await prisma.run.update({
          where: { id: run.id },
          data: { status, endedAt: new Date(), error: message },
        });
        emit({ type: 'run:done', runId: run.id, status, error: message });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emit({ type: 'log', runId: 0, message: `automation error: ${message}` });
  } finally {
    await serviceView.reset().catch(() => undefined);
    tempMail.closeAll();
    running = false;
    emit({ type: 'stage', stage: 'idle' });
    emit({ type: 'status', running: false });
  }
}

export function stopAutomation() {
  if (!running) return;
  shouldStop = true;
  stopSignal.resolve();
  tempMail.stopWaits();
}
