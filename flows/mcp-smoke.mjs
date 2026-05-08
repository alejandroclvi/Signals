/**
 * Smoke test for the mcp connector — calls neo4j-cypher's read tool through the
 * locally-configured stdio MCP server.
 */

export default {
  name: "mcp-smoke",
  description: "Verify mcp connector by counting nodes via neo4j-cypher MCP",
  inputs: {},
  steps: [
    {
      name: "count-nodes",
      mcp: "neo4j-cypher.read_neo4j_cypher",
      args: { query: "MATCH (n) RETURN count(n) AS total LIMIT 1" },
      capture: "node_count",
    },
  ],
};
