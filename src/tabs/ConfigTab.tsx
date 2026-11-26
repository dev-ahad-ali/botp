import { useEffect, useState } from 'react';
import { Button, Card, Field, Input, Select } from '../components/ui';
import { api, type Provider, type Range, type Service } from '../lib/ipc';

type Props = { onOpenSite?: () => void };

export default function ConfigTab({ onOpenSite }: Props) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [providers, setProviders] = useState<Provider[]>([]);
  const [ranges, setRanges] = useState<Range[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [newProviderUrl, setNewProviderUrl] = useState('');
  const [newRange, setNewRange] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    const [config, p, r, s] = await Promise.all([
      api.config.get(), api.providers.list(), api.ranges.list(), api.services.list(),
    ]);
    setDraft(config);
    setProviders(p.filter((x) => x.url));
    setRanges(r.filter((x) => x.enabled));
    setServices(s);
  };

  useEffect(() => { void load().catch((e) => setMessage(String(e))); }, []);

  const set = (key: string, value: string) => setDraft((d) => ({ ...d, [key]: value }));

  const save = async () => {
    try {
      await Promise.all(Object.entries(draft).map(([key, value]) => api.config.set(key, value)));
      setMessage('Settings saved');
    } catch (e) { setMessage(String(e)); }
  };

  const addProvider = async () => {
    if (!newProviderUrl.trim()) return;
    try {
      await api.providers.add({ url: newProviderUrl.trim() });
      setNewProviderUrl('');
      await load();
    } catch (e) { setMessage(String(e)); }
  };

  const openSelectedProvider = async () => {
    const id = Number(draft.selected_tempmail_id || providers[0]?.id || 0);
    if (!id) { setMessage('No temp-mail websites configured'); return; }
    try {
      await api.config.set('selected_tempmail_id', String(id));
      await api.providers.setEnabled(id, true);
      set('selected_tempmail_id', String(id));
      setMessage('Opening temp-mail site inside the app');
      await load();
      onOpenSite?.();
    } catch (e) { setMessage(String(e)); }
  };

  const addRange = async () => {
    if (!newRange.trim()) return;
    await api.ranges.add({ display: newRange.trim().toUpperCase() });
    setNewRange('');
    await load();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Configuration</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{message}</span>
          <Button onClick={() => void save()}>Save settings</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Target service">
          <Field label="Service">
            <Select
              value={draft.selected_service ?? 'twilio'}
              onChange={(e) => set('selected_service', e.target.value)}
              options={services.map((s) => ({ value: s.key, label: s.name }))}
            />
          </Field>
        </Card>

        <Card title="Temp mail website">
          <Field label="Selected site">
            <Select
              value={draft.selected_tempmail_id ?? ''}
              onChange={(e) => set('selected_tempmail_id', e.target.value)}
              options={[
                { value: '', label: 'First configured site' },
                ...providers.map((p) => ({ value: String(p.id), label: `${p.name} — ${p.url}` })),
              ]}
            />
          </Field>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => void openSelectedProvider()}>Open site</Button>
            <Button variant="outline" onClick={() => void api.tempSite.open()
              .then((r) => setMessage(`Loaded ${r.service}: ${r.address}`))
              .catch((e) => setMessage(String(e)))}>
              Load selected site
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Every configured URL appears in the dropdown. <strong>Open site</strong> saves the choice and switches to the embedded tab.
          </p>
          <div className="mt-3 flex gap-2">
            <Input
              value={newProviderUrl}
              onChange={(e) => setNewProviderUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void addProvider()}
              placeholder="https://temp-mail.org/en/"
            />
            <Button variant="outline" onClick={() => void addProvider()}>Add site</Button>
          </div>
        </Card>

        <Card title="Number API">
          <Field label="URL">
            <Input value={draft.number_api_url ?? ''} onChange={(e) => set('number_api_url', e.target.value)} />
          </Field>
          <Field label="Auth header (required, e.g. mauthapi=&quot;token&quot;)">
            <Input
              value={draft.number_api_header ?? ''}
              onChange={(e) => set('number_api_header', e.target.value)}
              placeholder='mauthapi="your-token"'
            />
            <p className="mt-1 text-xs text-muted-foreground">The getnum API rejects requests without this header. Click Save settings after changing it.</p>
          </Field>
        </Card>

        <Card title="Range">
          <Field label="Selected range">
            <Select
              value={draft.selected_range_id ?? ''}
              onChange={(e) => set('selected_range_id', e.target.value)}
              options={[{ value: '', label: 'Rotate all' }, ...ranges.map((r) => ({ value: String(r.id), label: r.display }))]}
            />
          </Field>
          <div className="mt-3 flex gap-2">
            <Input value={newRange} onChange={(e) => setNewRange(e.target.value)} placeholder="99277XXX" />
            <Button variant="outline" onClick={() => void addRange()}>Add</Button>
          </div>
        </Card>

        <Card title="Smoke tests" className="md:col-span-2">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => void api.tempSite.open()
              .then((r) => setMessage(`Loaded ${r.service}: ${r.address}`))
              .catch((e) => setMessage(String(e)))}>
              Load selected site
            </Button>
            <Button variant="outline" onClick={() => void api.smoke.number({
              url: draft.number_api_url,
              header: draft.number_api_header,
              rangeId: draft.selected_range_id,
            }).then((r) => setMessage(`Number: ${r.phone} (${r.range})`)).catch((e) => setMessage(String(e)))}>
              Test getnum
            </Button>
            <span className="text-xs text-muted-foreground">Test getnum uses the values currently in the form — no need to save first.</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
