const {createClient} = require('redis');
const REDIS_URL = process.env.Redis_URL ;
console.log('Connecting to Redis at', REDIS_URL);
const redisClient = createClient({ url: REDIS_URL });

redisClient.on('error', (err) => console.error('Redis Client Error', err));


redisClient.connect().then(() => console.log('Redis client connected')).catch((error)=>{console.error('Redis connection error', error)});
module.exports = redisClient;