const express = require('express');
const { verifyPayment, handlePaymentFailure } = require('../controllers/paymentController');

const router = express.Router();

// SUPPORT BOTH GET AND POST for /verify (important for Razorpay callbacks)
router.get('/verify', verifyPayment);     // Handles GET callback from Razorpay
router.post('/verify', verifyPayment);    // Handles POST callback/webhook

// SUPPORT BOTH GET AND POST for /failed (for flexibility and redirects)
router.get('/failed', handlePaymentFailure);  // Handles GET cancel callback
router.post('/failed', handlePaymentFailure); // Handles POST cancel callback

// Temporary route for debugging payment failure payloads from gateway
router.all('/debug-failure', (req, res) => {
    console.log('--- PAYMENT FAILURE DEBUG ---');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Request Method:', req.method);
    console.log('Request Headers:', req.headers);
    console.log('Request Query:', req.query);
    console.log('Request Body:', req.body);
    console.log('---------------------------');
    res.status(400).json({
        message: 'Failure has been logged on the backend. Check server console.',
    });
});

module.exports = router;
