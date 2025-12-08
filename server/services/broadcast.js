const { getIO } = require("../io");
const room = (id) => `court:${id}`;

function broadcastQueueSync(courtId, queue, version) {
  const io = getIO();
  console.log("Broadcasting queue sync", { courtId, queueLength: queue.length, version });
  if (io) {
    const roomName = room(courtId);
    console.log("Broadcasting to room:", roomName);
    
    // Check how many clients are in the room
    const roomClients = io.sockets.adapter.rooms.get(roomName);
    const clientCount = roomClients ? roomClients.size : 0;
    console.log("Clients in room:", clientCount);
    
    io.to(roomName).emit("queue.update", { type: "queue.sync", courtId, queue, version });
    console.log("Broadcast sent successfully");
  } else {
    console.log("ERROR: IO instance not available for broadcasting");
  }
}

module.exports = { broadcastQueueSync };
