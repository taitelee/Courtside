import http from "http";
import express from "express";
import { Server } from "socket.io";
import courtsRouter from "../routes/courts.js";
import { onSocketConnection } from "../ws/socket.js";
import { setIO } from "../io.js";

const app = express();
app.use(express.json());
app.use("/courts", courtsRouter);

const server = http.createServer(app);
export const io = new Server(server, { cors: { origin: "*" } });

setIO(io);
io.on("connection", onSocketConnection);

server.listen(8080, () => console.log("API on :8080"));