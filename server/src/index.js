const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const { onSocketConnection } = require("../ws/socket");
const { setIO } = require("../io");

const app = express();
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Set the io instance for other modules to use
setIO(io);

// Set up routes after io is created
const courtsRouter = require("../routes/courts");
app.use("/courts", courtsRouter);

io.on("connection", onSocketConnection);

server.listen(8080, () => console.log("API on :8080 (using Supabase REST API)"));
