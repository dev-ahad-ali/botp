import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Input } from '../components/ui';
import { api } from '../lib/ipc';

export default function ServiceTab() {
  const [service, setService] = useState('Service');
  const [url, setUrl] = useState('');
  const [message, setMessage] = useState('');
  const barRef = useRef<HTMLDivElement>(null);
  const top = () => Math.round(barRef.current?.getBoundingClientRect().bottom ?? 190);

  useEffect(() => {
    let alive = true;
    const offUrl = api.serviceSite.onUrl((next) => { if (alive) setUrl(next); });

    const boot = async () => {
      const info = await api.serviceSite.resolve();
      if (!alive) return;
      setService(info.service);
      setUrl(info.url);
      await api.serviceSite.attach(info.url, top());
    };
    void boot().catch((e) => { if (alive) setMessage(String(e)); });

    const onResize = () => void api.serviceSite.setTop(top());
    window.addEventListener('resize', onResize);
    return () => {
      alive = false;
      offUrl();
      window.removeEventListener('resize', onResize);
      void api.serviceSite.detach();
    };
  }, []);

  const go = (next = url) => {
    if (!next.trim()) return;
    void api.serviceSite.navigate(next).then(() => setUrl(next)).catch((e) => setMessage(String(e)));
  };

  return (
    <div className="h-[calc(100%-1.5rem)]">
      <div ref={barRef} className="shrink-0 space-y-2 border-b border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold">Service</h1>
          <Badge>{service}</Badge>
          <span className="ml-auto text-xs text-muted-foreground">{message}</span>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void api.serviceSite.back()}>←</Button>
          <Button variant="outline" onClick={() => void api.serviceSite.forward()}>→</Button>
          <Button variant="outline" onClick={() => void api.serviceSite.reload()}>Reload</Button>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && go()}
            placeholder="https://"
          />
          <Button onClick={() => go()}>Go</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          The selected service ({service}) is embedded here. Account creation automation will be added later.
        </p>
      </div>
    </div>
  );
}
