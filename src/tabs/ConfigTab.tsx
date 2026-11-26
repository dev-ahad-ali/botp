import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Field, Input, Select } from '../components/ui';
import { api, type Provider, type Range, type Service } from '../lib/ipc';

export default function ConfigTab() {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [providers, setProviders] = useState<Provider[]>([]);
  const [ranges, setRanges] = useState<Range[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [providerFilter, setProviderFilter] = useState('');
  const [newProvider, setNewProvider] = useState('');
  const [newProviderUrl, setNewProviderUrl] = useState('');
  const [newRange, setNewRange] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    const [config, p, r, s] = await Promise.all([
      api.config.get(), api.providers.list(), api.ranges.list(), api.services.list(),
    ]);
    setDraft(config);
    setProviders(p.filter((x) => x.enabled && x.url));
    setRanges(r.filter((x) => x.enabled));
    setServices(s);
  };

  useEffect(() => { void load().catch((e) => setMessage(String(e))); }, []);

  const visibleProviders = useMemo(() => {
    const q = providerFilter.toLowerCase();
    const found = providers.filter((p) =>
      p.name.toLowerCase().includes(q) || p.domain.toLowerCase().includes(q) || p.url.toLowerCase().includes(q));
    const selected = providers.find((p) => String(p.id) === draft.selected_tempmail_id);
    return selected && !found.some((p) => p.id === selected.id) ? [selected, ...found] : found;
  }, [providers, providerFilter, draft.selected_tempmail_id]);

  const set = (key: string, value: string) => setDraft((d) => ({ ...d, [key]: value }));

  const save = async () => {
    try {
      await Promise.all(Object.entries(draft).map(([key, value]) => api.config.set(key, value)));
      setMessage('Settings saved');
    } catch (e) { setMessage(String(e)); }
  };

  const addProvider = async () => {
    if (!newProvider.trim() || !newProviderUrl.trim()) return;
    await api.providers.add({
      name: newProvider.trim(),
      url: newProviderUrl.trim(),
      adapterKey: 'generic',
    });
    setNewProvider('');
    setNewProviderUrl('');
    await load();
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
          <span className="text-xs text-slate-400">{message}</span>
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
          <Field label="Search sites">
            <Input value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)} placeholder="temp-mail" />
          </Field>
          <Field label="Selected site">
            <Select
              value={draft.selected_tempmail_id ?? ''}
              onChange={(e) => set('selected_tempmail_id', e.target.value)}
              options={[{ value: '', label: 'First enabled site' }, ...visibleProviders.map((p) => ({ value: String(p.id), label: p.name }))]}
            />
          </Field>
          <div className="mt-3 space-y-2">
            <Input value={newProvider} onChange={(e) => setNewProvider(e.target.value)} placeholder="Site name" />
            <Input value={newProviderUrl} onChange={(e) => setNewProviderUrl(e.target.value)} placeholder="https://temp-mail.org/en/" />
            <Button variant="outline" onClick={() => void addProvider()}>Add site</Button>
          </div>
        </Card>

        <Card title="Number API">
          <Field label="URL">
            <Input value={draft.number_api_url ?? ''} onChange={(e) => set('number_api_url', e.target.value)} />
          </Field>
          <Field label="Auth header (optional, e.g. mauthapi=&quot;token&quot;)">
            <Input value={draft.number_api_header ?? ''} onChange={(e) => set('number_api_header', e.target.value)} />
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
            <Button variant="outline" onClick={() => void api.tempMail.open().then((r) => setMessage(`Opened ${r.service}: ${r.address}`)).catch((e) => setMessage(String(e)))}>
              Open temp mail
            </Button>
            <Button variant="outline" onClick={() => void api.smoke.number().then((r) => setMessage(`Number: ${r.phone} (${r.range})`)).catch((e) => setMessage(String(e)))}>
              Test getnum
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
