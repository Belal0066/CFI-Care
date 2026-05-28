const {
  getFromCache,
  setInCache,
  deleteFromCache,
  invalidatePatientCache,
} = require("../../middleware/cacheHelper");
const redisClient = require("../../redisClient");

jest.mock("../../redisClient");

describe("Cache Helper", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getFromCache", () => {
    it("should return cached data if key exists", async () => {
      const testData = { id: "patient-001", name: "John Doe" };
      redisClient.get.mockResolvedValueOnce(JSON.stringify(testData));

      const result = await getFromCache("patient:patient-001");

      expect(result).toEqual(testData);
      expect(redisClient.get).toHaveBeenCalledWith("patient:patient-001");
    });

    it("should return null if key does not exist", async () => {
      redisClient.get.mockResolvedValueOnce(null);

      const result = await getFromCache("patient:nonexistent");

      expect(result).toBeNull();
    });

    it("should handle cache errors gracefully", async () => {
      redisClient.get.mockRejectedValueOnce(new Error("Redis error"));

      const result = await getFromCache("patient:patient-001");

      expect(result).toBeNull();
    });
  });

  describe("setInCache", () => {
    it("should set data in cache with default TTL", async () => {
      const testData = { id: "patient-001", name: "John Doe" };
      redisClient.set.mockResolvedValueOnce("OK");

      const result = await setInCache("patient:patient-001", testData);

      expect(result).toBe(true);
      expect(redisClient.set).toHaveBeenCalledWith(
        "patient:patient-001",
        JSON.stringify(testData),
        { EX: 60 },
      );
    });

    it("should set data in cache with custom TTL", async () => {
      const testData = { id: "patient-001" };
      redisClient.set.mockResolvedValueOnce("OK");

      await setInCache("patient:patient-001", testData, 3600);

      expect(redisClient.set).toHaveBeenCalledWith(
        "patient:patient-001",
        JSON.stringify(testData),
        { EX: 3600 },
      );
    });

    it("should handle cache set errors gracefully", async () => {
      redisClient.set.mockRejectedValueOnce(new Error("Redis error"));

      const result = await setInCache("patient:patient-001", {});

      expect(result).toBe(false);
    });
  });

  describe("deleteFromCache", () => {
    it("should delete key from cache and return count", async () => {
      redisClient.del.mockResolvedValueOnce(1);

      const result = await deleteFromCache("patient:patient-001");

      expect(result).toBe(1);
      expect(redisClient.del).toHaveBeenCalledWith("patient:patient-001");
    });

    it("should return 0 if key does not exist", async () => {
      redisClient.del.mockResolvedValueOnce(0);

      const result = await deleteFromCache("patient:nonexistent");

      expect(result).toBe(0);
    });
  });

  describe("invalidatePatientCache", () => {
    it("should invalidate patient-related cache patterns", async () => {
      // invalidatePatientCache calls deleteByPattern which uses scanIterator
      let callCount = 0;
      redisClient.scanIterator.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return (async function* () { yield ["patient:patient-001"]; })();
        }
        return (async function* () {})();
      });
      redisClient.del.mockResolvedValue(1);

      const total = await invalidatePatientCache("patient-001");

      expect(redisClient.scanIterator).toHaveBeenCalled();
      expect(redisClient.del).toHaveBeenCalledWith(["patient:patient-001"]);
      expect(total).toBeGreaterThanOrEqual(1);
    });
  });
});
