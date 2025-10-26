require('dotenv').config();
const http = require("http");
const https = require("https");
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

// Test endpoint
app.get("/test", (req, res) => {
  const options = {
    hostname: 'phunvrocpkmmnnbfwwmw.supabase.co',
    path: '/rest/v1/courts?select=*',
    method: 'GET',
    headers: {
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBodW52cm9jcGttbW5uYmZ3d213Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDUwMjcwOCwiZXhwIjoyMDc2MDc4NzA4fQ.2iAwLDPm8msp5zRqrtVIuc4Q81y_sGQukaLrPUYiOtA',
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBodW52cm9jcGptbW5uYmZ3d213Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDUwMjcwOCwiZXhwIjoyMDc2MDc4NzA4fQ.2iAwLDPm8msp5zRqrtVIuc4Q81y_sGQukaLrPUYiOtA',
      'Content-Type': 'application/json'
    }
  };

  const request = https.request(options, (response) => {
    let data = '';
    response.on('data', (chunk) => {
      data += chunk;
    });
    response.on('end', () => {
      try {
        const jsonData = JSON.parse(data);
        res.json({ success: true, data: jsonData });
      } catch (error) {
        res.json({ success: false, error: error.message });
      }
    });
  });

  request.on('error', (error) => {
    res.json({ success: false, error: error.message });
  });

  request.end();
});

// Set up routes after io is created
const courtsRouter = require("../routes/courts");
app.use("/courts", courtsRouter);

io.on("connection", onSocketConnection);

server.listen(8080, () => console.log("API on :8080 (using Supabase REST API)"));