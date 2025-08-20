const mongoose = require('mongoose');
const User = require('../models/User');
const Payment = require('../models/Payment');
const razorpay = require('../config/razorpay');
const crypto = require('crypto');

// Main API: Submit form and create payment order
const submitFormAndCreatePayment = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { name, mobile, email, city, experience } = req.body;

    const existingUser = await User.findOne({
      $or: [{ email }, { mobile }]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email or mobile number already exists'
      });
    }

    const user = new User({
      name,
      mobile,
      email,
      city,
      experience
    });

    const savedUser = await user.save({ session });

    const amount = parseInt(process.env.PAYMENT_AMOUNT, 10) || 50000;
    const uniqueSuffix = crypto.randomBytes(3).toString('hex');
    const receipt = `rcpt_${savedUser._id}_${uniqueSuffix}`;

    const options = {
      amount: amount,
      currency: 'INR',
      receipt: receipt,
      notes: {
        userId: savedUser._id.toString(),
        userName: name,
        userEmail: email
      }
    };

    const order = await razorpay.orders.create(options);

    const payment = new Payment({
      userId: savedUser._id,
      razorpayOrderId: order.id,
      amount: amount,
      receipt: receipt,
      status: 'created'
    });

    const savedPayment = await payment.save({ session });
    savedUser.paymentId = savedPayment._id;
    await savedUser.save({ session });

    await session.commitTransaction();

    // Build the payment link that frontend expects
    const callbackUrl = `${process.env.BACKEND_URL}/api/payment/verify`;
    const cancelUrl = `${process.env.BACKEND_URL}/api/payment/failed?orderId=${order.id}`;
    
    const checkoutUrl = new URL('https://api.razorpay.com/v1/checkout/embedded');
    checkoutUrl.searchParams.set('key_id', process.env.RAZORPAY_KEY_ID);
    checkoutUrl.searchParams.set('order_id', order.id);
    checkoutUrl.searchParams.set('name', 'IACG Manga Course');
    checkoutUrl.searchParams.set('prefill[name]', name);
    checkoutUrl.searchParams.set('prefill[email]', email);
    checkoutUrl.searchParams.set('prefill[contact]', mobile);
    checkoutUrl.searchParams.set('callback_url', callbackUrl);
    checkoutUrl.searchParams.set('cancel_url', cancelUrl);

    // Return the payment link that frontend expects
    res.status(200).json({
      success: true,
      paymentLink: checkoutUrl.toString() // This is what your frontend is looking for
    });

  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

// Get user details
const getUserDetails = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).populate('paymentId');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: user
    });

  } catch (error) {
    next(error);
  }
};

module.exports = {
  submitFormAndCreatePayment,
  getUserDetails
};