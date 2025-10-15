// server/src/db/queries.ts
import { Pool } from "pg";
export const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false }
});

export async function getQueue(courtId) {
  const { rows: queue } = await pool.query(
      `SELECT id, display_name, position, status
      FROM queue_entries WHERE court_id=$1 AND status='active'
      ORDER BY position`,
    [courtId]
  );
  const { rows: v } = await pool.query(
    `SELECT version FROM courts WHERE id=$1`,
    [courtId]
  );
  return { queue, version: v[0]?.version ?? 0 };
}

export async function joinTx(courtId, entryId, displayName) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const nextPos = await client.query(
        `SELECT COALESCE(MAX(position),0)+1 AS pos
        FROM queue_entries WHERE court_id=$1 AND status='active' FOR UPDATE`,
      [courtId]
    );
    const position = nextPos.rows[0].pos;

    await client.query(
        `INSERT INTO queue_entries (id, court_id, display_name, status, position)
        VALUES ($1,$2,$3,'active',$4)`,
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

export async function leaveTx(courtId, entryId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE queue_entries SET status='left' WHERE id=$1 AND court_id=$2`,
      [entryId, courtId]
    );

    // compact positions
    await client.query(
      `
      WITH ordered AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY joined_at) AS new_pos
        FROM queue_entries WHERE court_id=$1 AND status='active'
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

export async function advanceTx(courtId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `
      WITH head AS (
        SELECT id FROM queue_entries
        WHERE court_id=$1 AND status='active'
        ORDER BY position LIMIT 1 FOR UPDATE
      )
      UPDATE queue_entries SET status='served'
      WHERE id IN (SELECT id FROM head)
    `,
      [courtId]
    );

    await client.query(
      `
      WITH ordered AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY joined_at) AS new_pos
        FROM queue_entries WHERE court_id=$1 AND status='active'
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
      `SELECT id, display_name, position, status
      FROM queue_entries WHERE court_id=$1 AND status='active'
      ORDER BY position`,
    [courtId]
  );
  return { queue: rows };
}
