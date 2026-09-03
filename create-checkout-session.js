const Stripe = require('stripe');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const {
      bookingRequestId,
      customerName,
      customerEmail,
      vehicleName,
      depositAmount
    } = req.body || {};

    if (!bookingRequestId || !customerName || !depositAmount) {
      return res.status(400).json({
        error: 'Missing required payment information'
      });
    }

    const amountInCents = Math.round(Number(depositAmount) * 100);

    if (!Number.isFinite(amountInCents) || amountInCents <= 0) {
      return res.status(400).json({
        error: 'Invalid deposit amount'
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',

      customer_email: customerEmail || undefined,

      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Rental Deposit - ${vehicleName || 'City Life Rental'}`
            },
            unit_amount: amountInCents
          },
          quantity: 1
        }
      ],

      metadata: {
        booking_request_id: String(bookingRequestId),
        payment_type: 'rental_deposit',
        customer_name: String(customerName)
      },

      success_url:
        'https://www.cityliferentalcars.com/payment-success.html?session_id={CHECKOUT_SESSION_ID}',

      cancel_url:
        'https://www.cityliferentalcars.com/payment-cancelled.html'
    });

    return res.status(200).json({
      url: session.url
    });
  } catch (error) {
    console.error('Stripe checkout error:', error);

    return res.status(500).json({
      error: error.message || 'Unable to create checkout session'
    });
  }
};
