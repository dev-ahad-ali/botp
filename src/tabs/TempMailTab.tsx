import { useEffect, useState } from 'react';
import { Badge, Button, Card } from '../components/ui';
import { api, type TempMailEvent, type TempMailMessage } from '../lib/ipc';

type Props = { onOpenSite?: () => void };

export default function TempMailTab({ onOpenSite }: Props) {
  const [service, setService] = useState('Temp mail');
  const [address, setAddress] = useState('');
  const [messages, setMessages] = useState<TempMailMessage[]>([]);
  const [selected, setSelected] = useState<TempMailMessage | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const off = api.tempMail.onEvent((e: TempMailEvent) => {
      if (e.type === 'temp:open') setService(e.service);
      if (e.type === 'temp:address') setAddress(e.address);
      if (e.type === 'temp:code') setCode(e.code);
    });

    const boot = async () => {
      const [cfg, providers] = await Promise.all([api.config.get(), api.providers.list()]);
      const sites = providers.filter((p) => p.url);
      const chosen = sites.find((p) => String(p.id) === cfg.selected_tempmail_id) ?? sites[0];
      const result = await api.tempSite.open(chosen?.id);
      setService(result.service);
      setAddress(result.address);
      setMessages(await api.tempSite.messages());
    };
    void boot().catch((e) => setMessage(String(e)));

    return off;
  }, []);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); } catch (e) { setMessage(String(e)); } finally { setBusy(false); }
  };

  const refresh = async () => {
    const next = await api.tempSite.messages();
    setMessages(next);
    setAddress(await api.tempSite.address().catch(() => address));
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Temp Mail</h1>
        <Badge>{service}</Badge>
        {code && <Badge tone="green">code: {code}</Badge>}
        <span className="ml-auto text-xs text-muted-foreground">{message}</span>
        <Button variant="outline" onClick={onOpenSite}>Open site tab</Button>
      </div>

      <Card title="Current address">
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded bg-background px-2 py-1 font-mono text-xs text-primary">{address || '—'}</code>
          <Button disabled={busy} onClick={() => void run(async () => setMessage(`Copied: ${await api.tempSite.copy()}`))}>Copy email</Button>
          <Button variant="outline" disabled={busy} onClick={() => void run(async () => setAddress(await api.tempSite.regenerate()))}>New email</Button>
          <Button variant="outline" disabled={busy} onClick={() => void run(refresh)}>Refresh inbox</Button>
          <Button variant="outline" disabled={busy} onClick={() => void run(async () => {
            const found = await api.tempSite.waitForCode(180_000);
            setCode(found.code);
            await refresh();
          })}>Wait for code</Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          The site itself is embedded in the <strong>Temp Mail Site</strong> tab; this tab is the inbox control panel.
        </p>
      </Card>

      <Card title="Inbox">
        {messages.length === 0 && <p className="text-xs text-muted-foreground">No messages found yet.</p>}
        <div className="space-y-2">
          {messages.map((m, i) => (
            <button
              key={`${m.preview}-${i}`}
              className="block w-full rounded-md border border-border bg-background px-3 py-2 text-left text-xs hover:bg-accent"
              onClick={() => void run(async () => {
                const opened = await api.tempSite.openMessage(i);
                setSelected(opened);
                if (opened.code) setCode(opened.code);
              })}
            >
              <span className="font-medium">{m.subject || m.preview.slice(0, 60)}</span>
              <span className="mt-1 block truncate text-muted-foreground">{m.preview}</span>
            </button>
          ))}
        </div>
        {selected && (
          <pre className="mt-3 max-h-64 overflow-auto rounded-md border border-border bg-background p-3 text-xs text-foreground">
            {selected.body || selected.preview}
          </pre>
        )}
      </Card>
    </div>
  );
}
