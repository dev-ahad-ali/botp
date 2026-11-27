import { useEffect } from 'react';
import { Badge, Button, Tabs } from './components/ui';
import { api, type AutomationEvent } from './lib/ipc';
import { useAppStore } from './store/appStore';
import AutomationTab from './tabs/AutomationTab';
import ConfigTab from './tabs/ConfigTab';
import FreeBrowserTab from './tabs/FreeBrowserTab';
import ServiceTab from './tabs/ServiceTab';
import TempMailSiteTab from './tabs/TempMailSiteTab';

const tabs = [
  { id: 'config', label: 'Configuration' },
  { id: 'automation', label: 'Automation' },
  { id: 'service', label: 'Service' },
  { id: 'tempsite', label: 'Temp Mail Site' },
  { id: 'browser', label: 'Free Browser' },
];

export default function App() {
  const tab = useAppStore((s) => s.tab);
  const setTab = useAppStore((s) => s.setTab);
  const running = useAppStore((s) => s.running);
  const stage = useAppStore((s) => s.stage);

  useEffect(() => api.automation.onEvent((e: AutomationEvent) => {
    const s = useAppStore.getState();
    if (e.type === 'status') {
      s.setRunning(e.running);
      if (e.running) s.resetFlow();
      else { s.resetFlow(); s.setStage('idle'); }
    }
    if (e.type === 'stage') s.setStage(e.stage);
    if (e.type === 'focus') s.setTab(e.tab);
    if (e.type === 'temp:address') s.setEmail(e.address);
    if (e.type === 'temp:code') s.setCode(e.code);
    if (e.type === 'run:info') {
      if (e.phone) s.setPhone(e.phone);
      if (e.email) s.setEmail(e.email);
    }
  }), []);

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
        <h1 className="mr-2 text-sm font-semibold">OTP Automation</h1>
        <Button className="px-3 py-1 text-xs" onClick={() => void api.automation.start()} disabled={running}>Start</Button>
        <Button className="px-3 py-1 text-xs" variant="destructive" onClick={() => void api.automation.stop()} disabled={!running}>Stop</Button>
        <Badge tone={running ? 'green' : 'slate'}>{running ? 'running' : 'idle'}</Badge>
        {stage !== 'idle' && <Badge tone="amber">{stage}</Badge>}
      </header>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <main className="min-h-0 flex-1 overflow-auto p-6">
        {tab === 'config' && <ConfigTab onOpenSite={() => setTab('tempsite')} />}
        {tab === 'automation' && <AutomationTab />}
        {tab === 'service' && <ServiceTab />}
        {tab === 'tempsite' && <TempMailSiteTab />}
        {tab === 'browser' && <FreeBrowserTab />}
      </main>
    </div>
  );
}
