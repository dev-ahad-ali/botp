import { prisma } from './db';

const stripX = (display: string) => display.replace(/X+$/, '');

export const listProviders = () =>
  prisma.tempMailProvider.findMany({ orderBy: [{ enabled: 'desc' }, { sortOrder: 'asc' }] });

export const addProvider = (p: { name: string; domain?: string }) =>
  prisma.tempMailProvider.create({
    data: { name: p.name, domain: p.domain || `${p.name}.local`, isBuiltin: false },
  });

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
