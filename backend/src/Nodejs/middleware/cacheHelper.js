const redisClient = require("../redisClient");

// Default cache expiration time in seconds (24 hours)
const DEFAULT_EXPIRATION = 86400;

// Cache expiration times for different resource types
const CACHE_EXPIRATION = {
  PATIENT: 86400, // 24 hours
  CONDITION: 86400, // 24 hours
  ENCOUNTER: 86400, // 24 hours
  PRACTITIONER: 86400, // 24 hours
  EOC: 86400, // 24 hours
  BINARY: 86400, // 24 hours
  MEDICATION_REQUEST: 86400, // 24 hours
  PROCEDURE: 86400, // 24 hours
  SEARCH: 86400, // 24 hours
  DEFAULT: 86400, // 24 hours - default for new resources
  SHORT: 1800, // 30 minutes - for frequently changing data like slots
};

/**
 * Get data from cache if it exists, otherwise return null
 * @param {string} key - Cache key
 * @returns {Promise<object|null>} Cached data or null
 */
async function getFromCache(key) {
  try {
    const cachedData = await redisClient.get(key);
    if (cachedData) {
      console.log(`[CACHE HIT] ${key}`);
      return JSON.parse(cachedData);
    }
    console.log(`[CACHE MISS] ${key}`);
    return null;
  } catch (error) {
    console.error(
      `[CACHE ERROR] Failed to get cache for ${key}:`,
      error.message,
    );
    return null; // Return null on error, allowing fallback to API
  }
}

/**
 * Set data in cache with expiration
 * @param {string} key - Cache key
 * @param {object} data - Data to cache
 * @param {number} expirationTime - Expiration time in seconds (optional)
 * @returns {Promise<boolean>} Success status
 */
async function setInCache(key, data, expirationTime = DEFAULT_EXPIRATION) {
  try {
    await redisClient.set(key, JSON.stringify(data), {
      EX: expirationTime,
    });
    console.log(`[CACHE SET] ${key} (TTL: ${expirationTime}s)`);
    return true;
  } catch (error) {
    console.error(
      `[CACHE ERROR] Failed to set cache for ${key}:`,
      error.message,
    );
    return false; // Non-critical error, continue execution
  }
}

/**
 * Delete specific cache key(s)
 * @param {string|string[]} keys - Single key or array of keys to delete
 * @returns {Promise<number>} Number of keys deleted
 */
async function deleteFromCache(keys) {
  try {
    const keysArray = Array.isArray(keys) ? keys : [keys];
    const result = await redisClient.del(keysArray);
    console.log(`[CACHE DELETE] Deleted ${result} key(s)`);
    return result;
  } catch (error) {
    console.error(`[CACHE ERROR] Failed to delete cache:`, error.message);
    return 0;
  }
}

/**
 * Delete multiple cache keys by pattern
 * @param {string} pattern - Pattern for keys (e.g., "patient:*")
 * @returns {Promise<number>} Number of keys deleted
 */
async function deleteByPattern(pattern) {
  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length === 0) {
      console.log(`[CACHE PATTERN] No keys found for pattern: ${pattern}`);
      return 0;
    }
    const result = await redisClient.del(keys);
    console.log(
      `[CACHE PATTERN DELETE] Deleted ${result} keys for pattern: ${pattern}`,
    );
    return result;
  } catch (error) {
    console.error(`[CACHE ERROR] Failed to delete by pattern:`, error.message);
    return 0;
  }
}

/**
 * Invalidate patient-related caches (when patient is updated)
 * @param {string} patientId - Patient ID
 * @returns {Promise<number>} Number of keys deleted
 */
async function invalidatePatientCache(patientId) {
  const patterns = [
    `patient:${patientId}`,
    `patient:${patientId}:*`,
    `conditions:patient:${patientId}`,
    `encounters:patient:${patientId}`,
    `eoc:patient:${patientId}`,
    `historyGraph:patient:${patientId}`,
    `historyGraph:patient:${patientId}:*`,
    `medicationRequests:patient:${patientId}`,
    `medicationRequests:patient:${patientId}:*`,
    `procedures:patient:${patientId}`,
    `procedures:patient:${patientId}:*`,
  ];

  let totalDeleted = 0;
  for (const pattern of patterns) {
    totalDeleted += await deleteByPattern(pattern);
  }

  console.log(
    `[CACHE INVALIDATION] Invalidated ${totalDeleted} cache entries for patient ${patientId}`,
  );
  return totalDeleted;
}

/**
 * Invalidate condition-related caches (when condition is updated)
 * @param {string} conditionId - Condition ID
 * @param {string} patientId - Patient ID (optional)
 * @returns {Promise<number>} Number of keys deleted
 */
async function invalidateConditionCache(conditionId, patientId = null) {
  const keysToDelete = [`condition:${conditionId}`];

  if (patientId) {
    keysToDelete.push(`conditions:patient:${patientId}`);
  }

  const deleted = await deleteFromCache(keysToDelete);
  console.log(
    `[CACHE INVALIDATION] Invalidated ${deleted} cache entries for condition ${conditionId}`,
  );
  return deleted;
}

/**
 * Invalidate encounter-related caches (when encounter is updated)
 * @param {string} encounterId - Encounter ID
 * @param {string} patientId - Patient ID (optional)
 * @returns {Promise<number>} Number of keys deleted
 */
async function invalidateEncounterCache(encounterId, patientId = null) {
  const keysToDelete = [
    `encounter:${encounterId}`,
    `encounter:${encounterId}:everything`,
  ];

  if (patientId) {
    keysToDelete.push(`encounters:patient:${patientId}`);
  }

  const deleted = await deleteFromCache(keysToDelete);
  console.log(
    `[CACHE INVALIDATION] Invalidated ${deleted} cache entries for encounter ${encounterId}`,
  );
  return deleted;
}

/**
 * Invalidate EOC-related caches (when EOC is updated)
 * @param {string} eocId - Episode of Care ID
 * @param {string} patientId - Patient ID (optional)
 * @returns {Promise<number>} Number of keys deleted
 */
async function invalidateEOCCache(eocId, patientId = null) {
  const keysToDelete = [`eoc:${eocId}`];

  if (patientId) {
    keysToDelete.push(`eoc:patient:${patientId}`);
  }

  const deleted = await deleteFromCache(keysToDelete);
  console.log(
    `[CACHE INVALIDATION] Invalidated ${deleted} cache entries for EOC ${eocId}`,
  );
  return deleted;
}

/**
 * Invalidate practitioner-related caches (when practitioner is updated)
 * @param {string} practitionerId - Practitioner ID
 * @returns {Promise<number>} Number of keys deleted
 */
async function invalidatePractitionerCache(practitionerId) {
  const deleted = await deleteFromCache(`practitioner:${practitionerId}`);
  console.log(
    `[CACHE INVALIDATION] Invalidated ${deleted} cache entries for practitioner ${practitionerId}`,
  );
  return deleted;
}

/**
 * Clear all caches (use sparingly!)
 * @returns {Promise<void>}
 */
async function flushAllCache() {
  try {
    await redisClient.flushDb();
    console.log("[CACHE] All caches have been cleared");
  } catch (error) {
    console.error("[CACHE ERROR] Failed to flush cache:", error.message);
  }
}

/**
 * Get cache statistics
 * @returns {Promise<object>} Cache stats
 */
async function getCacheStats() {
  try {
    const keys = await redisClient.keys("*");
    const info = await redisClient.info("memory");

    return {
      totalKeys: keys.length,
      memoryInfo: info,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("[CACHE ERROR] Failed to get cache stats:", error.message);
    return { error: error.message };
  }
}

module.exports = {
  getFromCache,
  setInCache,
  deleteFromCache,
  deleteByPattern,
  invalidatePatientCache,
  invalidateConditionCache,
  invalidateEncounterCache,
  invalidateEOCCache,
  invalidatePractitionerCache,
  flushAllCache,
  getCacheStats,
  CACHE_EXPIRATION,
  DEFAULT_EXPIRATION,
};
