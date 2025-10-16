const { getIO } = require("../io");
const room = (id) => `court:${id}`;

function broadcastQueueSync(courtId, queue, version) {
  const io = getIO();
  if (io) {
    io.to(room(courtId)).emit("queue.update", { type: "queue.sync", courtId, queue, version });
  }
}

module.exports = { broadcastQueueSync };
