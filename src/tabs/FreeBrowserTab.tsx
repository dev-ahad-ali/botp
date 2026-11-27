import { useEffect, useRef, useState } from 'react';
import { Button, Input } from '../components/ui';
import { api } from '../lib/ipc';
import { useAppStore } from '../store/appStore';

export default function FreeBrowserTab({ active }: { active: boolean }) {
  const [url, setUrl] = useState('https://www.google.com');
  const urlRef = useRef(url);
  const barRef = useRef<HTMLDivElement>(null);
  urlRef.current = url;
  const top = () => Math.round(barRef.current?.getBoundingClientRect().bottom || 190);

  useEffect(() => {
    const off = api.freeBrowser.onUrl(setUrl);
    const onResize = () => {
      if (useAppStore.getState().tab === 'browser') void api.freeBrowser.setTop(top());
    };
    window.addEventListener('resize', onResize);
    return () => {
      off();
      window.removeEventListener('resize', onResize);
      void api.freeBrowser.detach();
    };
  }, []);

  useEffect(() => {
    if (active) void api.freeBrowser.attach(urlRef.current, top()).catch(() => undefined);
    else void api.freeBrowser.detach();
  }, [active]);

  const go = () => void api.freeBrowser.navigate(url);

  return (
    <div className="h-[calc(100%-1.5rem)]">
      <div ref={barRef} className="flex h-[120px] shrink-0 flex-col justify-center gap-2 border-b border-border">
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void api.freeBrowser.back()}>←</Button>
          <Button variant="outline" onClick={() => void api.freeBrowser.forward()}>→</Button>
          <Button variant="outline" onClick={() => void api.freeBrowser.reload()}>Reload</Button>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} placeholder="https://" />
          <Button onClick={() => go()}>Go</Button>
        </div>
        <p className="text-xs text-muted-foreground">The page stays loaded when you switch tabs.</p>
      </div>
    </div>
  );
}
