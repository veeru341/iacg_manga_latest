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
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    // IMPORTANT: The body for signature generation should be exactly this
    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    const isAuthentic = expectedSignature === razorpay_signature;
    
    // Fetch order details from Razorpay to get the userId from notes
    const order = await razorpay.orders.fetch(razorpay_order_id);
    if (!order || !order.notes || !order.notes.userId) {
      throw new Error('Invalid order or missing user information.');
    }
    const { userId } = order.notes;

    if (isAuthentic) {
      // Atomically update payment and user status
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
      // Redirect to frontend success page
      return res.redirect(process.env.FRONTEND_SUCCESS_URL);

    } else {
      // If signature is not authentic, mark as failed and redirect
      await Payment.findOneAndUpdate({ razorpayOrderId: razorpay_order_id }, { status: 'failed' }, { session });
      await User.findByIdAndUpdate(userId, { paymentStatus: 'failed' }, { session });

      await session.commitTransaction();
      return res.redirect(process.env.FRONTEND_CANCEL_URL);
    }

  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

// Handle payment failure
const handlePaymentFailure = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { orderId } = req.query;

    if (!orderId) {
      return res.redirect(process.env.FRONTEND_CANCEL_URL);
    }

    // Fetch order details from Razorpay to get the userId from notes
    const order = await razorpay.orders.fetch(orderId);
    if (!order || !order.notes || !order.notes.userId) {
      // If we can't find the order, we can't update our DB, but we should still redirect the user.
      return res.redirect(process.env.FRONTEND_CANCEL_URL);
    }
    const { userId } = order.notes;

    // Atomically update payment and user status
    await Payment.findOneAndUpdate(
      { razorpayOrderId: orderId },
      { status: 'cancelled' },
      { session }
    );

    await User.findByIdAndUpdate(userId, { paymentStatus: 'failed' }, { session });

    await session.commitTransaction();

    // Redirect to frontend cancellation page
    res.redirect(process.env.FRONTEND_CANCEL_URL);

  } catch (error) {
    await session.abortTransaction();
    // Even if there's a DB error, we must redirect the user
    if (!res.headersSent) {
      res.redirect(process.env.FRONTEND_CANCEL_URL);
    }
    next(error);
  } finally {
    session.endSession();
  }
};

module.exports = {
  verifyPayment,
  handlePaymentFailure
};