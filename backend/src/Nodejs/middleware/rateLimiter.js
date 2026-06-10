const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis').default;
const redisClient = require('../utils/redisCli');

// brute force login prevention
const loginLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: 'rl:login:',
  }),
  windowMs: 10 * 60 * 1000, // 10 mins
//   max: 5, 
    max: 100,   //for dev
  message: {
    error: 'Too many login attempts from this IP, please try again after 10 minutes',
    retryAfter: '10 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

// Registration rate limiter 
const registerLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: 'rl:register:',
  }),
  windowMs: 60 * 60 * 1000, // 1 hour
//   max: 3, 
    max: 100,   //for dev
  message: {
    error: 'Too many accounts created from this IP, please try again after an hour',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});


// Logout rate limiter
const logoutLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: 'rl:login:',
  }),
  windowMs: 10 * 60 * 1000, // 10 mins
//   max: 5, 
    max: 100,   //for dev
  message: {
    error: 'Too many logout attempts from this IP, please try again after 10 minutes',
    retryAfter: '10 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

// General API rate limiter 
const generalLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: 'rl:api:',
  }),
  windowMs: 10 * 60 * 1000, // 10 minutes
//   max: 100, 
    max: 1000,   //for dev
  message: {
    error: 'Too many requests from this IP, please try again later',
    retryAfter: '10 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  loginLimiter,
  registerLimiter,
  logoutLimiter,
  generalLimiter,
};
