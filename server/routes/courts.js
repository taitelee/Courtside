const { Router } = require("express");
const { getQueue, joinTx, leaveTx, advanceTx } = require("../db/queries");
const { broadcastQueueSync } = require("../services/broadcast");

const r = Router();

r.get("/:id/queue", async (req, res) => {
  const { id } = req.params;
  const courtId = decodeURIComponent(id);
  const data = await getQueue(courtId);         // { queue, version }
  res.json(data);
});

r.post("/:id/join", async (req, res) => {
  const { id } = req.params;
  const { entryId, display_name, device_id } = req.body; // entryId = client uuid
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
    const { queue, version, entry } = await joinTx(courtId, entryId, display_name, requestId, device_id);
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

r.post("/register-push-token", async (req, res) => {
  try {
    const { deviceId, expoToken } = req.body;
    console.log("Received push token registration:", { deviceId, expoToken });
    if (!deviceId || !expoToken) {
      return res.status(400).json({ error: "Missing deviceId or expoToken" });
    }

    // Upsert into Supabase table
    await registerPushToken(deviceId, expoToken);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Error saving push token:", err);
    res.status(500).json({ error: "Failed to save push token" });
  }
});

module.exports = r;
