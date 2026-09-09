const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
async function getRawBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(
      typeof chunk === 'string' ? Buffer.from(chunk) : chunk
    );
  }

  return Buffer.concat(chunks);
}
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const sig = req.headers['stripe-signature'];

  let event;

  try {
  const rawBody = await getRawBody(req);

event = stripe.webhooks.constructEvent(
  rawBody,
  sig,
  process.env.STRIPE_WEBHOOK_SECRET
);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      const bookingRequestId =
        session.metadata?.booking_request_id;

      if (!bookingRequestId) {
        console.error('No booking_request_id found in Stripe metadata');
        return res.status(400).json({
          error: 'Missing booking request ID'
        });
      }

      const amountPaid =
        session.amount_total != null
          ? session.amount_total / 100
          : null;

      const { error } = await supabase
        .from('booking_requests')
        .update({
          deposit_paid: true,
          deposit_paid_at: new Date().toISOString(),
          deposit_amount_paid: amountPaid,
          stripe_session_id: session.id,
          stripe_payment_intent_id: session.payment_intent
            ? String(session.payment_intent)
            : null
        })
        .eq('id', bookingRequestId);

      if (error) {
        console.error('Supabase update error:', error);
        return res.status(500).json({
          error: 'Unable to update booking'
        });
      }

      console.log(
        `Deposit payment recorded for booking ${bookingRequestId}`
      );
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook processing error:', err);
    return res.status(500).json({
      error: 'Webhook processing failed'
    });
  };
  module.exports.config = {
  api: {
    bodyParser: false
  }
};
};
