const express = require('express');
const { verifyPayment, handlePaymentFailure } = require('../controllers/paymentController');

const router = express.Router();

// POST /api/payment/verify - Verify payment after successful payment
router.post('/verify', verifyPayment);

// POST /api/payment/failed - Handle payment failure
router.post('/failed', handlePaymentFailure);

// A temporary route to debug payment failure callbacks from the gateway.
// Point your gateway's failure URL here to see the full payload.
router.all('/debug-failure', (req, res) => {
    console.log('--- PAYMENT FAILURE DEBUG ---');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Request Method:', req.method);
    console.log('Request Headers:', req.headers);
    console.log('Request Query:', req.query);
    console.log('Request Body:', req.body);
    console.log('---------------------------');
    // Respond to the client/gateway
    res.status(400).json({
        message: 'Failure has been logged on the backend. Check server console.',
    });
});

module.exports = router;