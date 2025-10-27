import { io, Socket } from "socket.io-client";
let socket = null;

export function getSocket() {
  const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8080";
  console.log("Socket connecting to:", API_URL);
  if (!socket) {
    socket = io(API_URL, { 
      transports: ["websocket"],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });
    
    // Add connection debugging
    socket.on("connect", () => {
      console.log("Socket connected successfully to:", API_URL);
    });
    
    socket.on("connect_error", (error) => {
      console.log("Socket connection error:", error);
    });
    
    socket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
    });
  }
  return socket;
}
