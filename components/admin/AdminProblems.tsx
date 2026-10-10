import React, { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../lib/useToast';
import {
  answerProblem, fetchMinAppBuild, fetchProblems, setMinAppBuild, type ProblemRow,
} from '../../lib/adminService';
import { appBuild } from '../../lib/appUpdate';

// ============================================================================
// AdminProblems (Admin → Errors, above the errors): problems members reported
// in Settings → Report a problem, with what they were using; an answer goes
// to them (a message that opens My requests). And the oldest app that still
// works: raising it makes older apps ask to be updated (only the owner can).
// ============================================================================

const PLATFORM: Record<string, string> = { web: 'Website', android: 'Android', ios: 'iPhone' };

const ProblemCard: React.FC<{ p: ProblemRow; onDone: () => void }> = ({ p, onDone }) => {
  const { showToast } = useToast();
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async (withAnswer: boolean) => {
    setBusy(true);
    const { error } = await answerProblem(p.id, withAnswer ? answer : '');
    setBusy(false);
    if (error) {
      showToast(`Couldn't save: ${error}`, 'error');
      return;
    }
    showToast(withAnswer ? 'Answer sent. They get a message.' : 'Closed.', 'success');
    onDone();
  };

  return (
    <li className="rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4" data-testid="admin-problem">
      <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap break-words">{p.details}</p>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
        <span>{p.name ?? 'A member'}</span>
        <span>{PLATFORM[p.platform ?? ''] ?? p.platform ?? '?'}{p.app_version ? ` ${p.app_version}` : ''}</span>
        {p.screen && <span>on {p.screen}</span>}
        {p.device && <span className="break-all">{p.device}</span>}
        <span>{new Date(p.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
      </div>
      {p.status === 'open' ? (
        <div className="mt-3">
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Your answer (they read it in My requests)"
            aria-label="Answer"
            data-testid="admin-problem-answer"
            className="w-full rounded-lg border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 p-2 text-sm text-gray-900 dark:text-white"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => send(true)}
              disabled={busy || !answer.trim()}
              data-testid="admin-problem-send"
              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-40"
            >
              Send answer
            </button>
            <button
              onClick={() => send(false)}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-zinc-600 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-700 disabled:opacity-40"
            >
              Close without answering
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">
          {p.status === 'answered' ? <>Answered: {p.answer}</> : 'Closed'}
        </p>
      )}
    </li>
  );
};

const MinAppBuild: React.FC = () => {
  const { showToast } = useToast();
  const [current, setCurrent] = useState<number | null>(null);
  const [value, setValue] = useState('');
  useEffect(() => { void fetchMinAppBuild().then((b) => { setCurrent(b); setValue(String(b)); }); }, []);

  const save = async () => {
    const build = Number(value);
    const { error } = await setMinAppBuild(build);
    if (error) {
      showToast(error, 'error');
      return;
    }
    setCurrent(build);
    showToast(build ? `Apps older than build ${build} now ask to be updated.` : 'Every version works again.', 'success');
  };

  return (
    <div className="rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 mb-6" data-testid="admin-min-build">
      <h3 className="text-sm font-bold text-gray-900 dark:text-white">Oldest app that still works</h3>
      <p className="mt-1 text-xs text-gray-600 dark:text-gray-300 max-w-2xl">
        If a release is broken, raise this to the build number of the fixed one: older apps then ask to be updated.
        The build is major × 10000 + minor × 100 + patch (version 1.2.3 is 10203); this website is build {appBuild()}.
        0 lets every version work. Only the owner can change it.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Oldest build that works"
          className="w-32 rounded-lg border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-2 py-1.5 text-sm text-gray-900 dark:text-white"
        />
        <button
          onClick={save}
          disabled={current === null || String(current) === value || !/^\d+$/.test(value)}
          className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-zinc-600 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-700 disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </div>
  );
};

const AdminProblems: React.FC = () => {
  const { showToast } = useToast();
  const [problems, setProblems] = useState<ProblemRow[]>([]);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    const { problems: rows, error } = await fetchProblems(!showAll);
    if (error) showToast(`Couldn't load the problems: ${error}`, 'error');
    setProblems(rows);
  }, [showAll, showToast]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="mb-8" data-testid="admin-problems">
      <MinAppBuild />
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white">
          Problems members reported{problems.length && !showAll ? ` (${problems.length})` : ''}
        </h3>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Show answered ones
        </label>
      </div>
      {problems.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">None waiting.</p>
      ) : (
        <ul className="space-y-2">
          {problems.map((p) => <ProblemCard key={p.id} p={p} onDone={load} />)}
        </ul>
      )}
    </div>
  );
};

export default AdminProblems;
