import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Keep the prototype seed list in one place: the implementation spec.
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

  // Old decorative domains are kept but disabled: automation now uses real sites.
  await prisma.tempMailProvider.updateMany({ where: { url: '' }, data: { enabled: false } });

  const services = [
    { name: 'Temp Mail', domain: 'temp-mail.org', url: 'https://temp-mail.org/en/', adapterKey: 'tempmail-org' },
    { name: 'Temp Mail IO', domain: 'temp-mail.io', url: 'https://temp-mail.io/en/', adapterKey: 'generic' },
    { name: '1SecMail', domain: '1secmail.com', url: 'https://www.1secmail.com/', adapterKey: 'generic' },
  ];
  await Promise.all(services.map((data, i) => prisma.tempMailProvider.upsert({
    where: { domain: data.domain },
    create: { ...data, enabled: i === 0, isBuiltin: true, sortOrder: i },
    update: { ...data, enabled: i === 0, sortOrder: i },
  })));

  const ranges = seedArray('RANGE_SEED');
  await Promise.all(ranges.map((display, i) => {
    const data = { display, prefix: display.replace(/X+$/, ''), sortOrder: i };
    return prisma.range.upsert({ where: { display }, create: data, update: data });
  }));

  console.log(`Seeded ${services.length} mail sites and ${ranges.length} ranges`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
