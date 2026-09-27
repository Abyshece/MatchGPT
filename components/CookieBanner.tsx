import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import {
  setCookiePreferences, hasShownCookieBanner, getCookiePreferences,
} from '../lib/consentService';
import type { CookieCategories } from '../lib/consentService';
import { IconX, IconShield } from '../constants';

// ============================================================================
// CookieBanner
//
// Bottom-of-screen GDPR consent banner. Three actions: Accept All, Reject All
// (non-essential), Customize. Hard mode: nothing non-essential happens until
// the user explicitly accepts (or has previously consented).
// ============================================================================

interface CookieBannerProps {
  onNavigateToPrivacy: () => void;
}

const CookieBanner: React.FC<CookieBannerProps> = ({ onNavigateToPrivacy }) => {
  const { session } = useAuth();
  const [visible, setVisible] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [prefs, setPrefs] = useState<CookieCategories>(getCookiePreferences());
  const [busy, setBusy] = useState(false);

  // Show banner if user hasn't seen it yet
  useEffect(() => {
    if (!hasShownCookieBanner()) {
      // small delay so it doesn't fight the initial render
      const t = setTimeout(() => setVisible(true), 500);
      return () => clearTimeout(t);
    }
  }, []);

  const handleAcceptAll = async () => {
    setBusy(true);
    await setCookiePreferences(
      { essential: true, analytics: true, marketing: true },
      session?.user.id
    );
    setBusy(false);
    setVisible(false);
  };

  const handleRejectNonEssential = async () => {
    setBusy(true);
    await setCookiePreferences(
      { essential: true, analytics: false, marketing: false },
      session?.user.id
    );
    setBusy(false);
    setVisible(false);
  };

  const handleSaveCustom = async () => {
    setBusy(true);
    await setCookiePreferences(prefs, session?.user.id);
    setBusy(false);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[500] p-3 sm:p-4 animate-fade-in pointer-events-none">
      <div className="max-w-3xl mx-auto bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl shadow-2xl overflow-hidden pointer-events-auto">
        {!showCustomize ? (
          // ---- SIMPLE VIEW ----
          <div className="p-5">
            <div className="flex items-start gap-3 mb-3">
              <div className="text-blue-500 flex-shrink-0 mt-0.5"><IconShield /></div>
              <div className="flex-1">
                <h3 className="font-bold text-gray-900 dark:text-white text-sm mb-1">
                  We respect your privacy
                </h3>
                <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                  We use cookies to keep you signed in and improve the service. Essential cookies
                  are required to use MatchGPT. Analytics and marketing cookies are optional.{' '}
                  <button
                    onClick={onNavigateToPrivacy}
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Read our Privacy Policy
                  </button>
                  .
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 mt-4">
              <button
                onClick={() => setShowCustomize(true)}
                disabled={busy}
                className="flex-1 py-2.5 border border-gray-300 dark:border-zinc-700 rounded-lg text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-50"
              >
                Customize
              </button>
              <button
                onClick={handleRejectNonEssential}
                disabled={busy}
                className="flex-1 py-2.5 border border-gray-300 dark:border-zinc-700 rounded-lg text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-50"
              >
                Reject non-essential
              </button>
              <button
                onClick={handleAcceptAll}
                disabled={busy}
                className="flex-1 py-2.5 bg-black dark:bg-white text-white dark:text-black rounded-lg text-xs font-bold shadow-sm hover:opacity-90 disabled:opacity-50"
              >
                Accept all
              </button>
            </div>
          </div>
        ) : (
          // ---- CUSTOMIZE VIEW ----
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 dark:text-white text-sm flex items-center gap-2">
                <IconShield /> Cookie preferences
              </h3>
              <button
                onClick={() => setShowCustomize(false)}
                className="text-gray-400 hover:text-black dark:hover:text-white"
              >
                <IconX />
              </button>
            </div>

            <div className="space-y-3 mb-5">
              {/* Essential — always on, can't be toggled */}
              <CookieRow
                label="Essential"
                description="Required for sign-in, session management, and basic security. Cannot be disabled."
                checked={true}
                disabled={true}
                onChange={() => {}}
              />
              <CookieRow
                label="Analytics"
                description="Help us understand how the service is used so we can improve it. Anonymous usage data only."
                checked={prefs.analytics}
                onChange={(v) => setPrefs({ ...prefs, analytics: v })}
              />
              <CookieRow
                label="Marketing"
                description="Used for promotional features. Currently unused but reserved for the future."
                checked={prefs.marketing}
                onChange={(v) => setPrefs({ ...prefs, marketing: v })}
              />
            </div>

            <button
              onClick={onNavigateToPrivacy}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline mb-4 block"
            >
              Read our full Privacy Policy →
            </button>

            <div className="flex gap-2">
              <button
                onClick={() => setShowCustomize(false)}
                disabled={busy}
                className="flex-1 py-2.5 border border-gray-300 dark:border-zinc-700 rounded-lg text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-50"
              >
                Back
              </button>
              <button
                onClick={handleSaveCustom}
                disabled={busy}
                className="flex-1 py-2.5 bg-black dark:bg-white text-white dark:text-black rounded-lg text-xs font-bold shadow-sm hover:opacity-90 disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Save preferences'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Internal row for each cookie category
const CookieRow: React.FC<{
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}> = ({ label, description, checked, disabled, onChange }) => (
  <div
    onClick={() => !disabled && onChange(!checked)}
    className={`flex items-start gap-3 p-3 rounded-lg border ${
      disabled
        ? 'bg-gray-50 dark:bg-zinc-800/50 border-gray-200 dark:border-zinc-800 cursor-not-allowed'
        : checked
          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 cursor-pointer'
          : 'bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-600 cursor-pointer'
    }`}
  >
    <div className="flex-1 min-w-0">
      <h4 className="text-sm font-bold text-gray-900 dark:text-white">{label}</h4>
      <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed mt-0.5">{description}</p>
    </div>
    <div className={`w-10 h-5 rounded-full relative flex-shrink-0 mt-0.5 transition-colors ${
      disabled
        ? 'bg-gray-400'
        : checked
          ? 'bg-blue-500'
          : 'bg-gray-300 dark:bg-zinc-600'
    }`}>
      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${checked ? 'left-5' : 'left-0.5'}`} />
    </div>
  </div>
);

export default CookieBanner;
