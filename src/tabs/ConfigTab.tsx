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

  const useProvider = (id: number) => set('selected_tempmail_id', String(id));

  const openProvider = async (id: number) => {
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

        <Card title="Temp mail websites">
          <p className="mb-3 text-xs text-muted-foreground">
            All configured sites are listed with their full URL. Click <strong>Open</strong> to load the selected one inside the app.
          </p>
          <div className="max-h-56 space-y-2 overflow-auto pr-1">
            {providers.length === 0 && <p className="text-xs text-muted-foreground">No temp-mail websites configured.</p>}
            {providers.map((p) => {
              const selected = String(p.id) === draft.selected_tempmail_id;
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 ${selected ? 'border-primary bg-accent/30' : 'border-border'}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{p.name}</div>
                    <code className="block truncate text-xs text-muted-foreground">{p.url}</code>
                  </div>
                  <Button variant="outline" onClick={() => useProvider(p.id)}>Use</Button>
                  <Button onClick={() => void openProvider(p.id)}>Open</Button>
                </div>
              );
            })}
          </div>
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
