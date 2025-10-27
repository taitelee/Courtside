const { Socket } = require("socket.io");

const room = (id) => `court:${id}`;

function onSocketConnection(socket) {
  console.log("New socket connection:", socket.id);
  
  socket.on("subscribe", ({ courtId }) => {
    const roomName = room(courtId);
    console.log("Socket", socket.id, "subscribing to room:", roomName);
    socket.join(roomName);
    
    // Log room membership
    const roomClients = socket.adapter.rooms.get(roomName);
    const clientCount = roomClients ? roomClients.size : 0;
    console.log("Room", roomName, "now has", clientCount, "clients");
  });
  
  socket.on("unsubscribe", ({ courtId }) => {
    const roomName = room(courtId);
    console.log("Socket", socket.id, "unsubscribing from room:", roomName);
    socket.leave(roomName);
  });
  
  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
  });
}

module.exports = { onSocketConnection };
