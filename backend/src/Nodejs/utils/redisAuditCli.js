const { createClient } = require('redis');

const auditRedisClient = createClient({
    url: process.env.REDIS_AUDIT_URL ,
    socket: {
        reconnectStrategy: (retries) => {
            if (retries > 10) {
                console.error('Redis Audit: Max reconnection attempts reached');
                return new Error('Max reconnection attempts reached');
            }
            return Math.min(retries * 100, 3000);
        }
    }
});

auditRedisClient.on('error', (err) => {
    console.error('Redis Audit Client Error:', err);
});

auditRedisClient.on('connect', () => {
    console.log('Connected to Redis Audit instance');
});

auditRedisClient.on('reconnecting', () => {
    console.log('Reconnecting to Redis Audit...');
});


(async () => {
    try {
        await auditRedisClient.connect();
        console.log('Redis Audit client connected successfully');
    } catch (err) {
        console.error('Failed to connect to Redis Audit:', err);
    }
})();

module.exports = auditRedisClient;
