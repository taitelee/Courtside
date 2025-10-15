const API = process.env.EXPO_PUBLIC_API_URL;

export async function getQueue(courtId) {
  const res = await fetch(`${API}/courts/${courtId}/queue`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json(); // { queue, version }
}
export async function joinQueue(courtId, entryId, display_name) {
  const res = await fetch(`${API}/courts/${courtId}/join`, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ entryId, display_name })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
export async function leaveQueue(courtId, entryId) {
  const res = await fetch(`${API}/courts/${courtId}/leave`, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ entryId })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
