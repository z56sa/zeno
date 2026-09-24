const rateLimit = require('express-rate-limit');

/**
 * Standard API Rate Limiter
 * 120 requests per minute per IP for general dashboard browsing and stats
 */
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Too Many Requests: تم تجاوز حد الطلبات المسموح به. يرجى الانتظار قليلاً.'
    }
});

/**
 * Sensitive Actions Rate Limiter
 * 20 requests per minute for operations like resetting data, auto-setup, clear warnings, panel creation
 */
const sensitiveActionLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Too Many Requests: عدد كبير من العمليات الحساسة في وقت قصير. يرجى المحاولة بعد قليل.'
    }
});

/**
 * AI Chat Limiter
 * 15 requests per minute for AI interactions
 */
const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Too Many Requests: تم تجاوز حد رسائل الذكاء الاصطناعي للدقيقة. انتظر قليلاً.'
    }
});

module.exports = {
    apiLimiter,
    sensitiveActionLimiter,
    aiLimiter
};
