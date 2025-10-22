const { Router } = require("express");
const { getQueue, joinTx, leaveTx, advanceTx } = require("../db/queries");
const { broadcastQueueSync } = require("../services/broadcast");

const r = Router();

r.get("/:id/queue", async (req, res) => {
  const { id } = req.params;
  const data = await getQueue(id);         // { queue, version }
  res.json(data);
});

r.post("/:id/join", async (req, res) => {
  const { id } = req.params;
  const { entryId, display_name } = req.body; // entryId = client uuid
  
  console.log("=== JOIN REQUEST RECEIVED ===");
  console.log("Time:", new Date().toISOString());
  console.log("Court ID:", id);
  console.log("Entry ID:", entryId);
  console.log("Display Name:", display_name);
  console.log("Entry ID Type:", typeof entryId);
  console.log("Request Headers:", req.headers);
  console.log("Request Body:", req.body);
  console.log("=============================");
  
  try {
    const { queue, version, entry } = await joinTx(id, entryId, display_name);
    broadcastQueueSync(id, queue, version);
    console.log("Join successful, returning:", { entry, queueLength: queue.length, version });
    res.json({ entry, queue, version });
  } catch (error) {
    console.error("Join error:", error.message);
    console.error("Full error:", error);
    res.status(500).json({ error: error.message });
  }
});

r.post("/:id/leave", async (req, res) => {
  const { id } = req.params;
  const { entryId } = req.body;
  const { queue, version } = await leaveTx(id, entryId);
  broadcastQueueSync(id, queue, version);
  res.json({ queue, version });
});

r.post("/:id/advance", async (req, res) => {
  const { id } = req.params;
  const { queue, version } = await advanceTx(id);
  broadcastQueueSync(id, queue, version);
  res.json({ queue, version });
});

module.exports = r;
