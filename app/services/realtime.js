import { io, Socket } from "socket.io-client";
let socket = null;

export function getSocket() {
  if (!socket) socket = io(process.env.EXPO_PUBLIC_API_URL, { transports: ["websocket"] });
  return socket;
}
