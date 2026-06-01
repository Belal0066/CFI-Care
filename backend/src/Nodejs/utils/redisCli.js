const {createClient} = require('redis');
const REDIS_URL = process.env.REDIS_STORE_URL ;
console.log('Connecting to Redis at', REDIS_URL);
const redisClient = createClient({ url: REDIS_URL });

redisClient.on('error', (err) => console.error('Redis Client Error', err));


// redisClient.connect().then(() => console.log('Redis client connected')).catch((error)=>{console.error('Redis connection error', error)});
(async () => { try { await redisClient.connect(); } catch (e) { console.error('Redis connect failed', e); } })();

module.exports = redisClient;