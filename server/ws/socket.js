import { Socket } from "socket.io";

const room = (id) => `court:${id}`;

export function onSocketConnection(socket) {
  socket.on("subscribe", ({ courtId }) => socket.join(room(courtId)));
  socket.on("unsubscribe", ({ courtId }) => socket.leave(room(courtId)));
}
