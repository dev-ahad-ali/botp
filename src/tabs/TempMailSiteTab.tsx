import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Input, Select } from '../components/ui';
import { api, type Provider } from '../lib/ipc';

export default function TempMailSiteTab() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [url, setUrl] = useState('');
  const [address, setAddress] = useState('');
  const [message, setMessage] = useState('');
  const barRef = useRef<HTMLDivElement>(null);
  const top = () => Math.round(barRef.current?.getBoundingClientRect().bottom ?? 190);

  useEffect(() => {
    let alive = true;
    const offUrl = api.tempSite.onUrl((next) => { if (alive) setUrl(next); });

    const boot = async () => {
      const [cfg, list] = await Promise.all([api.config.get(), api.providers.list()]);
      const sites = list.filter((p) => p.url);
      if (alive) setProviders(sites);
      const chosen = sites.find((p) => String(p.id) === cfg.selected_tempmail_id) ?? sites.find((p) => p.enabled) ?? sites[0];
      if (!chosen) throw new Error('No temp-mail websites configured');
      if (!alive) return;
      await api.tempSite.attach(chosen.url, top());
      if (!alive) return;
      setUrl(chosen.url);
      const current = await api.tempSite.address().catch(() => '');
      if (alive) setAddress(current);
    };
    void boot().catch((e) => { if (alive) setMessage(String(e)); });

    const onResize = () => void api.tempSite.setTop(top());
    window.addEventListener('resize', onResize);
    return () => {
      alive = false;
      offUrl();
      window.removeEventListener('resize', onResize);
      void api.tempSite.detach();
    };
  }, []);

  const go = (next = url) => {
    if (!next.trim()) return;
    void api.tempSite.navigate(next).then(() => setUrl(next)).catch((e) => setMessage(String(e)));
  };

  const openProvider = async (id: number) => {
    const provider = providers.find((p) => p.id === id);
    if (!provider) return;
    try {
      await api.config.set('selected_tempmail_id', String(id));
      await api.providers.setEnabled(id, true);
      await api.tempSite.attach(provider.url, top());
      setUrl(provider.url);
      setAddress(await api.tempSite.address().catch(() => ''));
    } catch (e) { setMessage(String(e)); }
  };

  const selectedId = providers.find((p) => p.url === url)?.id;

  return (
    <div className="h-[calc(100%-1.5rem)]">
      <div ref={barRef} className="shrink-0 space-y-2 border-b border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold">Temp Mail Site</h1>
          <Badge>Embedded</Badge>
          <Select
            className="max-w-md"
            value={selectedId ? String(selectedId) : ''}
            onChange={(e) => void openProvider(Number(e.target.value))}
            options={providers.map((p) => ({ value: String(p.id), label: `${p.name} — ${p.url}` }))}
          />
          <span className="ml-auto text-xs text-muted-foreground">{message}</span>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void api.tempSite.back()}>←</Button>
          <Button variant="outline" onClick={() => void api.tempSite.forward()}>→</Button>
          <Button variant="outline" onClick={() => void api.tempSite.reload()}>Reload</Button>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && go()}
            placeholder="https://"
          />
          <Button onClick={() => go()}>Go</Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded bg-background px-2 py-1 font-mono text-xs text-primary">{address || '—'}</code>
          <Button variant="outline" onClick={() => void api.tempSite.copy().then(setAddress).catch((e) => setMessage(String(e)))}>Copy email</Button>
          <Button variant="outline" onClick={() => void api.tempSite.regenerate().then(setAddress).catch((e) => setMessage(String(e)))}>New email</Button>
        </div>
      </div>
    </div>
  );
}
