import { io, Socket } from "socket.io-client";
let socket = null;

export function getSocket() {
  const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8080";
  if (!socket) socket = io(API_URL, { transports: ["websocket"] });
  return socket;
}
