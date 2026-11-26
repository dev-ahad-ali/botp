import { useState } from 'react';
import { Tabs } from './components/ui';

const tabs = [
  { id: 'config', label: 'Configuration' },
  { id: 'automation', label: 'Automation' },
  { id: 'browser', label: 'Free Browser' },
];

export default function App() {
  const [tab, setTab] = useState('config');
  return (
    <div className="flex h-full flex-col">
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <main className="flex-1 overflow-auto p-6">
        <p className="text-sm text-slate-400">{tab} tab</p>
      </main>
    </div>
  );
}
