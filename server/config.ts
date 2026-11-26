import { prisma } from './db';

export async function getConfig() {
  const rows = await prisma.setting.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, string>;
}

export async function setConfig(key: string, value: string) {
  return prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}
