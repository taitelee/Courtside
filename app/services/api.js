const API = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8080";

console.log("API URL:", API);
console.log("Environment:", process.env.EXPO_PUBLIC_API_URL);

export async function getQueue(courtId) {
  console.log("Getting queue for court:", courtId);
  const encodedCourtId = encodeURIComponent(courtId);
  const res = await fetch(`${API}/courts/${encodedCourtId}/queue`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json(); // { queue, version }
}
export async function joinQueue(courtId, entryId, display_name) {
  console.log("Joining queue:", { courtId, entryId, display_name, entryIdType: typeof entryId });
  const encodedCourtId = encodeURIComponent(courtId);
  const res = await fetch(`${API}/courts/${encodedCourtId}/join`, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ entryId, display_name })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
export async function leaveQueue(courtId, entryId) {
  console.log("Leaving queue:", { courtId, entryId });
  const encodedCourtId = encodeURIComponent(courtId);
  const res = await fetch(`${API}/courts/${encodedCourtId}/leave`, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ entryId })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
