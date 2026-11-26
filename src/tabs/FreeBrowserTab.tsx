import { useEffect, useRef, useState } from 'react';
import { Button, Input } from '../components/ui';
import { api } from '../lib/ipc';

export default function FreeBrowserTab() {
  const [url, setUrl] = useState('https://www.google.com');
  const urlRef = useRef(url);
  urlRef.current = url;

  useEffect(() => {
    void api.freeBrowser.attach(urlRef.current);
    const off = api.freeBrowser.onUrl(setUrl);
    return () => {
      off();
      void api.freeBrowser.detach();
    };
  }, []);

  const go = () => void api.freeBrowser.navigate(url);

  return (
    <div className="h-[calc(100%-1.5rem)]">
      <div className="flex h-[120px] shrink-0 flex-col justify-center gap-2 border-b border-slate-800">
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void api.freeBrowser.back()}>←</Button>
          <Button variant="outline" onClick={() => void api.freeBrowser.forward()}>→</Button>
          <Button variant="outline" onClick={() => void api.freeBrowser.reload()}>Reload</Button>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} placeholder="https://" />
          <Button onClick={go}>Go</Button>
        </div>
        <p className="text-xs text-slate-500">The page renders below this bar in a WebContentsView.</p>
      </div>
    </div>
  );
}
