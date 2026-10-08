import React from 'react';
import { IconLock, IconZap } from '../constants';
import type { CompatibilityItem } from '../types';

interface CompatibilityReportProps {
  items: CompatibilityItem[];
  score: number;
  isPro: boolean;
  onUpgrade: () => void;
}

const CompatibilityReport: React.FC<CompatibilityReportProps> = ({
  items, score, isPro, onUpgrade,
}) => {
  // Group by sentiment
  const greens = items.filter((i) => i.color === 'green');
  const ambers = items.filter((i) => i.color === 'amber');
  const reds = items.filter((i) => i.color === 'red');

  if (!isPro) {
    return (
      <div className="plus-soft border rounded-xl p-6 relative overflow-hidden">
        {/* Score teaser */}
        <div className="text-center mb-4">
          <div className="text-5xl font-bold text-gray-900 dark:text-white mb-1">{score}%</div>
          <p className="text-xs uppercase font-bold text-gray-500 dark:text-gray-400 tracking-widest">Compatibility</p>
        </div>

        {/* Blurred preview */}
        <div className="relative">
          <div className="space-y-2 blur-sm pointer-events-none select-none">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-2 p-2 bg-white/60 dark:bg-zinc-800/40 rounded">
                <span className="text-base">{i % 2 === 0 ? '✅' : '💖'}</span>
                <span className="text-sm text-gray-700 dark:text-gray-300">Both share similar traits in this category</span>
              </div>
            ))}
          </div>

          {/* Upgrade CTA */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center bg-white/90 dark:bg-zinc-900/95 rounded-xl p-5 shadow-lg border border-gray-200 dark:border-zinc-800 max-w-sm mx-auto">
              <div className="w-10 h-10 plus-solid rounded-full flex items-center justify-center mx-auto mb-3">
                <IconLock />
              </div>
              <h4 className="font-bold text-gray-900 dark:text-white mb-1">See the full breakdown</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Shaadi24+ members see exactly which traits align and where there might be friction.
              </p>
              <button
                onClick={onUpgrade}
                className="plus-solid text-xs font-bold px-4 py-2 rounded-lg shadow-sm hover:opacity-90 inline-flex items-center gap-1.5"
              >
                <IconZap /> Get Shaadi24+
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-6">
      {/* Score header */}
      <div className="text-center mb-6 pb-6 border-b border-gray-100 dark:border-zinc-800">
        <div className="text-5xl font-bold text-gray-900 dark:text-white mb-1">{score}%</div>
        <p className="text-xs uppercase font-bold text-gray-500 dark:text-gray-400 tracking-widest">Compatibility Score</p>
      </div>

      {greens.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs font-bold text-green-700 dark:text-green-400 uppercase tracking-widest mb-2">✓ Strong alignment</h4>
          <div className="space-y-2">
            {greens.map((item, i) => (
              <div key={i} className="flex items-start gap-2 p-2.5 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-100 dark:border-green-900/30">
                <span className="text-base flex-shrink-0">{item.icon}</span>
                <span className="text-sm text-gray-700 dark:text-gray-300">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {ambers.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs font-bold text-yellow-700 dark:text-yellow-400 uppercase tracking-widest mb-2">⚠ Worth discussing</h4>
          <div className="space-y-2">
            {ambers.map((item, i) => (
              <div key={i} className="flex items-start gap-2 p-2.5 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-100 dark:border-yellow-900/30">
                <span className="text-base flex-shrink-0">{item.icon}</span>
                <span className="text-sm text-gray-700 dark:text-gray-300">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {reds.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-red-700 dark:text-red-400 uppercase tracking-widest mb-2">⚠ Potential friction</h4>
          <div className="space-y-2">
            {reds.map((item, i) => (
              <div key={i} className="flex items-start gap-2 p-2.5 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-100 dark:border-red-900/30">
                <span className="text-base flex-shrink-0">{item.icon}</span>
                <span className="text-sm text-gray-700 dark:text-gray-300">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {greens.length === 0 && ambers.length === 0 && reds.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
          Not enough profile data on either side to generate detailed insights yet.
        </p>
      )}
    </div>
  );
};

export default CompatibilityReport;
