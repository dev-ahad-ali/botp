import { useState } from 'react';
import { Tabs } from './components/ui';
import AutomationTab from './tabs/AutomationTab';
import ConfigTab from './tabs/ConfigTab';
import FreeBrowserTab from './tabs/FreeBrowserTab';
import TempMailTab from './tabs/TempMailTab';

const tabs = [
  { id: 'config', label: 'Configuration' },
  { id: 'automation', label: 'Automation' },
  { id: 'tempmail', label: 'Temp Mail' },
  { id: 'browser', label: 'Free Browser' },
];

export default function App() {
  const [tab, setTab] = useState('config');
  return (
    <div className="flex h-full flex-col">
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <main className="min-h-0 flex-1 overflow-auto p-6">
        {tab === 'config' && <ConfigTab />}
        {tab === 'automation' && <AutomationTab />}
        {tab === 'tempmail' && <TempMailTab />}
        {tab === 'browser' && <FreeBrowserTab />}
      </main>
    </div>
  );
}
