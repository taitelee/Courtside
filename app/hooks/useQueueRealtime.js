import { useEffect, useRef } from "react";
import { getSocket } from "../services/realtime";

export function useQueueRealtime(courtId, onSync) {
  const latestVersion = useRef(0);
  useEffect(() => {
    const s = getSocket();
    s.emit("subscribe", { courtId });

    const handler = (evt) => {
      if (evt.type !== "queue.sync" || evt.courtId !== courtId) return;
      if (evt.version > latestVersion.current) {
        latestVersion.current = evt.version;
        onSync(evt.queue, evt.version);
      }
    };
    s.on("queue.update", handler);
    return () => { s.emit("unsubscribe", { courtId }); s.off("queue.update", handler); };
  }, [courtId, onSync]);
}
