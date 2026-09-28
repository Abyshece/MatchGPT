// ============================================================================
// Razorpay Checkout (https://checkout.razorpay.com/v1/checkout.js)
//
// The customer approves the subscription (card, UPI AutoPay or bank mandate)
// in Razorpay's own window. On success Checkout hands back the payment and
// subscription ids and a signature, which the billing function checks.
// ============================================================================

export interface CheckoutResponse {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open(): void;
  on(event: string, handler: (response: unknown) => void): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

const SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';
let loading: Promise<void> | null = null;

function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.Razorpay ? resolve() : reject(new Error('Payment window could not load')));
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error("The payment window couldn't load. Check your connection and try again."));
    };
    document.head.appendChild(script);
  });
  return loading;
}

// The customer closed Checkout without finishing
export class CheckoutClosed extends Error {
  constructor() {
    super('Checkout closed');
  }
}

export async function openCheckout(opts: {
  keyId: string;
  subscriptionId: string;
  description: string;
  prefill: { name: string; email: string };
}): Promise<CheckoutResponse> {
  await loadCheckout();
  return new Promise<CheckoutResponse>((resolve, reject) => {
    const checkout = new window.Razorpay!({
      key: opts.keyId,
      subscription_id: opts.subscriptionId,
      name: 'MatchGPT',
      description: opts.description,
      prefill: opts.prefill,
      theme: { color: '#111111' },
      handler: (response: CheckoutResponse) => resolve(response),
      modal: { ondismiss: () => reject(new CheckoutClosed()) },
    });
    // A failed attempt stays in Checkout, which shows the reason and lets the
    // customer try another way; closing it then rejects above.
    checkout.open();
  });
}
