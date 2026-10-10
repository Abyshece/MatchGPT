import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { BrandMark } from '../constants';

// ============================================================================
// DeleteAccountPage: /delete-account on the website
//
// Google Play asks apps with accounts for a web page where people can have
// their account deleted without the app. Anyone can here: a one-time code by
// email proves the account is theirs (it works for accounts made with email,
// Google or Apple, Apple's hidden addresses too), then the account is deleted
// exactly as Settings → Delete account does in the apps (delete-account).
// The sign-in lives only in this page: nothing is kept in the browser.
// The email needs the code ({{ .Token }}) in Supabase's "Magic Link" template.
// ============================================================================

type Step = 'email' | 'code' | 'confirm' | 'done';

const CODE = /^\d{6,10}$/;

const DeleteAccountPage: React.FC = () => {
  // A client of its own, without saving the session anywhere
  const client = useMemo(() => createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }), []);
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appStoreRenews, setAppStoreRenews] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = 'Delete your Shaadi24 account';
    const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    document.documentElement.classList.toggle('dark', dark);
  }, []);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);
  useEffect(() => { if (step === 'code') codeInput.current?.focus(); }, [step]);

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const address = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(address)) {
      setError('Please enter the email address of your account.');
      return;
    }
    setError(null);
    setBusy(true);
    const { error: sendError } = await client.auth.signInWithOtp({ email: address, options: { shouldCreateUser: false } });
    setBusy(false);
    // An address without an account gets the same answer, so this page
    // can't be used to find out who has one
    if (sendError && sendError.status === 429) {
      setError('Too many codes asked for. Please wait a few minutes and try again.');
      return;
    }
    if (sendError && sendError.status !== 400 && sendError.status !== 422) {
      setError('The code couldn\'t be sent. Please try again in a moment.');
      return;
    }
    setEmail(address);
    setCode('');
    setCooldown(60);
    setStep('code');
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!CODE.test(code)) {
      setError('Please enter the code from the email.');
      return;
    }
    setError(null);
    setBusy(true);
    const { data, error: verifyError } = await client.auth.verifyOtp({ email, token: code, type: 'email' });
    setBusy(false);
    if (verifyError || !data.session) {
      setError('That code isn\'t right or has expired. Check the email, or send a new code.');
      return;
    }
    setStep('confirm');
  };

  const remove = async () => {
    if (typed !== 'Delete') return;
    setError(null);
    setBusy(true);
    const { data, error: fnError } = await client.functions.invoke('delete-account', {
      body: { confirmation: 'Delete', reason: 'Deleted on the website' },
    });
    setBusy(false);
    if (fnError || !data?.success) {
      let message = data?.error as string | undefined;
      if (!message && fnError && 'context' in fnError) {
        message = await (fnError as { context: Response }).context.json().then((b) => b?.error, () => undefined);
      }
      setError(message || 'Your account couldn\'t be deleted. Please try again, or write to hello@shaadi24.in.');
      return;
    }
    setAppStoreRenews(!!data.details?.app_store_renews);
    await client.auth.signOut({ scope: 'local' }).catch(() => {});
    setStep('done');
  };

  const input = 'w-full border border-gray-300 dark:border-zinc-700 rounded-md p-3 text-sm bg-white dark:bg-zinc-900 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white';
  const primary = 'w-full h-11 rounded-md text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div className="min-h-screen bg-white dark:bg-[#191919] text-gray-900 dark:text-gray-100 font-sans">
      <main className="max-w-xl mx-auto px-5 py-10 sm:py-16">
        <a href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
          <BrandMark className="w-5 h-5" /> Shaadi24
        </a>
        <h1 className="mt-6 text-3xl font-bold tracking-tight">Delete your Shaadi24 account</h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
          You can delete your account in the Shaadi24 app (Settings → Delete Account), or here, without the app.
        </p>

        <section className="mt-6 rounded-lg border border-gray-200 dark:border-zinc-800 p-4 text-sm leading-relaxed text-gray-600 dark:text-gray-300 space-y-2">
          <p><strong className="text-gray-900 dark:text-white">What's deleted:</strong> your account and profile, photos, likes, matches,
            messages, searches, verification requests, the phones and browsers that get your notifications, and your
            Sign in with Apple link to Shaadi24. People you matched with lose your conversations. This can't be undone.</p>
          <p><strong className="text-gray-900 dark:text-white">What's kept:</strong> only what Indian law requires, kept apart and
            used only to answer lawful requests: a record of the account (name, email, date of birth, gender, city, when
            it was made and deleted, and the internet addresses used) for one year, records of payments for up to 8
            years, and the consents given for up to 3 years. Everything else is deleted at once, and from our backups
            within 30 days. <a className="underline" href="/privacy">Privacy Policy</a>, section 6.</p>
          <p><strong className="text-gray-900 dark:text-white">Shaadi24+:</strong> a Google Play subscription stops renewing. An App
            Store subscription only you can cancel: on your iPhone,
            Settings → your name → Subscriptions, or <a className="underline" href="https://apps.apple.com/account/subscriptions" target="_blank" rel="noreferrer">apps.apple.com/account/subscriptions</a>.</p>
        </section>

        <section className="mt-8">
          {error && (
            <div role="alert" className="mb-4 px-3 py-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {step === 'email' && (
            <form onSubmit={sendCode} className="space-y-3" data-testid="delete-step-email">
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Your account's email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={input} autoComplete="email" required />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                We'll email you a code to show the account is yours. If you signed in with Apple and hid your email, use
                the address Apple made for Shaadi24 (on your iPhone: Settings → your name → Sign in with Apple → Shaadi24).
              </p>
              <button type="submit" disabled={busy} className={`${primary} bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-gray-200`}>
                {busy ? 'Sending…' : 'Email me a code'}
              </button>
            </form>
          )}

          {step === 'code' && (
            <form onSubmit={verify} className="space-y-3" data-testid="delete-step-code">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                If Shaadi24 has an account for <strong className="text-gray-900 dark:text-white">{email}</strong>, we've emailed it a code.
              </p>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Code</label>
              <input
                ref={codeInput} type="text" inputMode="numeric" autoComplete="one-time-code" value={code} placeholder="123456"
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
                className={`${input} text-center text-2xl font-mono tracking-[0.4em]`}
              />
              <button type="submit" disabled={busy || code.length < 6} className={`${primary} bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-gray-200`}>
                {busy ? 'Checking…' : 'Continue'}
              </button>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                The email has a link instead of a code? Open it: it signs you in on this website's home page, where you
                can delete the account.
              </p>
              <div className="flex justify-between text-xs">
                <button type="button" onClick={() => { setError(null); setStep('email'); }} className="text-gray-500 hover:text-gray-900 dark:hover:text-white">Use another email</button>
                {cooldown > 0
                  ? <span className="text-gray-500 dark:text-gray-400">Send again in {cooldown}s</span>
                  : <button type="button" onClick={() => sendCode()} className="font-medium text-blue-600 dark:text-blue-400">Send a new code</button>}
              </div>
            </form>
          )}

          {step === 'confirm' && (
            <div className="space-y-4" data-testid="delete-step-confirm">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Signed in as <strong className="text-gray-900 dark:text-white">{email}</strong>.
              </p>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Type "Delete" to confirm</label>
              <input type="text" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Delete" className={input} />
              <button
                onClick={remove} disabled={typed !== 'Delete' || busy}
                className={`${primary} bg-red-600 text-white hover:bg-red-700`}
              >
                {busy ? 'Deleting…' : 'Delete my account permanently'}
              </button>
            </div>
          )}

          {step === 'done' && (
            <div className="space-y-3" data-testid="delete-step-done">
              <p className="text-lg font-semibold">Your account has been deleted.</p>
              <p className="text-sm text-gray-600 dark:text-gray-300">Thank you for trying Shaadi24. You can uninstall the app.</p>
              {appStoreRenews && (
                <p className="text-sm rounded-md border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/20 p-3 text-amber-900 dark:text-amber-100">
                  Your App Store subscription is still on. Cancel it on your iPhone (Settings → your name → Subscriptions)
                  so the App Store stops charging you.
                </p>
              )}
            </div>
          )}
        </section>

        <p className="mt-10 text-xs text-gray-500 dark:text-gray-400">
          Questions, or no access to your email any more? Write to{' '}
          <a className="underline" href="mailto:hello@shaadi24.in">hello@shaadi24.in</a>.
        </p>
      </main>
    </div>
  );
};

export default DeleteAccountPage;
