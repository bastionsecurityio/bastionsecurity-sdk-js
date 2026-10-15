import { ServerBastion } from '@bastionsecurity/sdk';
import type { VerificationRequest } from '@bastionsecurity/sdk';

const bastion = new ServerBastion({
  siteKey: process.env.BASTION_SITE_KEY!,
  secret: process.env.BASTION_SECRET_KEY!,
  endpoint: process.env.BASTION_ENDPOINT || 'https://api.bastionsecurity.io/api/antibot',
});

// Call from your authenticated checkout handler. These values must
// come from your session, database, and payment provider.
export async function verifyCheckout(
  telemetry: VerificationRequest,
  order: { customerId: string; amount: number; paymentId: string },
) {
  const decision = await bastion.verify({
    browser_receipt: telemetry.browser_receipt,
    token: telemetry.token,
    fingerprint: telemetry.fingerprint,
    behavior: telemetry.behavior,
    environment: telemetry.environment,
    idempotency_key: telemetry.idempotency_key,
    context: {
      event_type: 'checkout',
      account_id: order.customerId,
      order_amount: order.amount,
      payment_hash: order.paymentId,
    },
  });

  // Persist request_id with the order for audit and reconciliation.
  // Only 'allow' permits the fulfillment path. The caller must also
  // make payment and order fulfillment independently idempotent.
  return { allowed: decision.action === 'allow', decision };
}
