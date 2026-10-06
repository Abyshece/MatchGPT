import React, { useEffect, useRef, useState } from 'react';
import { APP_PREVIEW_PATH } from '../../lib/appPreview';

// ============================================================================
// Admin → App Preview: the members' app, phone-sized, to see that everything
// works (lib/appPreview.ts). It runs on the live data and keeps its own
// sign-in: sign in with your own account or a test account, and the admin
// panel stays signed in. Scaled down when the screen is too short for it.
// ============================================================================

// Phone screens in CSS pixels
const PHONES = [
  { id: 'iphone', label: 'iPhone 16', width: 393, height: 852 },
  { id: 'iphone-se', label: 'iPhone SE', width: 375, height: 667 },
  { id: 'android', label: 'Android (Pixel 8)', width: 412, height: 915 },
] as const;
type PhoneId = typeof PHONES[number]['id'];

const BEZEL = 12;  // the frame around the screen (p-3)

const AdminAppTab: React.FC = () => {
  const [phoneId, setPhoneId] = useState<PhoneId>('iphone');
  const [reloads, setReloads] = useState(0);
  const [scale, setScale] = useState(1);
  const frameRef = useRef<HTMLDivElement>(null);
  const phone = PHONES.find((p) => p.id === phoneId) ?? PHONES[0];
  const frameW = phone.width + 2 * BEZEL;
  const frameH = phone.height + 2 * BEZEL;

  // The whole phone on screen: scaled to the height left below the controls
  useEffect(() => {
    const fit = () => {
      const top = frameRef.current?.getBoundingClientRect().top ?? 0;
      const room = window.innerHeight - Math.max(top, 0) - 24;
      setScale(Math.min(1, Math.max(0.5, room / frameH)));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [frameH]);

  return (
    <div data-testid="admin-app-tab">
      <p className="max-w-3xl text-sm leading-relaxed text-gray-600 dark:text-gray-300">
        The members' app as it looks on a phone, with the live data. Only admins can open it. It has its own sign-in:
        use your own account or a test account, and the admin panel stays signed in. What you do here is real: likes,
        messages and profile changes reach members. Shaadi24+ purchases, phone notifications and Google or Apple
        sign-in work only in the Android and iPhone apps.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {PHONES.map((p) => (
          <button
            key={p.id}
            onClick={() => setPhoneId(p.id)}
            aria-pressed={p.id === phoneId}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              p.id === phoneId
                ? 'bg-black text-white border-black dark:bg-white dark:text-black dark:border-white'
                : 'border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800'
            }`}
          >
            {p.label}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-gray-200 dark:bg-zinc-700" aria-hidden="true" />
        <button
          onClick={() => setReloads((n) => n + 1)}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800"
        >
          Reload
        </button>
        <a
          href={APP_PREVIEW_PATH}
          target="_blank"
          rel="noopener"
          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800"
        >
          Open in a new tab ↗
        </a>
        {scale < 1 && (
          <span className="text-xs text-gray-500 dark:text-gray-400">Shown at {Math.round(scale * 100)}% to fit your screen</span>
        )}
      </div>

      <div ref={frameRef} className="mt-4 flex justify-center">
        <div style={{ width: frameW * scale, height: frameH * scale }}>
          <div
            style={{ width: frameW, height: frameH, transform: `scale(${scale})`, transformOrigin: 'top left' }}
            className="rounded-[48px] bg-gray-900 dark:bg-zinc-700 p-3 shadow-xl"
          >
            <iframe
              key={reloads}
              src={APP_PREVIEW_PATH}
              title="The Shaadi24 app"
              width={phone.width}
              height={phone.height}
              data-testid="app-preview-frame"
              className="block rounded-[36px] bg-white dark:bg-[#191919]"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminAppTab;
