const { Socket } = require("socket.io");

const room = (id) => `court:${id}`;

function onSocketConnection(socket) {
  socket.on("subscribe", ({ courtId }) => socket.join(room(courtId)));
  socket.on("unsubscribe", ({ courtId }) => socket.leave(room(courtId)));
}

module.exports = { onSocketConnection };
