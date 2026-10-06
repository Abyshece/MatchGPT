import React, { useState } from 'react';
import { Button } from './NotionUI';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/useToast';

// ============================================================================
// SetNewPassword
//
// Shown after the user opens a password-reset link from their email. The link
// has already signed them in; here they choose the new password.
// ============================================================================

const SetNewPassword: React.FC = () => {
  const { finishPasswordRecovery } = useAuth();
  const { showToast } = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setIsSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setIsSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    showToast('Password updated', 'success');
    finishPasswordRecovery();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#191919] p-6">
      <div className="max-w-sm w-full">
        <div className="text-5xl mb-6">🔑</div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight mb-2">Set a new password</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8">Choose a new password for your MatchGPT account.</p>

        {error && (
          <div className="mb-4 px-3 py-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 text-xs font-medium text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">New password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              className="w-full h-11 px-3 border border-gray-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-gray-900 dark:text-white outline-none focus:border-black dark:focus:border-white focus:ring-1 focus:ring-black dark:focus:ring-white"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Repeat new password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="w-full h-11 px-3 border border-gray-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-gray-900 dark:text-white outline-none focus:border-black dark:focus:border-white focus:ring-1 focus:ring-black dark:focus:ring-white"
              required
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
            <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
            Show passwords
          </label>

          <Button onClick={() => {}} className="w-full h-11 justify-center text-sm font-bold" disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save new password'}
          </Button>
          <button
            type="button"
            onClick={finishPasswordRecovery}
            className="w-full text-center text-xs text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            Skip, keep my current password
          </button>
        </form>
      </div>
    </div>
  );
};

export default SetNewPassword;
