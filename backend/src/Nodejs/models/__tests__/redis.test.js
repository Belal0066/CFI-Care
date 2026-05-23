const redis = require("redis");
const {
  setInCache,
  getFromCache,
  deleteFromCache,
} = require("../../middleware/cacheHelper");

describe("Redis Cache Integration", () => {
  let redisClient;

  beforeAll(async () => {
    redisClient = redis.createClient({
      url: process.env.REDIS_URL_PATIENTS,
    });

    await redisClient.connect();
  });

  afterAll(async () => {
    await redisClient.quit();
  });

  beforeEach(async () => {
    // Clear all keys before each test
    const keys = await redisClient.keys("test:*");
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  });

  it("should set and retrieve value from Redis", async () => {
    const testKey = "test:patient:001";
    const testValue = { id: "001", name: "John Doe" };

    await redisClient.set(testKey, JSON.stringify(testValue));
    const result = await redisClient.get(testKey);

    expect(JSON.parse(result)).toEqual(testValue);
  });

  it("should set value with TTL", async () => {
    const testKey = "test:ttl:001";
    const testValue = { data: "test" };

    await redisClient.setEx(testKey, 1, JSON.stringify(testValue));
    const ttl = await redisClient.ttl(testKey);

    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(1);
  });

  it("should delete value from Redis", async () => {
    const testKey = "test:delete:001";
    await redisClient.set(testKey, "value");

    let result = await redisClient.get(testKey);
    expect(result).toBe("value");

    await redisClient.del(testKey);
    result = await redisClient.get(testKey);

    expect(result).toBeNull();
  });

  it("should handle key expiration", async () => {
    const testKey = "test:expire:001";
    await redisClient.setEx(testKey, 1, "value");

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const result = await redisClient.get(testKey);
    expect(result).toBeNull();
  });

  it("should support multiple data types", async () => {
    // String
    await redisClient.set("test:string", "value");
    const stringValue = await redisClient.get("test:string");
    expect(stringValue).toBe("value");

    // List
    await redisClient.rPush("test:list", ["item1", "item2", "item3"]);
    const listValue = await redisClient.lRange("test:list", 0, -1);
    expect(listValue).toEqual(["item1", "item2", "item3"]);

    // Set
    await redisClient.sAdd("test:set", ["member1", "member2"]);
    const setMembers = await redisClient.sMembers("test:set");
    expect(setMembers).toContain("member1");
  });
});
