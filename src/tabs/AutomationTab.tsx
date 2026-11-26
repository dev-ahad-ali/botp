import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card } from '../components/ui';
import { api, type AutomationEvent, type RunRow } from '../lib/ipc';

type Current = { range?: string; pkg?: string; phone?: string; email?: string };

export default function AutomationTab() {
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [current, setCurrent] = useState<Current | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [tempMail, setTempMail] = useState('Package pool (automatic)');

  const refreshRuns = useCallback(() => {
    void api.runs.list(20).then(setRuns).catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshRuns();
    void Promise.all([api.config.get(), api.providers.list()]).then(([cfg, providers]) => {
      const found = providers.find((p) => String(p.id) === cfg.selected_tempmail_id);
      setTempMail(found?.name ?? 'Package pool (automatic)');
    }).catch(() => undefined);

    const off = api.automation.onEvent((e: AutomationEvent) => {
      if (e.type === 'status') setRunning(e.running);
      if (e.type === 'log') setLogs((l) => [...l.slice(-199), e.message]);
      if (e.type === 'run:start') {
        setCurrent({ range: e.range, pkg: e.pkg });
        setAttempt((n) => n + 1);
      }
      if (e.type === 'run:info') {
        setCurrent((c) => ({ ...c, phone: e.phone ?? c?.phone, email: e.email ?? c?.email, range: e.range ?? c?.range }));
      }
      if (e.type === 'run:done') {
        setCurrent(null);
        refreshRuns();
      }
    });
    return off;
  }, [refreshRuns]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void api.automation.start()} disabled={running}>Start</Button>
        <Button variant="destructive" onClick={() => void api.automation.stop()} disabled={!running}>Stop</Button>
        <Badge tone={running ? 'green' : 'slate'}>{running ? 'running' : 'idle'}</Badge>
        <span className="text-sm text-slate-400">Attempt: {attempt}</span>
        <span className="ml-auto text-sm text-slate-400">Running with: {tempMail}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card title="Current run">
          <dl className="space-y-2 text-sm">
            <div><dt className="text-slate-500">Range</dt><dd>{current?.range ?? '—'}</dd></div>
            <div><dt className="text-slate-500">Package</dt><dd>{current?.pkg ?? '—'}</dd></div>
            <div><dt className="text-slate-500">Phone</dt><dd>{current?.phone ?? '—'}</dd></div>
            <div><dt className="text-slate-500">Email</dt><dd className="break-all">{current?.email ?? '—'}</dd></div>
          </dl>
        </Card>

        <Card title="Live log" className="min-h-80">
          <div className="h-80 overflow-auto rounded-md bg-slate-950 p-3 font-mono text-xs leading-6 text-slate-300">
            {logs.length === 0 ? <p className="text-slate-600">No events yet.</p> : logs.map((line, i) => <div key={i}>{line}</div>)}
          </div>
        </Card>
      </div>

      <Card title="Recent runs">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr><th className="py-2">#</th><th>Range</th><th>Service</th><th>Status</th><th>Started</th><th>Last log</th></tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-t border-slate-800">
                <td className="py-2">{r.id}</td>
                <td>{r.rangeId ?? '—'}</td>
                <td>{r.serviceKey}</td>
                <td>{r.status}</td>
                <td>{new Date(r.startedAt).toLocaleString()}</td>
                <td className="text-slate-400">{r.logs.at(-1)?.message ?? r.error ?? '—'}</td>
              </tr>
            ))}
            {runs.length === 0 && <tr><td colSpan={6} className="py-3 text-slate-500">No runs yet.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
