const twilio = require('twilio');
const logger = require('../utils/logger');

/**
 * Middleware to verify Twilio webhook signatures
 * Prevents unauthorized parties from POSTing fake SMS replies
 *
 * CRITICAL SECURITY: This middleware MUST be applied to all Twilio webhook endpoints
 */
function validateTwilioRequest(req, res, next) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!authToken) {
    logger.error('SECURITY: Twilio auth token not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Get the Twilio signature from request headers
  const twilioSignature = req.headers['x-twilio-signature'];

  if (!twilioSignature) {
    logger.warn('SECURITY: Missing Twilio signature in webhook request', {
      ip: req.ip,
      path: req.path
    });
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Get the full URL (Twilio uses the full URL to compute signature)
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const url = `${protocol}://${host}${req.originalUrl}`;

  // Validate the request
  const isValid = twilio.validateRequest(
    authToken,
    twilioSignature,
    url,
    req.body
  );

  if (!isValid) {
    logger.warn('SECURITY: Invalid Twilio signature', {
      ip: req.ip,
      path: req.path,
      url: url
    });
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Signature is valid, proceed
  next();
}

/**
 * Middleware wrapper that can be disabled in development
 * In production, always validates. In dev, can be disabled via env var.
 */
function validateTwilioRequestMiddleware(req, res, next) {
  // In development, allow skipping verification if explicitly set
  if (process.env.NODE_ENV === 'development' && process.env.SKIP_TWILIO_VERIFICATION === 'true') {
    logger.warn('DEV MODE: Skipping Twilio signature verification');
    return next();
  }

  return validateTwilioRequest(req, res, next);
}

module.exports = {
  validateTwilioRequest,
  validateTwilioRequestMiddleware
};
