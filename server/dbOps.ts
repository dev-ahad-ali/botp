import { prisma } from './db';

const stripX = (display: string) => display.replace(/X+$/, '');

export const listProviders = () =>
  prisma.tempMailProvider.findMany({ orderBy: [{ enabled: 'desc' }, { sortOrder: 'asc' }] });

export const getProvider = (id: number) => prisma.tempMailProvider.findUnique({ where: { id } });

const domainFromUrl = (url?: string) => {
  try { return new URL(url ?? '').hostname.replace(/^www\./, ''); } catch { return ''; }
};

export const addProvider = (p: { url: string; name?: string; domain?: string; adapterKey?: string }) => {
  const domain = p.domain || domainFromUrl(p.url);
  if (!domain) throw new Error('Enter a valid temp-mail URL');
  return prisma.tempMailProvider.create({
    data: {
      name: p.name || domain.split('.')[0],
      domain,
      url: p.url,
      adapterKey: p.adapterKey ?? 'generic',
      isBuiltin: false,
    },
  });
};

export const setProviderEnabled = (id: number, enabled: boolean) =>
  prisma.tempMailProvider.update({ where: { id }, data: { enabled } });

export const listRanges = () =>
  prisma.range.findMany({ orderBy: [{ enabled: 'desc' }, { sortOrder: 'asc' }] });

export const addRange = (r: { display: string }) =>
  prisma.range.create({ data: { display: r.display, prefix: stripX(r.display) } });

export const setRangeEnabled = (id: number, enabled: boolean) =>
  prisma.range.update({ where: { id }, data: { enabled } });

export const listServices = () => prisma.service.findMany({ where: { enabled: true }, orderBy: { id: 'asc' } });

export const listRuns = (limit = 20) =>
  prisma.run.findMany({
    take: limit,
    orderBy: { id: 'desc' },
    include: { logs: { orderBy: { id: 'asc' }, take: 5 } },
  });
