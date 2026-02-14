const redisClient = require("../redisClient");

/**
 * Toon Format Nodes Cache Helper
 * Dedicated caching layer for graph nodes in toon format
 * Provides optimized caching for individual nodes and node collections
 */

// Cache expiration times for toon nodes (in seconds)
const TOON_CACHE_EXPIRATION = {
  SINGLE_NODE: 86400, // 24 hours for individual nodes
  NODE_COLLECTION: 86400, // 24 hours for node collections
  NODE_METADATA: 86400, // 24 hours for node metadata
};

/**
 * Get a single toon-formatted node from cache
 * @param {string} nodeId - Node ID
 * @returns {Promise<object|null>} Cached toon node or null
 */
async function getToonNode(nodeId) {
  try {
    const cacheKey = `toon:node:${nodeId}`;
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
      console.log(`[TOON CACHE HIT] ${cacheKey}`);
      return JSON.parse(cachedData);
    }
    console.log(`[TOON CACHE MISS] ${cacheKey}`);
    return null;
  } catch (error) {
    console.error(
      `[TOON CACHE ERROR] Failed to get toon node ${nodeId}:`,
      error.message,
    );
    return null;
  }
}

/**
 * Set a single toon-formatted node in cache
 * @param {string} nodeId - Node ID
 * @param {object} nodeData - Toon node data
 * @param {number} expirationTime - Expiration time in seconds (optional)
 * @returns {Promise<boolean>} Success status
 */
async function setToonNode(
  nodeId,
  nodeData,
  expirationTime = TOON_CACHE_EXPIRATION.SINGLE_NODE,
) {
  try {
    const cacheKey = `toon:node:${nodeId}`;
    await redisClient.set(cacheKey, JSON.stringify(nodeData), {
      EX: expirationTime,
    });
    console.log(`[TOON CACHE SET] ${cacheKey} (TTL: ${expirationTime}s)`);
    return true;
  } catch (error) {
    console.error(
      `[TOON CACHE ERROR] Failed to set toon node ${nodeId}:`,
      error.message,
    );
    return false;
  }
}

/**
 * Get all toon nodes for a patient from cache
 * @param {string} patientId - Patient ID
 * @param {object} options - Query options (filters, pagination, etc)
 * @returns {Promise<object|null>} Cached toon nodes collection or null
 */
async function getToonNodes(patientId, options = {}) {
  try {
    // Create a deterministic hash of options for cache key
    const optionsKey = JSON.stringify(options || {});
    const cacheKey = `toon:nodes:patient:${patientId}:${optionsKey}`;
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
      console.log(`[TOON CACHE HIT] ${cacheKey}`);
      return JSON.parse(cachedData);
    }
    console.log(`[TOON CACHE MISS] ${cacheKey}`);
    return null;
  } catch (error) {
    console.error(
      `[TOON CACHE ERROR] Failed to get toon nodes for patient ${patientId}:`,
      error.message,
    );
    return null;
  }
}

/**
 * Set toon nodes collection in cache
 * @param {string} patientId - Patient ID
 * @param {object} nodesData - Toon nodes collection data
 * @param {object} options - Query options used to generate the data
 * @param {number} expirationTime - Expiration time in seconds (optional)
 * @returns {Promise<boolean>} Success status
 */
async function setToonNodes(
  patientId,
  nodesData,
  options = {},
  expirationTime = TOON_CACHE_EXPIRATION.NODE_COLLECTION,
) {
  try {
    const optionsKey = JSON.stringify(options || {});
    const cacheKey = `toon:nodes:patient:${patientId}:${optionsKey}`;
    await redisClient.set(cacheKey, JSON.stringify(nodesData), {
      EX: expirationTime,
    });
    console.log(
      `[TOON CACHE SET] ${cacheKey} (TTL: ${expirationTime}s, ${nodesData.nodes?.length || 0} nodes)`,
    );
    return true;
  } catch (error) {
    console.error(
      `[TOON CACHE ERROR] Failed to set toon nodes for patient ${patientId}:`,
      error.message,
    );
    return false;
  }
}

/**
 * Get toon node metadata from cache
 * @param {string} nodeId - Node ID
 * @returns {Promise<object|null>} Cached node metadata or null
 */
async function getToonNodeMetadata(nodeId) {
  try {
    const cacheKey = `toon:node:metadata:${nodeId}`;
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
      console.log(`[TOON CACHE HIT] ${cacheKey}`);
      return JSON.parse(cachedData);
    }
    console.log(`[TOON CACHE MISS] ${cacheKey}`);
    return null;
  } catch (error) {
    console.error(
      `[TOON CACHE ERROR] Failed to get toon node metadata ${nodeId}:`,
      error.message,
    );
    return null;
  }
}

/**
 * Set toon node metadata in cache
 * @param {string} nodeId - Node ID
 * @param {object} metadata - Node metadata
 * @param {number} expirationTime - Expiration time in seconds (optional)
 * @returns {Promise<boolean>} Success status
 */
async function setToonNodeMetadata(
  nodeId,
  metadata,
  expirationTime = TOON_CACHE_EXPIRATION.NODE_METADATA,
) {
  try {
    const cacheKey = `toon:node:metadata:${nodeId}`;
    await redisClient.set(cacheKey, JSON.stringify(metadata), {
      EX: expirationTime,
    });
    console.log(`[TOON CACHE SET] ${cacheKey} (TTL: ${expirationTime}s)`);
    return true;
  } catch (error) {
    console.error(
      `[TOON CACHE ERROR] Failed to set toon node metadata ${nodeId}:`,
      error.message,
    );
    return false;
  }
}

/**
 * Invalidate all toon caches for a patient
 * @param {string} patientId - Patient ID
 * @returns {Promise<number>} Number of keys deleted
 */
async function invalidateToonCacheForPatient(patientId) {
  try {
    const patterns = [
      `toon:node:*:patient:${patientId}`,
      `toon:nodes:patient:${patientId}:*`,
      `toon:node:metadata:*:patient:${patientId}`,
    ];

    let totalDeleted = 0;
    for (const pattern of patterns) {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        const deleted = await redisClient.del(keys);
        totalDeleted += deleted;
      }
    }

    console.log(
      `[TOON CACHE INVALIDATION] Invalidated ${totalDeleted} toon cache entries for patient ${patientId}`,
    );
    return totalDeleted;
  } catch (error) {
    console.error(
      `[TOON CACHE ERROR] Failed to invalidate toon cache for patient ${patientId}:`,
      error.message,
    );
    return 0;
  }
}

/**
 * Invalidate toon cache for a specific node
 * @param {string} nodeId - Node ID
 * @param {string} patientId - Patient ID (optional, for more targeted invalidation)
 * @returns {Promise<number>} Number of keys deleted
 */
async function invalidateToonCacheForNode(nodeId, patientId = null) {
  try {
    const keysToDelete = [
      `toon:node:${nodeId}`,
      `toon:node:metadata:${nodeId}`,
    ];

    // If patientId is provided, also invalidate the patient's node collections
    if (patientId) {
      const collectionKeys = await redisClient.keys(
        `toon:nodes:patient:${patientId}:*`,
      );
      keysToDelete.push(...collectionKeys);
    }

    const deleted = await redisClient.del(keysToDelete);
    console.log(
      `[TOON CACHE INVALIDATION] Invalidated ${deleted} toon cache entries for node ${nodeId}`,
    );
    return deleted;
  } catch (error) {
    console.error(
      `[TOON CACHE ERROR] Failed to invalidate toon cache for node ${nodeId}:`,
      error.message,
    );
    return 0;
  }
}

/**
 * Clear all toon-related caches
 * @returns {Promise<void>}
 */
async function flushToonCache() {
  try {
    const keys = await redisClient.keys("toon:*");
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
    console.log(`[TOON CACHE] Cleared ${keys.length} toon cache entries`);
  } catch (error) {
    console.error(
      `[TOON CACHE ERROR] Failed to flush toon cache:`,
      error.message,
    );
  }
}

/**
 * Get toon cache statistics
 * @returns {Promise<object>} Toon cache stats
 */
async function getToonCacheStats() {
  try {
    const keys = await redisClient.keys("toon:*");
    return {
      totalToonKeys: keys.length,
      singleNodeKeys: (await redisClient.keys("toon:node:*")).length,
      nodeCollectionKeys: (await redisClient.keys("toon:nodes:*")).length,
      nodeMetadataKeys: (await redisClient.keys("toon:node:metadata:*")).length,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(
      `[TOON CACHE ERROR] Failed to get toon cache stats:`,
      error.message,
    );
    return { error: error.message };
  }
}

module.exports = {
  getToonNode,
  setToonNode,
  getToonNodes,
  setToonNodes,
  getToonNodeMetadata,
  setToonNodeMetadata,
  invalidateToonCacheForPatient,
  invalidateToonCacheForNode,
  flushToonCache,
  getToonCacheStats,
  TOON_CACHE_EXPIRATION,
};
