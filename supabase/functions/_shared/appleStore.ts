// ============================================================================
// App Store: MatchGPT+ bought in the iPhone app
//
// Apple signs every transaction, renewal record and server notification as a
// JWS whose header carries its certificate chain (x5c). verifyAppleJws checks
// that the chain ends at Apple's root certificate (built in below), that each
// certificate is the kind Apple uses for this and was valid when signed, and
// that the signature matches; then the payload can be trusted. No Apple
// account settings are needed for this.
//
// APPLE_BUNDLE_ID: the app's bundle ID (default com.matchgpt.app).
// APPLE_ROOT_CERTIFICATES: replaces the built-in root (base64 DER, comma
// separated). Only for local testing.
// ============================================================================

import * as x509 from 'npm:@peculiar/x509@1.12.3';
import { type StoreState, ZERO_DECIMAL } from './googlePlay.ts';

x509.cryptoProvider.set(crypto);

// Apple Root CA - G3 (SHA-256 63:34:3A:BF:…:3E:91:79), valid until 2039.
// From https://www.apple.com/certificateauthority/
export const APPLE_ROOT_CA_G3 =
  'MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQL' +
  'DB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMw' +
  'MTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRp' +
  'ZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IA' +
  'BJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqX' +
  'l5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8w' +
  'DgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWT' +
  'xnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA==';

// Apple's marks on the certificates that sign App Store data
const OID_INTERMEDIATE = '1.2.840.113635.100.6.2.1';  // Apple Worldwide Developer Relations CA
const OID_LEAF = '1.2.840.113635.100.6.11.1';         // Mac App Store and iTunes Store Receipt Signing

export const appleBundleId = () => Deno.env.get('APPLE_BUNDLE_ID') || 'com.matchgpt.app';

const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const fromBase64url = (s: string) => fromBase64(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='));
const sameBytes = (a: ArrayBuffer, b: ArrayBuffer) => {
  const x = new Uint8Array(a), y = new Uint8Array(b);
  return x.length === y.length && x.every((v, i) => v === y[i]);
};

function trustedRoots(): x509.X509Certificate[] {
  const override = (Deno.env.get('APPLE_ROOT_CERTIFICATES') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return (override.length ? override : [APPLE_ROOT_CA_G3]).map((b64) => new x509.X509Certificate(fromBase64(b64)));
}

export class AppleJwsError extends Error {}

/** The payload of an Apple-signed JWS, once its chain and signature check out. */
export async function verifyAppleJws<T>(jws: string): Promise<T> {
  const parts = typeof jws === 'string' ? jws.split('.') : [];
  if (parts.length !== 3) throw new AppleJwsError('Not a JWS');
  const [h, p, s] = parts;
  let header: { alg?: string; x5c?: string[] };
  let payload: T & { signedDate?: number };
  try {
    header = JSON.parse(new TextDecoder().decode(fromBase64url(h)));
    payload = JSON.parse(new TextDecoder().decode(fromBase64url(p)));
  } catch {
    throw new AppleJwsError('Unreadable JWS');
  }
  if (header.alg !== 'ES256' || !Array.isArray(header.x5c) || header.x5c.length !== 3) {
    throw new AppleJwsError('Unexpected JWS header');
  }
  const [leaf, intermediate, root] = header.x5c.map((c) => new x509.X509Certificate(fromBase64(c)));

  // The chain: the root is Apple's, each certificate signed by the next
  if (!trustedRoots().some((r) => sameBytes(r.rawData, root.rawData))) throw new AppleJwsError('Not signed by Apple');
  if (!(await intermediate.verify({ publicKey: root.publicKey, signatureOnly: true }))) throw new AppleJwsError('Bad certificate chain');
  if (!(await leaf.verify({ publicKey: intermediate.publicKey, signatureOnly: true }))) throw new AppleJwsError('Bad certificate chain');
  if (!intermediate.getExtension(OID_INTERMEDIATE) || !leaf.getExtension(OID_LEAF)) {
    throw new AppleJwsError('Not an App Store signing certificate');
  }
  // Valid when signed (Apple's renewal records can be re-sent long after)
  const at = new Date(typeof payload.signedDate === 'number' ? payload.signedDate : Date.now());
  for (const cert of [leaf, intermediate]) {
    if (at < cert.notBefore || at > cert.notAfter) throw new AppleJwsError('Certificate not valid at signing time');
  }

  const key = await leaf.publicKey.export({ name: 'ECDSA', namedCurve: 'P-256' }, ['verify']);
  const ok = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' }, key, fromBase64url(s), new TextEncoder().encode(`${h}.${p}`),
  );
  if (!ok) throw new AppleJwsError('Bad signature');
  return payload;
}

// ---- What Apple's payloads hold (App Store Server API v2) --------------------------

export interface AppleTransaction {
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  purchaseDate?: number;
  expiresDate?: number;
  signedDate?: number;
  environment?: 'Sandbox' | 'Production' | 'Xcode' | 'LocalTesting';
  type?: string;
  offerType?: number;              // 1 = introductory offer (our free trial)
  offerDiscountType?: string;      // FREE_TRIAL, PAY_AS_YOU_GO, PAY_UP_FRONT
  price?: number;                  // in thousandths of the currency unit
  currency?: string;
  appAccountToken?: string;        // the MatchGPT account the app passed with the purchase
  revocationDate?: number;
  revocationReason?: number;
  transactionReason?: 'PURCHASE' | 'RENEWAL';
}

export interface AppleRenewalInfo {
  originalTransactionId: string;
  productId?: string;
  autoRenewProductId?: string;
  autoRenewStatus?: number;        // 1 = renews, 0 = turned off
  gracePeriodExpiresDate?: number;
  isInBillingRetryPeriod?: boolean;
  signedDate?: number;
}

export interface AppleNotification {
  notificationType: string;
  subtype?: string;
  notificationUUID: string;
  signedDate?: number;
  data?: {
    bundleId?: string;
    environment?: string;
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
  };
}

const iso = (ms?: number) => (typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString() : null);

// Apple's price (thousandths) → the currency's smallest unit (₹999 = 999000 → 99900)
export function applePriceToMinor(price?: number, currency?: string): { amount: number; currency: string } | null {
  if (typeof price !== 'number' || !currency) return null;
  const digits = ZERO_DECIMAL.has(currency) ? 0 : 2;
  return { amount: Math.round((price / 1000) * 10 ** digits), currency };
}

export function appleState(tx: AppleTransaction, renewal: AppleRenewalInfo | null, now = new Date()): StoreState {
  const expires = tx.expiresDate ?? 0;
  const inTrial = tx.offerType === 1 && (tx.offerDiscountType === 'FREE_TRIAL' || tx.price === 0);
  const grace = renewal?.gracePeriodExpiresDate ?? 0;

  let status: StoreState['status'];
  let currentEnd = iso(tx.expiresDate);
  if (tx.revocationDate) status = 'cancelled';
  else if (expires > now.getTime()) status = inTrial ? 'authenticated' : 'active';
  else if (grace > now.getTime()) { status = 'pending'; currentEnd = iso(grace); }
  else if (renewal?.isInBillingRetryPeriod) status = 'halted';
  else status = 'expired';

  const autoRenew = renewal ? renewal.autoRenewStatus === 1 : null;
  return {
    status,
    productId: tx.productId ?? null,
    basePlanId: null,
    mode: tx.environment === 'Production' ? 'live' : 'test',
    // (a revoked trial gives nothing: Pro reads a cancelled row's trial end)
    trialEndsAt: inTrial && status !== 'cancelled' ? iso(tx.expiresDate) : null,
    currentStart: inTrial ? null : iso(tx.purchaseDate),
    currentEnd: inTrial ? null : currentEnd,
    autoRenew,
    cancelAtPeriodEnd: autoRenew === false,
    endedAt: status === 'cancelled' ? iso(tx.revocationDate) : status === 'expired' ? iso(tx.expiresDate) : null,
    orderId: inTrial ? null : tx.transactionId,
    price: inTrial ? null : applePriceToMinor(tx.price, tx.currency),
    userId: tx.appAccountToken ?? null,
    linkedPurchaseToken: null,
    needsAcknowledgement: false,
  };
}
