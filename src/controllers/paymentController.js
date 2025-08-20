const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const Payment = require('../models/Payment');
const razorpay = require('../config/razorpay');

// Verify payment and update status
const verifyPayment = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log('=== PAYMENT VERIFICATION START ===');
    console.log('Method:', req.method);
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    console.log('Query:', req.query);

    // Handle both GET (callback) and POST (webhook) requests
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = 
      req.method === 'GET' ? req.query : req.body;

    console.log('Extracted params:', { razorpay_order_id, razorpay_payment_id, razorpay_signature: !!razorpay_signature });

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      console.log('Missing required payment parameters');
      await session.abortTransaction();
      return res.redirect(`${process.env.FRONTEND_CANCEL_URL || 'http://localhost:5173'}?error=missing_params`);
    }

    // Verify signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    const isAuthentic = expectedSignature === razorpay_signature;
    console.log('Signature verification:', isAuthentic);
    
    // Fetch order details from Razorpay
    const order = await razorpay.orders.fetch(razorpay_order_id);
    if (!order || !order.notes || !order.notes.userId) {
      console.log('Invalid order or missing user information');
      await session.abortTransaction();
      return res.redirect(`${process.env.FRONTEND_CANCEL_URL || 'http://localhost:5173'}?error=invalid_order`);
    }

    const { userId } = order.notes;

    if (isAuthentic) {
      // Update payment and user status
      await Payment.findOneAndUpdate(
        { razorpayOrderId: razorpay_order_id },
        {
          razorpayPaymentId: razorpay_payment_id,
          razorpaySignature: razorpay_signature,
          status: 'paid'
        },
        { session }
      );

      await User.findByIdAndUpdate(userId, { paymentStatus: 'completed' }, { session });

      await session.commitTransaction();
      
      console.log('Payment verified successfully, redirecting to success page');
      return res.redirect(`${process.env.FRONTEND_SUCCESS_URL || 'http://localhost:5173/success'}?payment_id=${razorpay_payment_id}`);

    } else {
      console.log('Payment signature verification failed');
      
      await Payment.findOneAndUpdate(
        { razorpayOrderId: razorpay_order_id }, 
        { status: 'failed' }, 
        { session }
      );
      await User.findByIdAndUpdate(userId, { paymentStatus: 'failed' }, { session });

      await session.commitTransaction();
      return res.redirect(`${process.env.FRONTEND_CANCEL_URL || 'http://localhost:5173'}?error=signature_failed`);
    }

  } catch (error) {
    await session.abortTransaction();
    console.error('Payment verification error:', error);
    return res.redirect(`${process.env.FRONTEND_CANCEL_URL || 'http://localhost:5173'}?error=server_error`);
  } finally {
    session.endSession();
    console.log('=== PAYMENT VERIFICATION END ===');
  }
};

// Handle payment failure
const handlePaymentFailure = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log('=== PAYMENT FAILURE HANDLER ===');
    console.log('Query:', req.query);
    console.log('Body:', req.body);

    const { orderId } = req.query;

    if (!orderId) {
      await session.abortTransaction();
      return res.redirect(`${process.env.FRONTEND_CANCEL_URL || 'http://localhost:5173'}?error=missing_order_id`);
    }

    // Fetch order details
    const order = await razorpay.orders.fetch(orderId);
    if (order && order.notes && order.notes.userId) {
      const { userId } = order.notes;

      await Payment.findOneAndUpdate(
        { razorpayOrderId: orderId },
        { status: 'cancelled' },
        { session }
      );

      await User.findByIdAndUpdate(userId, { paymentStatus: 'failed' }, { session });
    }

    await session.commitTransaction();
    console.log('Payment marked as cancelled, redirecting to cancel page');
    res.redirect(`${process.env.FRONTEND_CANCEL_URL || 'http://localhost:5173'}?reason=user_cancelled`);

  } catch (error) {
    await session.abortTransaction();
    console.error('Payment failure handling error:', error);
    res.redirect(`${process.env.FRONTEND_CANCEL_URL || 'http://localhost:5173'}?error=server_error`);
  } finally {
    session.endSession();
  }
};

module.exports = {
  verifyPayment,
  handlePaymentFailure
};
