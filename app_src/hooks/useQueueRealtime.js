import { useEffect, useRef } from "react";
import { getSocket } from "../services/realtime";

export function useQueueRealtime(courtId, onSync) {
  useEffect(() => {
    if (!courtId) {
      console.log("useQueueRealtime: No courtId, skipping subscription");
      return; // Don't subscribe if no courtId
    }
    
    console.log("useQueueRealtime: Subscribing to courtId:", courtId);
    const s = getSocket();
    
    // Add connection debugging
    s.on("connect", () => {
      console.log("Socket connected, subscribing to court:", courtId);
      s.emit("subscribe", { courtId });
    });
    
    s.on("disconnect", () => {
      console.log("Socket disconnected");
    });
    
    // If already connected, subscribe immediately
    if (s.connected) {
      console.log("Socket already connected, subscribing immediately");
      s.emit("subscribe", { courtId });
    }

    const handler = (evt) => {
      console.log("useQueueRealtime: Received event:", evt);
      if (evt.type !== "queue.sync" || evt.courtId !== courtId) {
        console.log("useQueueRealtime: Event filtered out - type:", evt.type, "courtId:", evt.courtId, "expected:", courtId);
        return;
      }
      console.log("useQueueRealtime: Processing queue.sync", evt);
      onSync(evt.queue, evt.version);
    };
    
    s.on("queue.update", handler);
    
    return () => { 
      console.log("useQueueRealtime: Cleaning up subscription for courtId:", courtId);
      s.emit("unsubscribe", { courtId }); 
      s.off("queue.update", handler); 
    };
  }, [courtId, onSync]);
}
