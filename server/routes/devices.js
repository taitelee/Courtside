// server/routes/devices.js
const express = require("express");
const router = express.Router();
const { registerPushToken } = require("../db/queries");

router.post("/register-push-token", async (req, res) => {
  try {
    const { deviceId, expoToken } = req.body;
    console.log("Received push token registration:", { deviceId, expoToken });
    if (!deviceId || !expoToken) {
      return res.status(400).json({ error: "Missing deviceId or expoToken" });
    }

    // Upsert into Supabase table
    await registerPushToken(deviceId, expoToken);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Error saving push token:", err);
    res.status(500).json({ error: "Failed to save push token" });
  }
});

module.exports = router;
