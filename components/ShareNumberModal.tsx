import React, { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { shareMyNumber, type Message } from '../lib/chatService';
import { IconAlert, IconPhone, IconX } from '../constants';

// ============================================================================
// ShareNumberModal (chat ⋯ → Share my number): the member's own number into
// the chat, when they choose to. Shaadi24 never shows a phone number
// otherwise. Once sent it can't be taken back, which the sheet says.
// ============================================================================

const ShareNumberModal: React.FC<{
  matchId: string;
  name: string;
  onClose: () => void;
  onShared: (message: Message) => void;
}> = ({ matchId, name, onClose, onShared }) => {
  const { profile } = useAuth();
  const [phone, setPhone] = useState(profile?.phoneNumber ?? '');
  const [remember, setRemember] = useState(!profile?.phoneNumber);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSending(true);
    const { message, error: shareError } = await shareMyNumber(matchId, phone, remember);
    setSending(false);
    if (shareError || !message) {
      setError(shareError ?? 'Your number was not shared.');
      return;
    }
    onShared(message);
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-end sm:items-center justify-center sm:p-4 popup-backdrop animate-fade-in" onClick={onClose}>
      <form
        onSubmit={send}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-number-title"
        data-testid="share-number-modal"
        className="w-full sm:max-w-md bg-white dark:bg-zinc-900 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-200 dark:border-zinc-800 p-6"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 flex items-center justify-center flex-shrink-0 [&>svg]:w-5 [&>svg]:h-5" aria-hidden="true">
            <IconPhone />
          </div>
          <div className="flex-1 min-w-0">
            <h3 id="share-number-title" className="text-lg font-bold text-gray-900 dark:text-white">Share your number with {name}?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {name} sees it in this chat and can call or WhatsApp you. Once it's sent, it can't be taken back.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 -mt-1 p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800">
            <IconX />
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-4 px-3 py-2 rounded-md bg-red-50 dark:bg-red-900/20 text-xs font-medium text-red-700 dark:text-red-300">{error}</p>
        )}

        <label htmlFor="share-number" className="block mt-4 text-xs font-bold text-gray-600 dark:text-gray-300 mb-1.5">Your mobile number</label>
        <input
          id="share-number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="98765 43210"
          data-testid="share-number-input"
          className="w-full rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-zinc-800"
        />
        <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">An Indian mobile number, or + and the country code.</p>

        <label className="mt-3 flex items-start gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="mt-0.5" />
          <span>Remember it for next time. It's never shown on your profile.</span>
        </label>

        <p className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
          <span aria-hidden="true" className="flex-none mt-px [&>svg]:w-4 [&>svg]:h-4"><IconAlert /></span>
          <span>Share it when you're comfortable. Never send money or share an OTP, whoever asks.</span>
        </p>

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-300 dark:border-zinc-700 rounded-lg text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800">
            Cancel
          </button>
          <button
            type="submit"
            disabled={sending || phone.replace(/\D/g, '').length < 8}
            data-testid="share-number-send"
            className="flex-1 py-2.5 rounded-lg text-sm font-bold bg-black dark:bg-white text-white dark:text-black hover:opacity-90 disabled:opacity-40"
          >
            {sending ? 'Sharing…' : 'Share my number'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ShareNumberModal;
