import { useEffect, useRef } from "react";
import { getSocket } from "../services/realtime";

export function useQueueRealtime(courtId, onSync) {
  useEffect(() => {
    const s = getSocket();
    s.emit("subscribe", { courtId });

    const handler = (evt) => {
      if (evt.type !== "queue.sync" || evt.courtId !== courtId) return;
      console.log("Received queue.sync", evt);
      onSync(evt.queue, evt.version);
    };
    s.on("queue.update", handler);
    return () => { 
      s.emit("unsubscribe", { courtId }); 
      s.off("queue.update", handler); 
    };
  }, [courtId, onSync]);
}