const auditRedisClient = require('./redisAuditCli');

// Audit logging for security-critical events :D


const LOG_EXPIRY = 90 * 24 * 60 * 60; // 90 days 


//  {string} eventType : Type of event (LOGIN_SUCCESS, LOGIN_FAILURE, REGISTER, LOGOUT, LOGOUT_ALL)
//   {Object} req : Express request object
//   {Object} metadata : Additional event metadata (userId, email, reason, etc.)
//  


async function logAuthEvent(eventType, req, metadata = {}) {
    try {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            eventType,
            ip: req.ip || req.connection?.remoteAddress,
            userAgent: req.get('user-agent'),
            requestId: req._id,
            ...metadata
        };

        const logKey = `audit:auth:${eventType.toLowerCase()}`;
        const score = Date.now();
        const value = JSON.stringify(logEntry);

        await auditRedisClient.zAdd(logKey, [{ score, value }]);

        await auditRedisClient.expire(logKey, LOG_EXPIRY);

        console.log(`[AUDIT] ${eventType}:`, {
            timestamp,
            ip: logEntry.ip,
            userId: metadata.userId || metadata.email || 'unknown',
            requestId: req._id
        });

    } catch (error) {
        console.error('[AUDIT] Failed to log auth event:', error.message);
    }
}


//    {string} eventType : Type of event to retrieve
//    {number} limit : Maximum number of logs to retrieve (default 100)
//    {Array} Array of log entries


async function getRecentLogs(eventType, limit = 100) {
    try {
        const logKey = `audit:auth:${eventType.toLowerCase()}`;

        const logs = await auditRedisClient.zRange(logKey, 0, limit - 1, { REV: true });

        return logs.map(log => JSON.parse(log));
    } catch (error) {
        console.error('[AUDIT] Failed to retrieve logs:', error.message);
        return [];
    }
}



//   {string} userId : User ID or email
//   {number} limit : Maximum number of logs to retrieve
//   {Array} Array of log entries for the user

async function getUserLogs(userId, limit = 50) {
    try {
        const eventTypes = ['login_success', 'login_failure', 'register', 'logout', 'logout_all'];
        const allLogs = [];

        for (const eventType of eventTypes) {
            const logKey = `audit:auth:${eventType}`;
            const logs = await auditRedisClient.zRange(logKey, 0, -1, { REV: true });

            const userLogs = logs
                .map(log => JSON.parse(log))
                .filter(log => log.userId === userId || log.email === userId);

            allLogs.push(...userLogs);
        }

        // sort
        return allLogs
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, limit);

    } catch (error) {
        console.error('[AUDIT] Failed to retrieve user logs:', error.message);
        return [];
    }
}

module.exports = {
    logAuthEvent,
    getRecentLogs,
    getUserLogs
};
