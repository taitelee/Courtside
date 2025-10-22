const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const app = express();
app.use(express.json());

// Mock routes without database
app.get("/courts/:id/queue", (req, res) => {
  const { id } = req.params;
  console.log(`GET /courts/${id}/queue`);
  res.json({ queue: [], version: 1 });
});

app.post("/courts/:id/join", (req, res) => {
  const { id } = req.params;
  const { entryId, display_name } = req.body;
  console.log(`POST /courts/${id}/join`, { entryId, display_name });
  
  // Mock response
  const mockEntry = { id: entryId, display_name, position: 1, status: 'active' };
  res.json({ 
    entry: mockEntry, 
    queue: [mockEntry], 
    version: 2 
  });
});

app.post("/courts/:id/leave", (req, res) => {
  const { id } = req.params;
  const { entryId } = req.body;
  console.log(`POST /courts/${id}/leave`, { entryId });
  
  res.json({ queue: [], version: 3 });
});

app.post("/courts/:id/advance", (req, res) => {
  const { id } = req.params;
  console.log(`POST /courts/${id}/advance`);
  
  res.json({ queue: [], version: 4 });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

io.on("connection", (socket) => {
  console.log("Client connected");
  socket.on("subscribe", ({ courtId }) => {
    console.log(`Client subscribed to court: ${courtId}`);
    socket.join(`court:${courtId}`);
  });
  socket.on("unsubscribe", ({ courtId }) => {
    console.log(`Client unsubscribed from court: ${courtId}`);
    socket.leave(`court:${courtId}`);
  });
});

server.listen(8080, () => console.log("Mock API server running on :8080"));
