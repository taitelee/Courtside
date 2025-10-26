const { getIO } = require("../io");
const room = (id) => `court:${id}`;

function broadcastQueueSync(courtId, queue, version) {
  const io = getIO();
  console.log("Broadcasting queue sync", { courtId, queueLength: queue.length, version });
  if (io) {
    io.to(room(courtId)).emit("queue.update", { type: "queue.sync", courtId, queue, version });
  }
}

module.exports = { broadcastQueueSync };
