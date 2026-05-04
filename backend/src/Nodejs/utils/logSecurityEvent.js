const auditRedisClient = require('./redisAuditCli');

const LOG_EXPIRY = 90 * 24 * 60 * 60; // 90 days

/**
 * @param {string} namespace - consent, access, policy
 * @param {string} eventType  
 * @param {Object} req - express request object (for ip, userAgent, requestId)
 * @param {Object} metadata  
 */
async function logSecurityEvent(namespace, eventType, req, metadata = {}) {
    try {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            eventType,
            namespace,
            ip: req?.ip || req?.connection?.remoteAddress || 'unknown',
            userAgent: req?.get?.('user-agent') || 'unknown',
            requestId: req?._id || 'system',
            ...metadata
        };

        const logKey = `audit:${namespace}:${eventType.toLowerCase()}`;
        const score = Date.now();
        const value = JSON.stringify(logEntry);

        await auditRedisClient.zAdd(logKey, [{ score, value }]);
        await auditRedisClient.expire(logKey, LOG_EXPIRY);

        console.log(`[SECURITY-AUDIT] ${namespace}:${eventType}`, {
            timestamp,
            actorType:metadata.actorType || 'N/A',
            patientId: metadata.patientId || 'N/A',
            requesterID: metadata.requesterId || metadata.email || 'system',
            action: req?.method || 'N/A',
            resource: metadata.resourceType || 'N/A',
            // grantId: metadata.grantId || 'N/A',
            reason: metadata.reason || 'N/A',
            // ip: logEntry.ip,
            // requestId: logEntry.requestId
        });

    } catch (error) {
        console.error(`[SECURITY-AUDIT] Failed to log ${namespace}:${eventType}:`, error.message);
    }
}

/**
 * by event/name
 * @param {string} namespace 
 * @param {string} eventType 
 * @param {number} limit 
 * @returns {Array} 
 */
async function getSecurityEventLogs(namespace, eventType, limit = 100) {
    try {
        const logKey = `audit:${namespace}:${eventType.toLowerCase()}`;
        // zRange returns oldest first, so reverse the range to get newest
        const logs = await auditRedisClient.zRange(logKey, 0, limit - 1, { REV: true });
        return logs.map(log => JSON.parse(log));
        // const entries = await auditRedisClient.zRange(logKey, -limit, -1, 'WITHSCORES');
        
        // const logs = [];
        // for (let i = 0; i < entries.length; i += 2) {
        //     logs.push(JSON.parse(entries[i]));
        // }
        // return logs.reverse(); 
    } catch (error) {
        console.error(`[SECURITY-AUDIT] Failed to retrieve logs:`, error.message);
        return [];
    }
}

/**
 * Patient across events
 * @param {string} patientId 
 * @param {string} namespace - default: access
 * @returns {Array} 
 */
async function getPatientAuditTrail(patientId, namespace = 'access') {
    try {
        const eventTypes = [
            'consent_grant_valid',    
            'consent_grant_invalid',  
            'consent_grant_not_found',
            'access_denied',          
            'grant_issued',
            'grant_revoked',
            'consent_approved'
        ];

        const allLogs = [];
        for (const eventType of eventTypes) {
            const logKey = `audit:${namespace}:${eventType}`;
            const entries = await auditRedisClient.zRange(logKey, 0, -1);
            
            for (const entry of entries) {
                const log = JSON.parse(entry);
                if (log.patientId === patientId) {
                    allLogs.push(log);
                }
            }
        }
        
        return allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (error) {
        console.error(`[SECURITY-AUDIT] Failed to retrieve patient audit trail:`, error.message);
        return [];
    }
}

module.exports = {
    logSecurityEvent,
    getSecurityEventLogs,
    getPatientAuditTrail
};
