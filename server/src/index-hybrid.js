const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const app = express();
app.use(express.json());

// In-memory storage that matches your Supabase schema
let courts = {
  'demo': { id: 'demo', name: 'Court #1', is_open: true, version: 0 }
};

let queueEntries = new Map(); // court_id -> array of entries
let versionCounters = { 'demo': 0 };

// Mock routes that match your Supabase schema
app.get("/courts/:id/queue", (req, res) => {
  const { id } = req.params;
  console.log(`GET /courts/${id}/queue`);
  
  const queue = queueEntries.get(id) || [];
  const version = versionCounters[id] || 0;
  
  res.json({ queue, version });
});

app.post("/courts/:id/join", (req, res) => {
  const { id } = req.params;
  const { entryId, display_name } = req.body;
  console.log(`POST /courts/${id}/join`, { entryId, display_name });
  
  if (!courts[id]) {
    return res.status(404).json({ error: 'Court not found' });
  }
  
  // Get current queue for this court
  const currentQueue = queueEntries.get(id) || [];
  
  // Create new entry matching your Supabase schema
  const newEntry = {
    id: entryId,
    court_id: id,
    display_name: display_name,
    position: currentQueue.length + 1,
    status: 'active',
    joined_at: new Date().toISOString()
  };
  
  // Add to queue
  currentQueue.push(newEntry);
  queueEntries.set(id, currentQueue);
  
  // Increment version
  versionCounters[id] = (versionCounters[id] || 0) + 1;
  
  // Broadcast update
  io.to(`court:${id}`).emit("queue.update", { 
    type: "queue.sync", 
    courtId: id, 
    queue: currentQueue, 
    version: versionCounters[id] 
  });
  
  res.json({ 
    entry: newEntry, 
    queue: currentQueue, 
    version: versionCounters[id] 
  });
});

app.post("/courts/:id/leave", (req, res) => {
  const { id } = req.params;
  const { entryId } = req.body;
  console.log(`POST /courts/${id}/leave`, { entryId });
  
  const currentQueue = queueEntries.get(id) || [];
  const updatedQueue = currentQueue.filter(entry => entry.id !== entryId);
  
  // Recalculate positions
  updatedQueue.forEach((entry, index) => {
    entry.position = index + 1;
  });
  
  queueEntries.set(id, updatedQueue);
  versionCounters[id] = (versionCounters[id] || 0) + 1;
  
  // Broadcast update
  io.to(`court:${id}`).emit("queue.update", { 
    type: "queue.sync", 
    courtId: id, 
    queue: updatedQueue, 
    version: versionCounters[id] 
  });
  
  res.json({ queue: updatedQueue, version: versionCounters[id] });
});

app.post("/courts/:id/advance", (req, res) => {
  const { id } = req.params;
  console.log(`POST /courts/${id}/advance`);
  
  const currentQueue = queueEntries.get(id) || [];
  if (currentQueue.length > 0) {
    // Remove first person (they've been served)
    currentQueue.shift();
    
    // Recalculate positions
    currentQueue.forEach((entry, index) => {
      entry.position = index + 1;
    });
    
    queueEntries.set(id, currentQueue);
    versionCounters[id] = (versionCounters[id] || 0) + 1;
  }
  
  // Broadcast update
  io.to(`court:${id}`).emit("queue.update", { 
    type: "queue.sync", 
    courtId: id, 
    queue: currentQueue, 
    version: versionCounters[id] 
  });
  
  res.json({ queue: currentQueue, version: versionCounters[id] });
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

server.listen(8080, () => {
  console.log("Hybrid API server running on :8080");
  console.log("Using in-memory storage that matches your Supabase schema");
  console.log("Court 'demo' is available with initial data");
});
