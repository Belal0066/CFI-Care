const { createClient } = require('redis');

const OTPRedisClient = createClient({
    url: process.env.REDIS_HANDSHAKES_URL ,
    socket: {
        reconnectStrategy: (retries) => {
            if (retries > 10) {
                console.error('Redis OTP: Max reconnection attempts reached');
                return new Error('Max reconnection attempts reached');
            }
            return Math.min(retries * 100, 3000);
        }
    }
});

OTPRedisClient.on('error', (err) => {
    console.error('Redis OTP Client Error:', err);
});

OTPRedisClient.on('connect', () => {
    console.log('Connected to Redis OTP instance');
});

OTPRedisClient.on('reconnecting', () => {
    console.log('Reconnecting to Redis OTP...');
});


(async () => {
    try {
        await OTPRedisClient.connect();
        console.log('Redis OTP client connected successfully');
    } catch (err) {
        console.error('Failed to connect to Redis OTP:', err);
    }
})();

module.exports = OTPRedisClient;
