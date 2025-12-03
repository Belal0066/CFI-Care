const { Client } = require("pg");

const client = new Client({
  user: "adminuser",
  host: "localhost",
  database: "fhir_db",
  password: "1174",
  port: 5432,
});

async function testGraphData() {
  try {
    await client.connect();

    const patientId = 101;

    // 1. Get Nodes
    const nodesRes = await client.query(
      `SELECT node_id, title, to_char(event_date, 'YYYY-MM-DD') as date, category 
             FROM timeline_nodes 
             WHERE patient_id = $1 
             ORDER BY event_date ASC`,
      [patientId]
    );

    // 2. Get Edges
    const edgesRes = await client.query(
      `SELECT source_node_id, target_node_id 
             FROM node_edges 
             JOIN timeline_nodes ON node_edges.source_node_id = timeline_nodes.node_id 
             WHERE timeline_nodes.patient_id = $1`,
      [patientId]
    );

    console.log("--- NODES (The Bubbles) ---");
    console.table(nodesRes.rows);

    console.log("\n--- EDGES (The Lines) ---");
    console.table(edgesRes.rows);

    console.log("\n--- VISUALIZATION LOGIC CHECK ---");
    // // Check if Node 3 correctly points to both 4 and 5
    // const splitNode = edgesRes.rows.filter((e) => e.source_node_id === 3);
    // if (splitNode.length > 1) {
    //   console.log(
    //     `✅ SUCCESS: Node 3 branches into ${
    //       splitNode.length
    //     } paths (IDs: ${splitNode.map((e) => e.target_node_id).join(", ")})`
    //   );
    // } else {
    //   console.log("❌ FAIL: Branching logic not found.");
    // }
    let splitNode;
    for (edge of edgesRes.rows) {
      splitNode = edgesRes.rows.filter(
        (e) => e.source_node_id === edge.source_node_id
      );
      if (splitNode.length > 1) {
        console.log(
          `✅ SUCCESS: Node ${edge.source_node_id} branches into ${
            splitNode.length
          } paths (IDs: ${splitNode.map((e) => e.target_node_id)})`
        );
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

testGraphData();
