type GetNumberArgs = { url: string; headerRaw?: string; rid: string };

export type NumberInfo = {
  phone: string;
  national: string;
  full: string;
  country: string;
  countryCode: string;
  dialCode: string;
  raw: unknown;
};

/** Accepts: `mauthapi="token"`, `mauthapi=token`, `mauthapi: token`, or a bare token. */
function parseHeader(raw?: string): [string, string] | null {
  const value = raw?.trim();
  if (!value) return null;

  const named = value.match(/^([A-Za-z0-9_-]+)\s*(?:=|:)\s*"?([^"\n]+?)"?\s*$/);
  if (named) return [named[1], named[2].trim()];

  return ['mauthapi', value.replace(/^"|"$/g, '')];
}

async function errorMessage(res: Response) {
  const text = await res.text().catch(() => '');
  try {
    const json = JSON.parse(text) as { message?: string; meta?: { status?: string } };
    return json.message ?? json.meta?.status ?? text;
  } catch {
    return text;
  }
}

const pick = (obj: Record<string, any> | null, keys: string[]): string => {
  for (const key of keys) {
    const value = obj?.[key];
    if (typeof value === 'string' || typeof value === 'number') {
      const text = String(value).trim();
      if (text) return text;
    }
  }
  return '';
};

function parseNumberInfo(data: unknown): NumberInfo {
  const root = (data ?? {}) as Record<string, any>;
  const payload = (root.data ?? root) as Record<string, any>;
  const nestedCountry = (payload.country ?? root.country ?? {}) as Record<string, any>;

  const full = pick(payload, ['full_number', 'fullNumber', 'phone', 'number']) || pick(root, ['full_number', 'fullNumber', 'phone', 'number']);
  const national = pick(payload, ['national_number', 'nationalNumber', 'no_plus_number', 'number', 'phone']) || pick(root, ['national_number', 'nationalNumber', 'no_plus_number']);
  const country = pick(payload, ['country_name', 'countryName', 'country']) || pick(nestedCountry, ['name', 'country_name', 'countryName']) || pick(root, ['country_name', 'countryName']);
  const countryCode = pick(payload, ['country_code', 'countryCode', 'iso', 'iso_code', 'alpha2', 'cc']) || pick(nestedCountry, ['code', 'country_code', 'iso', 'alpha2']) || pick(root, ['country_code', 'iso', 'iso_code']);
  const dialCode = pick(payload, ['dial_code', 'dialCode', 'calling_code', 'country_calling_code', 'prefix']) || pick(nestedCountry, ['dial_code', 'calling_code', 'code']) || pick(root, ['dial_code', 'calling_code']);

  const nationalNumber = national || full.replace(/^\+/, '').replace(/^00/, '');
  if (!nationalNumber) throw new Error(`getnum: unrecognized response ${JSON.stringify(data)}`);

  return {
    phone: full || nationalNumber,
    national: nationalNumber,
    full,
    country,
    countryCode,
    dialCode,
    raw: data,
  };
}

export async function getNumber({ url, headerRaw, rid }: GetNumberArgs): Promise<NumberInfo> {
  if (!url) throw new Error('Number API URL is not configured');

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const header = parseHeader(headerRaw);
  if (header) headers[header[0]] = header[1];

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ rid }),
  });

  if (!res.ok) {
    const detail = await errorMessage(res);
    throw new Error(`getnum HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
  }

  return parseNumberInfo(await res.json());
}
