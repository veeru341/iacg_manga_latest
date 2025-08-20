const express = require('express');
const { submitFormAndCreatePayment, getUserDetails } = require('../controllers/userController');
const { validateUser } = require('../middleware/validation');

const router = express.Router();

// POST /api/users/submit - Main endpoint for form submission
router.post('/submit', validateUser, submitFormAndCreatePayment);

// GET /api/users/:userId - Get user details
router.get('/:userId([0-9a-fA-F]{24})', getUserDetails);

module.exports = router;