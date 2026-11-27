import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Input } from '../components/ui';
import { api } from '../lib/ipc';
import { useAppStore } from '../store/appStore';

export default function ServiceTab({ active }: { active: boolean }) {
  const [message, setMessage] = useState('');
  const service = useAppStore((s) => s.service);
  const url = useAppStore((s) => s.serviceUrl);
  const stage = useAppStore((s) => s.stage);
  const setService = useAppStore((s) => s.setService);
  const setUrl = useAppStore((s) => s.setServiceUrl);
  const barRef = useRef<HTMLDivElement>(null);
  const top = () => Math.round(barRef.current?.getBoundingClientRect().bottom || 190);

  useEffect(() => {
    let alive = true;
    const offUrl = api.serviceSite.onUrl((next) => { if (alive) setUrl(next); });
    void api.serviceSite.resolve().then((info) => {
      if (!alive) return;
      setService(info.service);
      setUrl(info.url || useAppStore.getState().serviceUrl);
    }).catch((e) => { if (alive) setMessage(String(e)); });

    const onResize = () => {
      if (useAppStore.getState().tab === 'service') void api.serviceSite.setTop(top());
    };
    window.addEventListener('resize', onResize);
    return () => {
      alive = false;
      offUrl();
      window.removeEventListener('resize', onResize);
      void api.serviceSite.detach();
    };
  }, [setService, setUrl]);

  useEffect(() => {
    if (active) {
      void api.serviceSite.attach(useAppStore.getState().serviceUrl, top()).catch(() => undefined);
    } else {
      void api.serviceSite.detach();
    }
  }, [active]);

  return (
    <div className="h-[calc(100%-1.5rem)]">
      <div ref={barRef} className="shrink-0 space-y-2 border-b border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold">Service</h1>
          <Badge>{service}</Badge>
          {stage !== 'idle' && <Badge tone="amber">{stage}</Badge>}
          <span className="ml-auto text-xs text-muted-foreground">{message}</span>
        </div>
        <div className="flex gap-2">
          <Input value={url} readOnly placeholder="https://www.twilio.com/try-twilio" />
          <Button variant="outline" onClick={() => void api.serviceSite.reload()}>Reload</Button>
          <Button variant="outline" onClick={() => void api.serviceSite.reset().catch((e) => setMessage(String(e)))}>Reset to signup</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          The page stays mounted between tabs. After each phone submission the engine returns here and waits for the stage-1 form before starting again.
        </p>
      </div>
    </div>
  );
}
