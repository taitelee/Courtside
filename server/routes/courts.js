import { Router } from "express";
import { getQueue, joinTx, leaveTx, advanceTx } from "../db/queries";
import { broadcastQueueSync } from "../services/broadcast";

const r = Router();

r.get("/:id/queue", async (req, res) => {
  const { id } = req.params;
  const data = await getQueue(id);         // { queue, version }
  res.json(data);
});

r.post("/:id/join", async (req, res) => {
  const { id } = req.params;
  const { entryId, display_name } = req.body; // entryId = client uuid
  const { queue, version, entry } = await joinTx(id, entryId, display_name);
  broadcastQueueSync(id, queue, version);
  res.json({ entry, queue, version });
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

export default r;
