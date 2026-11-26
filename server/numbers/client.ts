type GetNumberArgs = { url: string; headerRaw: string; rid: string };

function parseHeader(raw: string): [string, string] {
  const m = raw.match(/^\s*([^=]+?)\s*=\s*"?(.*?)"?\s*$/);
  if (!m) throw new Error('Invalid header format (expected key="value")');
  return [m[1].trim(), m[2].trim()];
}

export async function getNumber({ url, headerRaw, rid }: GetNumberArgs): Promise<string> {
  if (!url) throw new Error('Number API URL is not configured');

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (headerRaw?.trim()) {
    const [name, value] = parseHeader(headerRaw);
    headers[name] = value;
  }

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ rid }) });
  if (!res.ok) throw new Error(`getnum HTTP ${res.status}`);

  const data: unknown = await res.json();
  const obj = data as Record<string, any>;
  const number =
    obj?.number ?? obj?.num ?? obj?.data?.number ?? obj?.phone ??
    (typeof data === 'string' ? data : null);
  if (!number) throw new Error(`getnum: unrecognized response ${JSON.stringify(data)}`);
  return String(number);
}
