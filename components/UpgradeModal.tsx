import React from 'react';
import { IconX, IconZap, IconCheck } from '../constants';
import { SUBSCRIPTION_PLANS } from '../constants';

interface UpgradeModalProps {
  reason: 'daily_limit' | 'pro_feature' | 'compatibility_report';
  resetInHours?: number;
  onClose: () => void;
}

const UpgradeModal: React.FC<UpgradeModalProps> = ({ reason, resetInHours, onClose }) => {
  const proPlan = SUBSCRIPTION_PLANS.find((p) => p.tier === 'PRO')!;

  const headline =
    reason === 'daily_limit'
      ? `You've used your free search today`
      : reason === 'compatibility_report'
        ? 'Unlock the Compatibility Report'
        : 'Upgrade to Pro';

  const subtitle =
    reason === 'daily_limit'
      ? `Wait ${resetInHours ?? 24}h or upgrade for unlimited searches.`
      : reason === 'compatibility_report'
        ? 'See exactly which traits align and where there might be friction.'
        : 'Get unlimited access to MatchGPT.';

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200 dark:border-zinc-800 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-30 p-1.5 rounded-full text-gray-400 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800"
        >
          <IconX />
        </button>

        {/* Header gradient */}
        <div className="bg-gradient-to-br from-yellow-500 via-orange-500 to-pink-500 p-6 text-center text-white">
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <IconZap />
          </div>
          <h2 className="text-2xl font-bold mb-1">{headline}</h2>
          <p className="text-sm text-white/90">{subtitle}</p>
        </div>

        {/* Plan */}
        <div className="p-6">
          <div className="text-center mb-4">
            <div className="inline-flex items-baseline gap-1">
              <span className="text-3xl font-bold text-gray-900 dark:text-white">{proPlan.price}</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">/ {proPlan.period}</span>
            </div>
          </div>

          <ul className="space-y-2 mb-6">
            {proPlan.features.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                <span className="text-green-500 flex-shrink-0 mt-0.5"><IconCheck className="w-4 h-4" /></span>
                <span>{f}</span>
              </li>
            ))}
          </ul>

          <button
            disabled
            className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-bold py-3 rounded-lg shadow-md hover:opacity-90 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <IconZap /> Upgrade to Pro
          </button>

          <p className="text-[11px] text-gray-400 text-center mt-3">
            Pro subscriptions are coming soon.
          </p>

          <button
            onClick={onClose}
            className="w-full text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mt-4 py-2"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpgradeModal;
