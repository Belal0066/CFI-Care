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

  it("should query timeline_nodes table", async () => {
    const result = await client.query(
      `SELECT table_name FROM information_schema.tables 
      WHERE table_name = 'timeline_nodes'`,
    );
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it("should query node_edges table", async () => {
    const result = await client.query(
      `SELECT table_name FROM information_schema.tables 
      WHERE table_name = 'node_edges'`,
    );
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it("should insert and retrieve timeline node", async () => {
    const nodeId = "test-node-" + Date.now();
    const insertQuery = `
      INSERT INTO timeline_nodes (node_id, patient_id, title, event_date, category)
      VALUES ($1, $2, $3, $4, $5)
    `;

    await client.query(insertQuery, [
      nodeId,
      "test-patient",
      "Test Node",
      new Date(),
      "Test",
    ]);

    const selectQuery = `SELECT * FROM timeline_nodes WHERE node_id = $1`;
    const result = await client.query(selectQuery, [nodeId]);

    expect(result.rows.length).toBe(1);
    expect(result.rows[0].title).toBe("Test Node");

    // Cleanup
    await client.query(`DELETE FROM timeline_nodes WHERE node_id = $1`, [
      nodeId,
    ]);
  });
});
