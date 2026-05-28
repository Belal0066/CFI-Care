const { Client } = require("pg");

describe("Database Connection", () => {
  let client;

  beforeAll(async () => {
    client = new Client({
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
      ssl:
        process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
    });

    try {
      await client.connect();
    } catch (error) {
      console.error("Failed to connect to test database:", error);
    }
  });

  afterAll(async () => {
    if (client) {
      await client.end();
    }
  });

  it("should successfully connect to database", async () => {
    const result = await client.query("SELECT NOW()");
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it("should query encounter_nodes table", async () => {
    const result = await client.query(
      `SELECT table_name FROM information_schema.tables
      WHERE table_name = 'encounter_nodes'`,
    );
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it("should query node_relations table", async () => {
    const result = await client.query(
      `SELECT table_name FROM information_schema.tables
      WHERE table_name = 'node_relations'`,
    );
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it("should verify encounter_nodes table has required columns", async () => {
    const result = await client.query(
      `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'encounter_nodes'
      AND column_name IN ('encounter_fhir_id', 'patient_id', 'category', 'event_date')`,
    );
    expect(result.rows.length).toBe(4);
  });
});
