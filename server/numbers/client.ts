type GetNumberArgs = { url: string; headerRaw?: string; rid: string };

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

function extractNumber(data: unknown): string | null {
  if (typeof data === 'string') return data;
  const root = data as Record<string, any> | null;
  const payload = (root?.data ?? root) as Record<string, any> | null;
  return (
    payload?.full_number ??
    payload?.no_plus_number ??
    payload?.national_number ??
    payload?.number ??
    payload?.num ??
    payload?.phone ??
    root?.number ??
    root?.num ??
    root?.phone ??
    null
  );
}

export async function getNumber({ url, headerRaw, rid }: GetNumberArgs): Promise<string> {
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

  const data: unknown = await res.json();
  const number = extractNumber(data);
  if (!number) throw new Error(`getnum: unrecognized response ${JSON.stringify(data)}`);
  return String(number);
}
