import { useEffect, useState } from 'react';
import { Badge, Button, Card } from '../components/ui';
import { api, type TempMailEvent, type TempMailMessage } from '../lib/ipc';

export default function TempMailTab() {
  const [service, setService] = useState('Temp mail');
  const [url, setUrl] = useState('');
  const [address, setAddress] = useState('');
  const [messages, setMessages] = useState<TempMailMessage[]>([]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const off = api.tempMail.onEvent((e: TempMailEvent) => {
      if (e.type === 'temp:open') { setService(e.service); setUrl(e.url); }
      if (e.type === 'temp:address') setAddress(e.address);
      if (e.type === 'temp:code') setCode(e.code);
    });

    const boot = async () => {
      const [cfg, providers] = await Promise.all([api.config.get(), api.providers.list()]);
      const selected = providers.find((p) => String(p.id) === cfg.selected_tempmail_id && p.url);
      const result = await api.tempMail.open(selected?.id);
      setService(result.service);
      setUrl(result.url);
      setAddress(result.address);
      const inbox = await api.tempMail.refresh();
      setMessages(inbox.messages);
    };
    void boot().catch((e) => setMessage(String(e)));

    return () => { off(); void api.tempMail.close(); };
  }, []);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); } catch (e) { setMessage(String(e)); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Temp Mail</h1>
        <Badge>{service}</Badge>
        <span className="text-xs text-slate-500">{url}</span>
        <span className="ml-auto text-xs text-slate-400">{message}</span>
      </div>

      <Card title="Current address">
        <div className="flex flex-wrap items-center gap-3">
          <code className="rounded bg-slate-950 px-3 py-2 text-sm text-emerald-300">{address || '—'}</code>
          <Button disabled={busy} onClick={() => void run(async () => setMessage(`Copied: ${await api.tempMail.copy()}`))}>Copy email</Button>
          <Button variant="outline" disabled={busy} onClick={() => void run(async () => setAddress(await api.tempMail.regenerate()))}>New email</Button>
          <Button variant="outline" disabled={busy} onClick={() => void run(async () => {
            const inbox = await api.tempMail.refresh();
            setAddress(inbox.address);
            setMessages(inbox.messages);
          })}>Refresh inbox</Button>
          <Button variant="outline" disabled={busy} onClick={() => void run(async () => {
            const found = await api.tempMail.waitForCode(180_000);
            setCode(found.code);
          })}>Wait for code</Button>
        </div>
        <p className="mt-3 text-xs text-slate-500">The real site is open in a separate Playwright Chromium window. Selectors can be tuned in the temp-mail adapter.</p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
        <Card title="Inbox">
          <div className="space-y-2">
            {messages.length === 0 && <p className="text-sm text-slate-500">No messages yet.</p>}
            {messages.map((m, i) => (
              <div key={i} className="rounded-md border border-slate-800 p-3">
                <p className="text-sm font-medium">{m.subject}</p>
                <p className="mt-1 text-xs text-slate-400">{m.preview}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Verification code">
          <p className="font-mono text-2xl text-emerald-300">{code || '—'}</p>
        </Card>
      </div>
    </div>
  );
}
