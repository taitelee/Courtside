import { io } from "../index";
const room = (id) => `court:${id}`;

export function broadcastQueueSync(courtId, queue, version) {
  io.to(room(courtId)).emit("queue.update", { type: "queue.sync", courtId, queue, version });
}
