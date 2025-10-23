const { getIO } = require("../io");
const room = (id) => `court:${id}`;

function broadcastQueueSync(courtId, queue, version) {
  const io = getIO();
  // console.log("HELLO FROM BROADCAST");
  // console.log("io object:", io);
  if (io) {
    // console.log("Broadcasting queue.sync", { courtId, version });
    io.to(room(courtId)).emit("queue.update", { type: "queue.sync", courtId, queue, version });
  }
}

module.exports = { broadcastQueueSync };
