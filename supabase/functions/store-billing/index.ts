// ============================================================================
// store-billing Edge Function: MatchGPT+ bought inside the phone apps
//
// For the signed-in user (the function checks the access token itself):
//   POST { action: 'config' }
//     → { plans: [{ id, name, amount, currency, period, googleProductId,
//          googleBasePlanId, appleProductId }], googlePlay: boolean }
//     The store products for each plan; the app asks the store for prices.
//     googlePlay is false until GOOGLE_PLAY_SERVICE_ACCOUNT is set.
//   POST { action: 'verify', platform: 'android', purchaseToken }
//   POST { action: 'verify', platform: 'ios', jws }
//     → { pro, status, plan, renewsAt, trialEndsAt }
//     After a purchase in the app: checks it with Google (Play Developer
//     API) or Apple (the transaction's signature), saves the subscription and
//     the charge, and turns Pro on.
//   POST { action: 'restore', platform: 'android', purchaseTokens: [...] }
//   POST { action: 'restore', platform: 'ios', jws: [...] }
//     → { restored, pro }
//     "Restore purchases": the same, for every purchase the store still has.
//
// store-notifications keeps them up to date afterwards (renewals, refunds).
// Deployed with JWT verification off; the function checks the user itself.
// ============================================================================

import { withCors } from '../_shared/cors.ts';
import { errorText, getUserId, rest, serviceConfigured } from '../_shared/serviceRest.ts';
import { googlePlayConfig, GooglePlayError } from '../_shared/googlePlay.ts';
import { AppleJwsError, verifyAppleJws, type AppleTransaction } from '../_shared/appleStore.ts';
import { applyAppleTransaction, applyGooglePurchase, StorePurchaseError } from '../_shared/storeBilling.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const list = (v: unknown) => (Array.isArray(v) ? v.map(text).filter(Boolean).slice(0, 20) : []);

async function config(): Promise<Response> {
  const plans = await rest<Record<string, unknown>[]>(
    'billing_plans?is_active=is.true&order=amount.asc&select=id,name,amount,currency,period,google_product_id,google_base_plan_id,apple_product_id',
  );
  return json({
    plans: plans.map((p) => ({
      id: p.id, name: p.name, amount: p.amount, currency: p.currency, period: p.period,
      googleProductId: p.google_product_id, googleBasePlanId: p.google_base_plan_id, appleProductId: p.apple_product_id,
    })),
    googlePlay: !!googlePlayConfig(),
  });
}

// The caller's Pro and live subscription, for the app to show
async function standing(userId: string) {
  const [me] = await rest<{ subscription_tier: string; subscription_renews_at: string | null }[]>(
    `profiles?id=eq.${userId}&select=subscription_tier,subscription_renews_at`,
  );
  const [sub] = await rest<{ status: string; plan_id: string; trial_ends_at: string | null; current_end: string | null }[]>(
    `subscriptions?user_id=eq.${userId}&status=in.(authenticated,active,pending)&order=created_at.desc&limit=1&select=status,plan_id,trial_ends_at,current_end`,
  );
  return {
    pro: me?.subscription_tier === 'PRO',
    status: sub?.status ?? null,
    plan: sub?.plan_id ?? null,
    renewsAt: sub?.current_end ?? me?.subscription_renews_at ?? null,
    trialEndsAt: sub?.status === 'authenticated' ? sub.trial_ends_at : null,
  };
}

async function verifyOne(userId: string, platform: string, token: string): Promise<void> {
  if (platform === 'android') {
    const cfg = googlePlayConfig();
    if (!cfg) throw new StorePurchaseError('Google Play purchases are not set up yet.', 'NOT_CONFIGURED');
    await applyGooglePurchase(cfg, token, userId);
  } else if (platform === 'ios') {
    const tx = await verifyAppleJws<AppleTransaction>(token);
    await applyAppleTransaction(tx, null, userId);
  } else {
    throw new StorePurchaseError('Unknown platform', 'BAD_REQUEST');
  }
}

Deno.serve(withCors(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!serviceConfigured()) return json({ error: 'Server not configured' }, 500);

  const userId = await getUserId(req);
  if (!userId) return json({ error: 'Please sign in again.', code: 'UNAUTHENTICATED' }, 401);

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    body = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  try {
    const platform = text(body.platform);
    switch (body.action) {
      case 'config':
        return await config();
      case 'verify': {
        const token = platform === 'android' ? text(body.purchaseToken) : text(body.jws);
        if (!token) return json({ error: 'Missing purchase', code: 'BAD_REQUEST' }, 400);
        await verifyOne(userId, platform, token);
        return json(await standing(userId));
      }
      case 'restore': {
        const tokens = platform === 'android' ? list(body.purchaseTokens) : list(body.jws);
        let restored = 0;
        for (const token of tokens) {
          try {
            await verifyOne(userId, platform, token);
            restored++;
          } catch (e) {
            // One bad or someone else's purchase doesn't stop the rest
            console.warn('[store-billing] restore skipped one:', errorText(e));
          }
        }
        return json({ restored, ...(await standing(userId)) });
      }
      default:
        return json({ error: 'Unknown action' }, 400);
    }
  } catch (e) {
    if (e instanceof StorePurchaseError) {
      return json({ error: e.message, code: e.code }, e.code === 'NOT_CONFIGURED' ? 503 : 400);
    }
    if (e instanceof AppleJwsError) return json({ error: 'That purchase could not be checked with Apple.', code: 'INVALID_PURCHASE' }, 400);
    if (e instanceof GooglePlayError && (e.status === 400 || e.status === 404 || e.status === 410)) {
      return json({ error: 'That purchase could not be found on Google Play.', code: 'INVALID_PURCHASE' }, 400);
    }
    console.error('[store-billing] failed:', errorText(e));
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
}));
