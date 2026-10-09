import React, { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/useToast';
import {
  BIODATA_LANGS, BIODATA_TEMPLATES, DEFAULT_OPTIONS, biodataSections, fetchBiodataLink, invocation, label,
  revokeBiodataLink, saveBiodata, shareBiodata, type BiodataLink, type BiodataOptions, type BiodataTemplate,
} from '../lib/biodata';
import type { UserProfile } from '../types';

// ============================================================================
// My Biodata: the member's marriage biodata from their profile (lib/biodata.ts)
//
// Pick a design and a language, choose what's on it, and share the picture
// on WhatsApp. Its QR code and link open the member's page on the website;
// the link counts how often it was opened and can be turned off.
// ============================================================================

const WIDTH = 720;  // the picture is twice this, for print

const THEMES: Record<BiodataTemplate, {
  bg: string; ink: string; muted: string; accent: string; line: string; frame: string; head: string; corner?: string;
}> = {
  classic: {
    bg: '#FFF9EE', ink: '#2E1A12', muted: '#6B4E3D', accent: '#7A1E2C', line: '#D9B26F',
    frame: '6px double #7A1E2C', head: 'Georgia, "Noto Serif", "Noto Serif Devanagari", serif',
  },
  floral: {
    bg: '#FFF4F6', ink: '#3A1D2B', muted: '#7A5265', accent: '#B0306A', line: '#EBB2C9',
    frame: '2px solid #B0306A', head: 'Georgia, "Noto Serif", "Noto Serif Devanagari", serif', corner: '❀',
  },
  simple: {
    bg: '#FFFFFF', ink: '#111111', muted: '#555555', accent: '#111111', line: '#D4D4D4',
    frame: '1px solid #D4D4D4', head: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  },
};

const STORE_KEY = 'shaadi24_biodata_options';
function savedOptions(): BiodataOptions {
  try {
    return { ...DEFAULT_OPTIONS, ...JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') };
  } catch {
    return DEFAULT_OPTIONS;
  }
}

// ---- The biodata itself ---------------------------------------------------------

interface CardProps { profile: UserProfile; photoUrl?: string; options: BiodataOptions; qr: string | null; url: string | null }

const BiodataCard = forwardRef<HTMLDivElement, CardProps>(({ profile, photoUrl, options, qr, url }, ref) => {
  const theme = THEMES[options.template];
  const sections = biodataSections(profile, options);
  const blessing = options.blessing && !(profile.hiddenFields ?? []).includes('religion') ? invocation(profile.religion) : null;
  const photo = options.photo ? photoUrl : undefined;
  const t = (k: Parameters<typeof label>[1]) => label(options.lang, k);
  const name = (profile.hiddenFields ?? []).includes('name') ? '' : (profile.name ?? '').trim();
  return (
    <div ref={ref} style={{ width: WIDTH, background: theme.bg, color: theme.ink, padding: 22, fontFamily: 'system-ui, -apple-system, "Segoe UI", "Noto Sans", sans-serif' }}>
      <div style={{ border: theme.frame, padding: '28px 34px 24px', position: 'relative' }}>
        {theme.corner && ['0 auto auto 0', '0 0 auto auto', 'auto auto 0 0', 'auto 0 0 auto'].map((inset) => (
          <span key={inset} aria-hidden="true" style={{ position: 'absolute', inset, margin: 6, fontSize: 26, lineHeight: 1, color: theme.accent, opacity: 0.8 }}>{theme.corner}</span>
        ))}
        {blessing && <p style={{ textAlign: 'center', margin: 0, fontSize: 18, color: theme.accent }}>{blessing}</p>}
        <h1 style={{ textAlign: 'center', margin: blessing ? '6px 0 4px' : '0 0 4px', fontFamily: theme.head, fontSize: 34, fontWeight: 700, color: theme.accent, letterSpacing: 0.5 }}>
          {t('title')}
        </h1>
        <p aria-hidden="true" style={{ textAlign: 'center', margin: '0 0 18px', color: theme.line, letterSpacing: 6 }}>✦ ✦ ✦</p>

        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {name && <p style={{ margin: '0 0 14px', fontFamily: theme.head, fontSize: 28, fontWeight: 700 }}>{name}</p>}
            {sections.slice(0, 1).map((s) => <Section key={s.key} section={s} theme={theme} />)}
          </div>
          {photo && (
            <img src={photo} alt="" crossOrigin="anonymous"
              style={{ width: 170, height: 214, objectFit: 'cover', borderRadius: 10, border: `3px solid ${theme.line}`, flexShrink: 0 }} />
          )}
        </div>
        {sections.slice(1).map((s) => <Section key={s.key} section={s} theme={theme} />)}

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 20, paddingTop: 16, borderTop: `1px solid ${theme.line}` }}>
          {qr ? <img src={qr} alt="" style={{ width: 96, height: 96, flexShrink: 0 }} />
            : <div style={{ width: 96, height: 96, background: theme.line, opacity: 0.4, flexShrink: 0 }} />}
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{t('scan')}</p>
            {url && <p style={{ margin: '2px 0 0', fontSize: 14, color: theme.muted, wordBreak: 'break-all' }}>{url.replace(/^https?:\/\//, '')}</p>}
            <p style={{ margin: '6px 0 0', fontSize: 13, color: theme.muted }}>💍 {t('made')}</p>
          </div>
        </div>
      </div>
    </div>
  );
});
BiodataCard.displayName = 'BiodataCard';

const Section: React.FC<{ section: ReturnType<typeof biodataSections>[number]; theme: (typeof THEMES)[BiodataTemplate] }> = ({ section, theme }) => (
  <div style={{ marginTop: 16 }}>
    <p style={{ margin: '0 0 8px', fontFamily: theme.head, fontSize: 19, fontWeight: 700, color: theme.accent, borderBottom: `1px solid ${theme.line}`, paddingBottom: 4 }}>
      {section.title}
    </p>
    {section.key === 'about' ? (
      <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5 }}>{section.rows[0].value}</p>
    ) : section.rows.map((r) => (
      <div key={r.label} style={{ display: 'flex', gap: 12, fontSize: 16, lineHeight: 1.45, padding: '2px 0' }}>
        <span style={{ width: 170, flexShrink: 0, color: theme.muted }}>{r.label}</span>
        <span style={{ flex: 1, minWidth: 0, fontWeight: 500 }}>{r.value}</span>
      </div>
    ))}
  </div>
);

// ---- The screen -----------------------------------------------------------------

const Chip: React.FC<{ on: boolean; onClick: () => void; children: React.ReactNode }> = ({ on, onClick, children }) => (
  <button type="button" onClick={onClick} aria-pressed={on}
    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${on
      ? 'bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-black dark:border-white'
      : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400 dark:bg-zinc-800 dark:text-gray-200 dark:border-zinc-700'}`}>
    {children}
  </button>
);

const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void; children: React.ReactNode }> = ({ on, onChange, children }) => (
  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer select-none">
    <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 accent-black dark:accent-white" />
    {children}
  </label>
);

const BiodataView: React.FC<{ onEditProfile?: () => void }> = ({ onEditProfile }) => {
  const { profile, profileRow } = useAuth();
  const { showToast } = useToast();
  const [options, setOptions] = useState<BiodataOptions>(savedOptions);
  const [link, setLink] = useState<BiodataLink | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState<'share' | 'save' | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const [scale, setScale] = useState(0.45);
  const previewBox = useRef<HTMLDivElement>(null);
  const captureRef = useRef<HTMLDivElement>(null);

  const set = (patch: Partial<BiodataOptions>) => setOptions((o) => {
    const next = { ...o, ...patch };
    try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch { /* private mode: not kept */ }
    return next;
  });

  // The member's link, and its QR code
  const loadLink = useCallback(() => fetchBiodataLink().then(setLink).catch((e) => showToast(e.message, 'error')), [showToast]);
  useEffect(() => { void loadLink(); }, [loadLink]);
  useEffect(() => {
    if (!link) return;
    let live = true;
    void import('qrcode').then((QR) => QR.toDataURL(link.url, { margin: 1, width: 240, errorCorrectionLevel: 'M' }))
      .then((data) => { if (live) setQr(data); });
    return () => { live = false; };
  }, [link]);

  // The preview fits the screen's width
  useEffect(() => {
    const el = previewBox.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / WIDTH));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sections = useMemo(() => (profile ? biodataSections(profile, options) : []), [profile, options]);
  if (!profile) return null;
  const photoUrl = profileRow?.photo_urls?.[0];
  const thin = !sections.some((s) => s.key === 'family') && options.family;
  const fileName = `biodata-${(profile.name || 'shaadi24').split(' ')[0].toLowerCase()}.png`;

  const picture = async (): Promise<Blob> => {
    const el = captureRef.current;
    if (!el) throw new Error('The biodata is not ready yet');
    await document.fonts?.ready;
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: THEMES[options.template].bg, logging: false });
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make the picture'))), 'image/png'));
  };

  const run = async (kind: 'share' | 'save') => {
    if (!link) return;
    setBusy(kind);
    try {
      const image = await picture();
      if (kind === 'share') await shareBiodata(image, `${label(options.lang, 'share')} ${link.url}`, fileName);
      else if (await saveBiodata(image, fileName)) showToast('Biodata saved', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Something went wrong', 'error');
    } finally {
      setBusy(null);
    }
  };

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      showToast('Link copied', 'success');
    } catch {
      showToast(link.url, 'info');
    }
  };

  const turnOff = async () => {
    setConfirmOff(false);
    try {
      await revokeBiodataLink();
      setLink(null);
      setQr(null);
      showToast('Link turned off. Biodatas you shared no longer open your profile.', 'success');
      await loadLink();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not turn the link off', 'error');
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6" data-testid="biodata-view">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Biodata</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Your marriage biodata, made from your profile. Share it with families on WhatsApp: its QR code opens your
            profile on Shaadi24. Phone numbers and emails are never on it, nor anything you hid on your profile.
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Design">
            {BIODATA_TEMPLATES.map((d) => <Chip key={d.id} on={options.template === d.id} onClick={() => set({ template: d.id })}>{d.label}</Chip>)}
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Language">
            {BIODATA_LANGS.map((l) => <Chip key={l.id} on={options.lang === l.id} onClick={() => set({ lang: l.id })}>{l.label}</Chip>)}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
            <Toggle on={options.photo} onChange={(v) => set({ photo: v })}>Photo</Toggle>
            <Toggle on={options.blessing} onChange={(v) => set({ blessing: v })}>Blessing at the top</Toggle>
            <Toggle on={options.showDob} onChange={(v) => set({ showDob: v })}>Date of birth, not age</Toggle>
            <Toggle on={options.horoscope} onChange={(v) => set({ horoscope: v })}>Horoscope</Toggle>
            <Toggle on={options.family} onChange={(v) => set({ family: v })}>Family</Toggle>
            <Toggle on={options.about} onChange={(v) => set({ about: v })}>About me</Toggle>
          </div>
          {thin && onEditProfile && (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Families look for family details first.{' '}
              <button type="button" onClick={onEditProfile} className="font-semibold underline">Add them in My Profile</button>
            </p>
          )}
        </div>

        <div ref={previewBox} className="w-full rounded-xl overflow-hidden shadow-lg ring-1 ring-black/5" data-testid="biodata-preview">
          <div style={{ width: WIDTH * scale, overflow: 'hidden' }}>
            <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: WIDTH }}>
              <BiodataCard profile={profile} photoUrl={photoUrl} options={options} qr={qr} url={link?.url ?? null} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => run('share')} disabled={!link || !!busy}
            className="flex-1 min-w-[10rem] px-4 py-3 rounded-xl bg-[#25D366] text-white font-semibold disabled:opacity-50">
            {busy === 'share' ? 'Making the picture…' : 'Share on WhatsApp'}
          </button>
          <button type="button" onClick={() => run('save')} disabled={!link || !!busy}
            className="px-4 py-3 rounded-xl border border-gray-300 dark:border-zinc-700 font-semibold text-gray-800 dark:text-gray-100 disabled:opacity-50">
            {busy === 'save' ? 'Saving…' : 'Save image'}
          </button>
          <button type="button" onClick={copyLink} disabled={!link}
            className="px-4 py-3 rounded-xl border border-gray-300 dark:border-zinc-700 font-semibold text-gray-800 dark:text-gray-100 disabled:opacity-50">
            Copy link
          </button>
        </div>

        {link && (
          <div className="rounded-xl border border-gray-200 dark:border-zinc-800 p-4 text-sm text-gray-600 dark:text-gray-300" data-testid="biodata-link">
            <p>
              Your biodata's link has been opened <strong className="text-gray-900 dark:text-white">{link.opens}</strong> {link.opens === 1 ? 'time' : 'times'}
              {link.lastOpenedAt ? `, last on ${new Date(link.lastOpenedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}.
            </p>
            {confirmOff ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span>Turn the link off? Biodatas you already shared will stop opening your profile.</span>
                <button type="button" onClick={turnOff} className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-semibold">Turn off</button>
                <button type="button" onClick={() => setConfirmOff(false)} className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-zinc-700">Keep it</button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmOff(true)} className="mt-2 font-semibold text-red-600 dark:text-red-400 hover:underline">
                Turn off this link
              </button>
            )}
          </div>
        )}
      </div>

      {/* The picture is made from a full-size copy, off screen */}
      <div aria-hidden="true" style={{ position: 'fixed', left: -10000, top: 0, pointerEvents: 'none' }}>
        <BiodataCard ref={captureRef} profile={profile} photoUrl={photoUrl} options={options} qr={qr} url={link?.url ?? null} />
      </div>
    </div>
  );
};

export default BiodataView;
