const { Router } = require("express");
const { getQueue, joinTx, leaveTx, advanceTx, getCourtInfo } = require("../db/queries");
const { broadcastQueueSync } = require("../services/broadcast");

const r = Router();

r.get("/:id/queue", async (req, res) => {
  const { id } = req.params;
  const courtId = decodeURIComponent(id);
  const data = await getQueue(courtId);         // { queue, version }
  res.json(data);
});

r.get("/:id/info", async (req, res) => {
  const { id } = req.params;
  const courtId = decodeURIComponent(id);
  const courtInfo = await getCourtInfo(courtId);
  res.json(courtInfo);
});

r.post("/:id/join", async (req, res) => {
  const { id } = req.params;
  const { entryId, display_name } = req.body; // entryId = client uuid
  const requestId = Math.random().toString(36).substr(2, 9); // Generate unique request ID
  
  // Decode the court ID from URL
  const courtId = decodeURIComponent(id);
  
  console.log("=== JOIN REQUEST RECEIVED ===");
  console.log("Request ID:", requestId);
  console.log("Time:", new Date().toISOString());
  console.log("Court ID (raw):", id);
  console.log("Court ID (decoded):", courtId);
  console.log("Entry ID:", entryId);
  console.log("Display Name:", display_name);
  console.log("Entry ID Type:", typeof entryId);
  console.log("Request Headers:", req.headers);
  console.log("Request Body:", req.body);
  console.log("=============================");
  
  try {
    const { queue, version, entry } = await joinTx(courtId, entryId, display_name, requestId);
    broadcastQueueSync(courtId, queue, version);
    console.log(`[${requestId}] Join successful, returning:`, { entry, queueLength: queue.length, version });
    res.json({ entry, queue, version });
  } catch (error) {
    console.error(`[${requestId}] Join error:`, error.message);
    console.error(`[${requestId}] Full error:`, error);
    res.status(500).json({ error: error.message });
  }
});

r.post("/:id/leave", async (req, res) => {
  const { id } = req.params;
  const { entryId } = req.body;
  
  // Decode the court ID from URL
  const courtId = decodeURIComponent(id);

  console.log("=== LEAVE REQUEST RECEIVED ===");
  console.log("Time:", new Date().toISOString());
  console.log("Court ID (raw):", id);
  console.log("Court ID (decoded):", courtId);
  console.log("Entry ID:", entryId);
  console.log("Entry ID Type:", typeof entryId);
  console.log("Request Headers:", req.headers);
  console.log("Request Body:", req.body);
  console.log("=============================");

  try {
    const { queue, version, entry } = await leaveTx(courtId, entryId);
    broadcastQueueSync(courtId, queue, version);
    console.log("Leave successful, returning:", { entry, queueLength: queue.length, version });
    res.json({ entry, queue });
  } catch (error) {
    console.error("Leave error:", error.message);
    console.error("Full error:", error);
    res.status(500).json({ error: error.message });
  }
});

r.post("/:id/advance", async (req, res) => {
  const { id } = req.params;
  const courtId = decodeURIComponent(id);
  const { queue, version } = await advanceTx(courtId);
  broadcastQueueSync(courtId, queue, version);
  res.json({ queue, version });
});

module.exports = r;
