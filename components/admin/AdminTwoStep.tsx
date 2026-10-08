import React, { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../lib/useToast';
import {
  removeTwoStep, startTwoStep, twoStepState, verifyTwoStep, type Enrolment, type TwoStepState,
} from '../../lib/adminTeam';
import { Spinner } from './BlogAiDialogs';

// ============================================================================
// Two-step sign-in for admins (lib/adminTeam.ts): set it up with an
// authenticator app (scan the QR code, or type the key in, or on a phone
// open the app straight from the link), and enter its 6-digit code. The gate
// stands in front of the admin panel when two-step sign-in is required and
// this session hasn't used it yet; the card (Overview, Team) shows an admin
// their own and lets them set it up or turn it off.
// ============================================================================

const CodeInput: React.FC<{ onSubmit: (code: string) => void; busy: boolean; label: string }> = ({ onSubmit, busy, label }) => {
  const [code, setCode] = useState('');
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (code.replace(/\D/g, '').length === 6) onSubmit(code); }} className="flex gap-2">
      <label htmlFor="two-step-code" className="sr-only">{label}</label>
      <input id="two-step-code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} autoFocus
        onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))} placeholder="123 456"
        className="w-36 rounded-md border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-lg tracking-widest tabular-nums text-center outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-zinc-600" />
      <button type="submit" disabled={busy || code.replace(/\D/g, '').length !== 6}
        className="h-11 px-4 rounded-md bg-gray-900 text-white dark:bg-white dark:text-gray-900 text-sm font-semibold disabled:opacity-40">
        {busy ? <Spinner /> : 'Confirm'}
      </button>
    </form>
  );
};

/** Setting up an authenticator: the QR code, the key, then the first code */
export const TwoStepSetup: React.FC<{ onDone: () => void; onCancel?: () => void }> = ({ onDone, onCancel }) => {
  const { showToast } = useToast();
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void startTwoStep().then(({ enrolment, error }) => { if (live) { setEnrolment(enrolment); setError(error); } });
    return () => { live = false; };
  }, []);

  const verify = async (code: string) => {
    if (!enrolment) return;
    setBusy(true);
    const { error } = await verifyTwoStep(enrolment.factorId, code);
    setBusy(false);
    if (error) { showToast(error, 'error'); return; }
    showToast('Two-step sign-in is on', 'success');
    onDone();
  };

  if (error) return <p role="alert" className="text-sm text-red-600 dark:text-red-400" data-testid="two-step-error">{error}</p>;
  if (!enrolment) return <div className="h-48 rounded-lg bg-gray-50 dark:bg-zinc-800 animate-pulse" />;
  return (
    <div className="space-y-4" data-testid="two-step-setup">
      <ol className="list-decimal pl-5 space-y-1 text-sm text-gray-700 dark:text-zinc-300">
        <li>Install an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…).</li>
        <li>Scan this code with it, or on this phone <a href={enrolment.uri} className="underline">open it in the app</a>.</li>
        <li>Type the 6-digit code it shows.</li>
      </ol>
      <div className="flex flex-wrap items-start gap-4">
        <img src={enrolment.qr} alt="QR code to scan with your authenticator app" className="w-40 h-40 rounded-md bg-white p-2 border border-gray-200" />
        <div className="min-w-0 space-y-3">
          <div>
            <p className="text-xs text-gray-500 dark:text-zinc-400">Or type this key in the app:</p>
            <code className="block mt-1 text-sm break-all select-all text-gray-900 dark:text-white" data-testid="two-step-secret">{enrolment.secret}</code>
          </div>
          <CodeInput onSubmit={verify} busy={busy} label="The 6-digit code from the app" />
          {onCancel && <button type="button" onClick={onCancel} className="text-xs text-gray-500 dark:text-zinc-400 underline">Not now</button>}
        </div>
      </div>
    </div>
  );
};

/** In front of the admin panel, when two-step sign-in is required and this session hasn't used it */
export const TwoStepGate: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const { showToast } = useToast();
  const [state, setState] = useState<TwoStepState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void twoStepState().then(setState); }, []);

  const verify = async (code: string) => {
    if (!state?.factorId) return;
    setBusy(true);
    const { error } = await verifyTwoStep(state.factorId, code);
    setBusy(false);
    if (error) showToast(error, 'error');
    else onDone();
  };

  return (
    <div className="h-full flex items-center justify-center p-6" data-testid="two-step-gate">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-zinc-800 p-6">
        <p className="text-2xl" aria-hidden="true">🔐</p>
        <h1 className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">Two-step sign-in</h1>
        {!state ? <div className="mt-4 h-24 rounded-lg bg-gray-50 dark:bg-zinc-800 animate-pulse" /> : state.factorId ? (
          <>
            <p className="mt-1 mb-4 text-sm text-gray-600 dark:text-zinc-300">Enter the 6-digit code from your authenticator app to open the admin panel.</p>
            <CodeInput onSubmit={verify} busy={busy} label="The 6-digit code from your authenticator app" />
            <p className="mt-4 text-xs text-gray-500 dark:text-zinc-400">Lost your phone? An owner can reset your two-step sign-in in Admin → Team.</p>
          </>
        ) : (
          <>
            <p className="mt-1 mb-4 text-sm text-gray-600 dark:text-zinc-300">Shaadi24 asks every admin to sign in with a code from an authenticator app too. Set it up once:</p>
            <TwoStepSetup onDone={onDone} />
          </>
        )}
      </div>
    </div>
  );
};

/** The signed-in admin's own two-step sign-in: on (and turn off), or set it up */
export const TwoStepCard: React.FC<{ required: boolean; onChanged?: () => void }> = ({ required, onChanged }) => {
  const { showToast } = useToast();
  const [state, setState] = useState<TwoStepState | null>(null);
  const [setting, setSetting] = useState(false);
  const load = useCallback(() => { void twoStepState().then(setState); }, []);
  useEffect(load, [load]);

  const turnOff = async () => {
    if (!state?.factorId || !window.confirm('Turn off two-step sign-in for your account?')) return;
    const { error } = await removeTwoStep(state.factorId);
    if (error) showToast(error, 'error');
    else { showToast('Two-step sign-in is off', 'success'); load(); onChanged?.(); }
  };

  if (!state) return null;
  return (
    <section className="rounded-lg border border-gray-200 dark:border-zinc-800 p-4" data-testid="two-step-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Your two-step sign-in</h2>
          <p className="text-xs text-gray-500 dark:text-zinc-400">
            {state.factorId ? 'On: you sign in with a code from your authenticator app too.' : 'Off. A code from an authenticator app keeps the admin panel safe even if your password leaks.'}
          </p>
        </div>
        {state.factorId ? (
          !required && <button type="button" onClick={turnOff} className="h-8 px-3 rounded-md border border-gray-200 dark:border-zinc-700 text-xs font-medium">Turn off</button>
        ) : (
          !setting && <button type="button" onClick={() => setSetting(true)} className="h-8 px-3 rounded-md bg-gray-900 text-white dark:bg-white dark:text-gray-900 text-xs font-semibold">Set up</button>
        )}
      </div>
      {setting && (
        <div className="mt-4">
          <TwoStepSetup onDone={() => { setSetting(false); load(); onChanged?.(); }} onCancel={() => setSetting(false)} />
        </div>
      )}
    </section>
  );
};
