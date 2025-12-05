const API = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8080";

console.log("API URL:", API);
console.log("Environment:", process.env.EXPO_PUBLIC_API_URL);

export async function getQueue(courtId) {
  console.log("Getting queue for court:", courtId, "Type:", typeof courtId);
  const courtIdString = typeof courtId === 'string' ? courtId : String(courtId);
  const encodedCourtId = encodeURIComponent(courtIdString);
  console.log("getQueue API call:", { courtIdString, encodedCourtId, url: `${API}/courts/${encodedCourtId}/queue` });
  const res = await fetch(`${API}/courts/${encodedCourtId}/queue`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json(); // { queue, version }
}
export async function joinQueue(courtId, entryId, display_name) {
  console.log("Joining queue:", { 
    courtId, 
    courtIdType: typeof courtId,
    entryId, 
    display_name, 
    entryIdType: typeof entryId 
  });
  
  // Ensure courtId is a string
  const courtIdString = typeof courtId === 'string' ? courtId : String(courtId);
  const encodedCourtId = encodeURIComponent(courtIdString);
  
  console.log("API call details:", {
    originalCourtId: courtId,
    courtIdString,
    encodedCourtId,
    url: `${API}/courts/${encodedCourtId}/join`
  });
  
  const res = await fetch(`${API}/courts/${encodedCourtId}/join`, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ entryId, display_name })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
export async function leaveQueue(courtId, entryId) {
  console.log("Leaving queue:", { courtId, entryId, courtIdType: typeof courtId });
  const courtIdString = typeof courtId === 'string' ? courtId : String(courtId);
  const encodedCourtId = encodeURIComponent(courtIdString);
  const res = await fetch(`${API}/courts/${encodedCourtId}/leave`, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ entryId })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getCourtInfo(courtId) {
  console.log("Getting court info for:", courtId, "Type:", typeof courtId);
  const courtIdString = typeof courtId === 'string' ? courtId : String(courtId);
  const encodedCourtId = encodeURIComponent(courtIdString);
  console.log("getCourtInfo API call:", { courtIdString, encodedCourtId, url: `${API}/courts/${encodedCourtId}/info` });
  const res = await fetch(`${API}/courts/${encodedCourtId}/info`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getPlayingTeams(courtId) {
  console.log("Getting playing teams for:", courtId);
  const courtIdString = typeof courtId === 'string' ? courtId : String(courtId);
  const encodedCourtId = encodeURIComponent(courtIdString);
  const res = await fetch(`${API}/courts/${encodedCourtId}/playing`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function removePlayingTeam(courtId, entryId) {
  console.log("Removing playing team:", { courtId, entryId });
  const courtIdString = typeof courtId === 'string' ? courtId : String(courtId);
  const encodedCourtId = encodeURIComponent(courtIdString);
  const res = await fetch(`${API}/courts/${encodedCourtId}/remove-team`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entryId })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function extendPlayTime(courtId, entryId) {
  console.log("Extending play time for:", { courtId, entryId });
  const courtIdString = typeof courtId === 'string' ? courtId : String(courtId);
  const encodedCourtId = encodeURIComponent(courtIdString);
  const res = await fetch(`${API}/courts/${encodedCourtId}/extend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entryId })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function joinSlot(courtId, slotIndex, entryId, display_name) {
  console.log("Joining slot:", { courtId, slotIndex, entryId, display_name });
  const courtIdString = typeof courtId === 'string' ? courtId : String(courtId);
  const encodedCourtId = encodeURIComponent(courtIdString);
  const res = await fetch(`${API}/courts/${encodedCourtId}/join-slot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slotIndex, entryId, display_name })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
