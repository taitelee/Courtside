const { Router } = require("express");
const { getQueue, joinTx, leaveTx, advanceTx, getCourtInfo, getPlayingTeams, removePlayingTeam, extendPlayTime, joinSlot } = require("../db/queries");
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

r.get("/:id/playing", async (req, res) => {
  const { id } = req.params;
  const courtId = decodeURIComponent(id);
  try {
    const playingTeams = await getPlayingTeams(courtId);
    res.json({ playingTeams });
  } catch (error) {
    console.error("Error getting playing teams:", error);
    res.status(500).json({ error: error.message });
  }
});

r.post("/:id/remove-team", async (req, res) => {
  const { id } = req.params;
  const { entryId } = req.body;
  const courtId = decodeURIComponent(id);
  
  try {
    const { queue, version } = await removePlayingTeam(courtId, entryId);
    broadcastQueueSync(courtId, queue, version);
    res.json({ queue, version });
  } catch (error) {
    console.error("Error removing team:", error);
    res.status(500).json({ error: error.message });
  }
});

r.post("/:id/extend", async (req, res) => {
  const { id } = req.params;
  const { entryId } = req.body;
  const courtId = decodeURIComponent(id);
  
  try {
    const playingTeams = await extendPlayTime(courtId, entryId);
    const courtInfo = await getCourtInfo(courtId);
    const queue = await getQueue(courtId);
    broadcastQueueSync(courtId, queue.queue, courtInfo.version);
    res.json({ playingTeams, version: courtInfo.version });
  } catch (error) {
    console.error("Error extending play time:", error);
    res.status(500).json({ error: error.message });
  }
});

r.post("/:id/join-slot", async (req, res) => {
  const { id } = req.params;
  const { slotIndex, entryId, display_name } = req.body;
  const courtId = decodeURIComponent(id);
  
  try {
    const { slots, gameStartTime, queue, version } = await joinSlot(courtId, slotIndex, entryId, display_name);
    const courtInfo = await getCourtInfo(courtId); // Get updated court info for version
    broadcastQueueSync(courtId, queue, courtInfo.version);
    res.json({ slots, gameStartTime, queue, version: courtInfo.version });
  } catch (error) {
    console.error("Error joining slot:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = r;
