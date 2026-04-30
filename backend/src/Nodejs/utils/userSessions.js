const redisClient = require('./redisCli');

const SESSION_PREFIX = 'sess:';

async function addSessionForUser(userId, sessionId) {
  if (!userId || !sessionId) return;
  await redisClient.sAdd(userSessionsKey(userId), sessionId);
}

async function removeSessionForUser(userId, sessionId) {
  if (!userId || !sessionId) return;
  await redisClient.sRem(userSessionsKey(userId), sessionId);
}

async function getSessionsForUser(userId) {
  if (!userId) return [];
  const sessions = await redisClient.sMembers(userSessionsKey(userId));
  return sessions || [];
}

async function clearAllSessionsForUser(userId) {
  if (!userId) return;
  await redisClient.del(userSessionsKey(userId));
}

async function destroySessionById(sessionId) {
  if (!sessionId) return;
  await redisClient.del(`${SESSION_PREFIX}${sessionId}`);
}

function userSessionsKey(userId) {
  return `user:sessions:${userId}`;
}

module.exports = {
  addSessionForUser,
  removeSessionForUser,
  getSessionsForUser,
  clearAllSessionsForUser,
  destroySessionById,
};
