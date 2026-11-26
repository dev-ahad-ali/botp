import { useState } from 'react';
import { Tabs } from './components/ui';
import AutomationTab from './tabs/AutomationTab';
import ConfigTab from './tabs/ConfigTab';
import FreeBrowserTab from './tabs/FreeBrowserTab';
import TempMailSiteTab from './tabs/TempMailSiteTab';
import TempMailTab from './tabs/TempMailTab';

const tabs = [
  { id: 'config', label: 'Configuration' },
  { id: 'automation', label: 'Automation' },
  { id: 'tempmail', label: 'Temp Mail' },
  { id: 'tempsite', label: 'Temp Mail Site' },
  { id: 'browser', label: 'Free Browser' },
];

export default function App() {
  const [tab, setTab] = useState('config');
  const openSite = () => setTab('tempsite');

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <main className="min-h-0 flex-1 overflow-auto p-6">
        {tab === 'config' && <ConfigTab onOpenSite={openSite} />}
        {tab === 'automation' && <AutomationTab />}
        {tab === 'tempmail' && <TempMailTab onOpenSite={openSite} />}
        {tab === 'tempsite' && <TempMailSiteTab />}
        {tab === 'browser' && <FreeBrowserTab />}
      </main>
    </div>
  );
}
