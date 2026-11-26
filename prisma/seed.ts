import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Keep the prototype seed lists in one place: the implementation spec.
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

  const domains = seedArray('TEMP_MAIL_SITE_SEED');
  const sites = domains.map((domain, i) => ({
    name: domain,
    domain,
    url: `https://${domain}/`,
    adapterKey: 'generic',
    enabled: i === 0,
    isBuiltin: true,
    sortOrder: i,
  }));

  // Replace only seeded built-ins; user-added sites are left untouched.
  await prisma.tempMailProvider.deleteMany({
    where: { isBuiltin: true, domain: { notIn: domains } },
  });
  await prisma.tempMailProvider.updateMany({ where: { url: '' }, data: { enabled: false } });

  await Promise.all(sites.map((data) => prisma.tempMailProvider.upsert({
    where: { domain: data.domain },
    create: data,
    update: data,
  })));

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

  console.log(`Seeded ${sites.length} mail sites and ${ranges.length} ranges`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
