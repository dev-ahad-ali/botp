import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Keep the prototype range list in one place: the implementation spec.
const spec = readFileSync(path.resolve('setps.md'), 'utf8');
const seedArray = (name: string) => {
  const block = spec.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`))?.[1];
  if (!block) throw new Error(`Missing ${name} in setps.md`);
  return [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
};

async function main() {
  const settings = [
    { key: 'number_api_url', value: 'https://api.2oo9.cloud/MXS47FLFX0U/tness/@public/api/getnum' },
    { key: 'number_api_header', value: '' },
    { key: 'selected_range_id', value: '' },
    { key: 'selected_tempmail_id', value: '' },
    { key: 'selected_service', value: 'twilio' },
  ];
  await Promise.all(settings.map((data) => prisma.setting.upsert({ where: { key: data.key }, create: data, update: data })));

  await prisma.service.upsert({
    where: { key: 'twilio' },
    create: { key: 'twilio', name: 'Twilio', enabled: true },
    update: { name: 'Twilio', enabled: true },
  });

  const site = {
    name: 'Temp Mail',
    domain: 'temp-mail.org',
    url: 'https://temp-mail.org/en/',
    adapterKey: 'generic',
    enabled: true,
    isBuiltin: true,
    sortOrder: 0,
  };

  // Keep only the single built-in temp-mail site; user-added rows are untouched.
  await prisma.tempMailProvider.deleteMany({
    where: { isBuiltin: true, domain: { not: site.domain } },
  });
  await prisma.tempMailProvider.updateMany({ where: { url: '' }, data: { enabled: false } });
  await prisma.tempMailProvider.upsert({
    where: { domain: site.domain },
    create: site,
    update: site,
  });

  // A previously selected built-in may have been removed above.
  const selected = await prisma.setting.findUnique({ where: { key: 'selected_tempmail_id' } });
  if (selected?.value) {
    const exists = await prisma.tempMailProvider.findUnique({ where: { id: Number(selected.value) } });
    if (!exists) {
      await prisma.setting.update({ where: { key: 'selected_tempmail_id' }, data: { value: '' } });
    }
  }

  const ranges = seedArray('RANGE_SEED');
  await Promise.all(ranges.map((display, i) => {
    const data = { display, prefix: display.replace(/X+$/, ''), sortOrder: i };
    return prisma.range.upsert({ where: { display }, create: data, update: data });
  }));

  console.log(`Seeded 1 mail site and ${ranges.length} ranges`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
