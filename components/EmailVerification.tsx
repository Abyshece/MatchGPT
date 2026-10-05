import React, { useState, useRef, useEffect } from 'react';
import { Button } from './NotionUI';
import { IconChevronLeft, IconCheck } from '../constants';
import { supabase } from '../lib/supabase';

interface EmailVerificationProps {
  email: string;
  onVerified: () => void;
  onBack: () => void;
}

const EmailVerification: React.FC<EmailVerificationProps> = ({ email, onVerified, onBack }) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // resend countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // auto-focus the code input
  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleVerify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    setInfo(null);

    if (code.length !== 6) {
      setError('Please enter the 6-digit code from your email.');
      return;
    }

    setIsVerifying(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'signup',
    });
    setIsVerifying(false);

    if (verifyError) {
      setError(verifyError.message);
      return;
    }

    // Success — Supabase has issued a session. AuthContext's onAuthStateChange
    // will pick it up. We tell the parent to advance.
    onVerified();
  };

  const handleResend = async () => {
    setError(null);
    setInfo(null);
    setResendCooldown(60);

    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email,
    });

    if (resendError) {
      setError(resendError.message);
      setResendCooldown(0);
      return;
    }

    setInfo(`A fresh code has been sent to ${email}.`);
  };

  const handleCodeChange = (val: string) => {
    // numbers only, max 6
    const cleaned = val.replace(/\D/g, '').slice(0, 6);
    setCode(cleaned);
  };

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#191919] animate-fade-in font-sans text-[#37352f] dark:text-[#d4d4d4]">
      <div className="flex-none flex items-center p-4 z-20">
        <button
          onClick={onBack}
          className="p-2 text-gray-400 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
          title="Back"
        >
          <IconChevronLeft />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center pt-8 pb-20 px-6">
        <div className="max-w-[420px] w-full">
          <div className="mb-10">
            <div className="text-5xl mb-6">📧</div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white tracking-tight mb-2">Check your inbox</h1>
            <p className="text-lg text-gray-500 dark:text-gray-400 leading-relaxed">
              We sent a 6-digit code to <span className="font-semibold text-gray-900 dark:text-white">{email}</span>.
            </p>
          </div>

          {error && (
            <div className="mb-4 px-3 py-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 text-xs font-medium text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
          {info && (
            <div className="mb-4 px-3 py-2 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 text-xs font-medium text-blue-700 dark:text-blue-300 flex items-center gap-2">
              <IconCheck /> {info}
            </div>
          )}

          <form onSubmit={handleVerify} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1 block">Verification code</label>
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                value={code}
                onChange={(e) => handleCodeChange(e.target.value)}
                className="w-full h-16 text-center text-3xl font-mono tracking-[0.5em] border border-gray-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white focus:border-black dark:focus:border-white transition-all"
                placeholder="000000"
                maxLength={6}
              />
            </div>

            <Button
              onClick={() => {}}
              className="w-full h-12 justify-center text-base font-semibold shadow-sm"
              disabled={isVerifying || code.length !== 6}
            >
              {isVerifying ? 'Verifying…' : 'Verify Email'}
            </Button>
          </form>

          <div className="mt-6 text-center">
            {resendCooldown > 0 ? (
              <p className="text-xs text-gray-400">
                Resend available in {resendCooldown}s
              </p>
            ) : (
              <button
                onClick={handleResend}
                className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
              >
                Didn't get a code? Resend
              </button>
            )}
          </div>

          <div className="mt-8 pt-6 border-t border-gray-100 dark:border-zinc-800 text-center">
            <p className="text-[10px] text-gray-400 max-w-sm mx-auto leading-relaxed">
              Check your spam folder if you don't see it. The code expires in 1 hour.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailVerification;
