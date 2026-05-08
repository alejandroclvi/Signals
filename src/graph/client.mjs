import "../lib/env.mjs";

const URL = process.env.NEO4J_URL || "http://localhost:7474";
const DB = process.env.NEO4J_DATABASE || "neo4j";
const USER = process.env.NEO4J_USERNAME || "neo4j";
const PASS = process.env.NEO4J_PASSWORD;

const ENDPOINT = `${URL}/db/${DB}/query/v2`;
const AUTH = "Basic " + Buffer.from(`${USER}:${PASS}`).toString("base64");

export function isGraphConfigured() {
  return Boolean(PASS);
}

export async function cypher(statement, parameters = {}) {
  if (!isGraphConfigured()) {
    throw new Error("Neo4j not configured — set NEO4J_PASSWORD in .env");
  }
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: AUTH },
    body: JSON.stringify({ statement, parameters }),
  });
  if (!res.ok) throw new Error(`Neo4j HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return rowsFromResponse(json);
}

function rowsFromResponse(json) {
  const fields = json?.data?.fields || [];
  const values = json?.data?.values || [];
  return values.map(row => Object.fromEntries(fields.map((f, i) => [f, row[i]])));
}

export async function pingGraph() {
  try {
    const r = await cypher("RETURN 1 AS ok");
    return r[0]?.ok === 1;
  } catch {
    return false;
  }
}
