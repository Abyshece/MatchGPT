import React, { useEffect, useState } from 'react';
import { fetchCurrentOffer, redeemLinks, type Offer } from '../../lib/adminGrowth';

// ============================================================================
// The offer running now, as a banner across the top of the website's home
// page (Admin → Offers): its text, the code (tap to copy), and where to
// redeem it: Apple's offer-code page, Google Play's redeem page.
// ============================================================================

type BannerOffer = Pick<Offer, 'banner_text' | 'code' | 'stores'>;

export const OfferBannerView: React.FC<{ offer: BannerOffer }> = ({ offer }) => {
  const [copied, setCopied] = useState(false);
  const links = redeemLinks(offer);
  const copy = () => {
    void navigator.clipboard?.writeText(offer.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="w-full bg-gray-900 text-white dark:bg-white dark:text-gray-900" data-testid="offer-banner">
      <div className="max-w-5xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-sm text-center">
        <span aria-hidden="true">🎁</span>
        <span className="font-medium">{offer.banner_text}</span>
        <span className="inline-flex items-center gap-2">
          <span className="opacity-80">Use code</span>
          <button
            type="button"
            onClick={copy}
            title="Copy the code"
            className="font-mono font-semibold tracking-wider px-2 py-0.5 rounded border border-white/40 dark:border-gray-900/30 hover:bg-white/10 dark:hover:bg-black/5"
          >
            {copied ? 'Copied ✓' : offer.code}
          </button>
        </span>
        {(links.appStore || links.googlePlay) && (
          <span className="inline-flex items-center gap-3 text-xs">
            {links.appStore && <a href={links.appStore} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Redeem on iPhone</a>}
            {links.googlePlay && <a href={links.googlePlay} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Redeem on Android</a>}
          </span>
        )}
      </div>
    </div>
  );
};

const OfferBanner: React.FC = () => {
  const [offer, setOffer] = useState<Offer | null>(null);
  useEffect(() => {
    let live = true;
    void fetchCurrentOffer().then((o) => { if (live) setOffer(o); });
    return () => { live = false; };
  }, []);
  return offer ? <OfferBannerView offer={offer} /> : null;
};

export default OfferBanner;
