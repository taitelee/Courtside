// server/src/db/queries.js
const { Pool } = require("pg");
const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
  // Force IPv4 to avoid IPv6 connectivity issues in WSL
  family: 4,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000
});
module.exports = { pool, getQueue, joinTx, leaveTx, advanceTx };

async function getQueue(courtId) {
  const { rows: queue } = await pool.query(
      `SELECT id, display_name, position, joined_at
      FROM queue_entries WHERE court_id=$1
      ORDER BY position`,
    [courtId]
  );
  const { rows: v } = await pool.query(
    `SELECT version FROM courts WHERE id=$1`,
    [courtId]
  );
  return { queue, version: v[0]?.version ?? 0 };
}

async function joinTx(courtId, entryId, displayName) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const nextPos = await client.query(
        `SELECT COALESCE(MAX(position),0)+1 AS pos
        FROM queue_entries WHERE court_id=$1`,
      [courtId]
    );
    const position = nextPos.rows[0].pos;

    await client.query(
        `INSERT INTO queue_entries (id, court_id, display_name, position, joined_at)
        VALUES ($1,$2,$3,$4,NOW())`,
      [entryId, courtId, displayName, position]
    );

    const version = await bumpVersion(client, courtId);
    const { queue } = await getQueueWithin(client, courtId);

    await client.query("COMMIT");
    return {
      entry: { id: entryId, display_name: displayName, position },
      queue,
      version,
    };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function leaveTx(courtId, entryId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM queue_entries WHERE id=$1 AND court_id=$2`,
      [entryId, courtId]
    );

    // compact positions
    await client.query(
      `
      WITH ordered AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY joined_at) AS new_pos
        FROM queue_entries WHERE court_id=$1
      )
      UPDATE queue_entries q SET position=o.new_pos
      FROM ordered o WHERE q.id=o.id`,
      [courtId]
    );

    const version = await bumpVersion(client, courtId);
    const { queue } = await getQueueWithin(client, courtId);
    await client.query("COMMIT");
    return { queue, version };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function advanceTx(courtId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `
      DELETE FROM queue_entries
      WHERE court_id=$1 AND id = (
        SELECT id FROM queue_entries
        WHERE court_id=$1
        ORDER BY position LIMIT 1
      )
    `,
      [courtId]
    );

    await client.query(
      `
      WITH ordered AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY joined_at) AS new_pos
        FROM queue_entries WHERE court_id=$1
      )
      UPDATE queue_entries q SET position=o.new_pos
      FROM ordered o WHERE q.id=o.id`,
      [courtId]
    );

    const version = await bumpVersion(client, courtId);
    const { queue } = await getQueueWithin(client, courtId);
    await client.query("COMMIT");
    return { queue, version };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// helpers
async function bumpVersion(client, courtId) {
  await client.query(
    `UPDATE courts SET version = COALESCE(version,0)+1 WHERE id=$1`,
    [courtId]
  );
  const { rows } = await client.query(
    `SELECT version FROM courts WHERE id=$1`,
    [courtId]
  );
  return rows[0].version;
}
async function getQueueWithin(client, courtId) {
  const { rows } = await client.query(
      `SELECT id, display_name, position, joined_at
      FROM queue_entries WHERE court_id=$1
      ORDER BY position`,
    [courtId]
  );
  return { queue: rows };
}
