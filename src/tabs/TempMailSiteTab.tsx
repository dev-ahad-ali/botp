import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Field, Input, Select } from '../components/ui';
import { api, type Provider } from '../lib/ipc';
import { useAppStore } from '../store/appStore';

export default function TempMailSiteTab({ active }: { active: boolean }) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [message, setMessage] = useState('');
  const homeRef = useRef('');
  const url = useAppStore((s) => s.tempUrl);
  const email = useAppStore((s) => s.email);
  const code = useAppStore((s) => s.code);
  const setUrl = useAppStore((s) => s.setTempUrl);
  const setEmail = useAppStore((s) => s.setEmail);
  const setCode = useAppStore((s) => s.setCode);
  const barRef = useRef<HTMLDivElement>(null);
  const top = () => Math.round(barRef.current?.getBoundingClientRect().bottom || 190);

  useEffect(() => {
    let alive = true;
    const offUrl = api.tempSite.onUrl((next) => { if (alive) setUrl(next); });
    const offEvent = api.tempMail.onEvent((e) => {
      if (!alive) return;
      if (e.type === 'temp:address') setEmail(e.address);
      if (e.type === 'temp:code') setCode(e.code);
    });

    void Promise.all([api.config.get(), api.providers.list()]).then(([cfg, list]) => {
      const sites = list.filter((p) => p.url);
      if (alive) setProviders(sites);
      const chosen = sites.find((p) => String(p.id) === cfg.selected_tempmail_id) ?? sites.find((p) => p.enabled) ?? sites[0];
      if (!chosen || !alive) return;
      homeRef.current = chosen.url;
      if (!useAppStore.getState().tempUrl) setUrl(chosen.url);
    }).catch((e) => { if (alive) setMessage(String(e)); });

    const onResize = () => {
      if (useAppStore.getState().tab === 'tempsite') void api.tempSite.setTop(top());
    };
    window.addEventListener('resize', onResize);
    return () => {
      alive = false;
      offUrl();
      offEvent();
      window.removeEventListener('resize', onResize);
      void api.tempSite.detach();
    };
  }, [setCode, setEmail, setUrl]);

  useEffect(() => {
    if (active) {
      const next = useAppStore.getState().tempUrl || homeRef.current;
      if (next) void api.tempSite.attach(next, top()).catch(() => undefined);
    } else {
      void api.tempSite.detach();
    }
  }, [active]);

  const openProvider = async (id: number) => {
    const provider = providers.find((p) => p.id === id);
    if (!provider) return;
    try {
      await api.config.set('selected_tempmail_id', String(id));
      await api.providers.setEnabled(id, true);
      homeRef.current = provider.url;
      await api.tempSite.attach(provider.url, top());
      setUrl(provider.url);
      setEmail(await api.tempSite.address().catch(() => ''));
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
          <Input value={url} readOnly placeholder="https://temp-mail.org/en/" />
          <Button variant="outline" onClick={() => void api.tempSite.reload()}>Reload inbox</Button>
        </div>
        <p className="text-xs text-muted-foreground">Navigation is limited to the configured inbox and verification messages opened by the automation.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Extracted email">
            <Input value={email} readOnly placeholder="—" />
          </Field>
          <Field label="Extracted code">
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Waiting for verification mail" />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => void api.tempSite.copy().then(setEmail).catch((e) => setMessage(String(e)))}>Copy email</Button>
          <Button variant="outline" onClick={() => void api.tempSite.regenerate().then(setEmail).catch((e) => setMessage(String(e)))}>New email</Button>
          <Button variant="outline" onClick={() => void api.tempSite.delete().then(setEmail).catch((e) => setMessage(String(e)))}>Delete address</Button>
        </div>
      </div>
    </div>
  );
}
