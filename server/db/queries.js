// server/src/db/queries.js
const https = require('https');
const http = require('http');

// In-memory join locks to prevent concurrent joins
const joinLocks = new Map();

// Supabase configuration
const SUPABASE_URL = 'https://phunvrocpkmmnnbfwwmw.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBodW52cm9jcGttbW5uYmZ3d213Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDUwMjcwOCwiZXhwIjoyMDc2MDc4NzA4fQ.2iAwLDPm8msp5zRqrtVIuc4Q81y_sGQukaLrPUYiOtA';

// Helper function to make Supabase API calls
async function supabaseRequest(endpoint, options = {}) {
  return new Promise((resolve, reject) => {
    const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
    const headers = {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...options.headers
    };

    const requestOptions = {
      method: options.method || 'GET',
      headers
    };

    const req = https.request(url, requestOptions, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        } else {
          console.error(`Supabase API error: ${res.statusCode} ${res.statusMessage}`);
          console.error('Error response:', data);
          reject(new Error(`Supabase API error: ${res.statusCode} ${res.statusMessage} - ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      console.error('Request error:', error);
      reject(error);
    });

    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

// Mock pool object for compatibility
const pool = {
  connect: () => Promise.resolve({
    query: () => Promise.resolve({ rows: [] }),
    release: () => {}
  })
};

async function getQueue(courtId) {
  try {
    console.log(`Getting queue for court: ${courtId}`);
    
    // URL encode the courtId for the API call
    const encodedCourtId = encodeURIComponent(courtId);
    
    // Get queue entries
    const queue = await supabaseRequest(`queue_entries?court_id=eq.${encodedCourtId}&order=position`);
    console.log('Queue entries:', queue);
    
    // Get court version
    const courts = await supabaseRequest(`courts?id=eq.${encodedCourtId}&select=version`);
    console.log('Courts data:', courts);
    const version = courts.length > 0 ? courts[0].version : 0;
    
    return { queue, version };
  } catch (error) {
    console.error('Error getting queue:', error);
    console.error('Error details:', error.message);
    return { queue: [], version: 0 };
  }
}

async function joinTx(courtId, entryId, displayName, requestId = 'unknown') {
  console.log(`[${requestId}] joinTx called with:`, { courtId, entryId, displayName, courtIdType: typeof courtId });
  
  // Ensure courtId is a string
  let courtIdString = courtId;
  if (typeof courtId === 'object' && courtId !== null) {
    courtIdString = courtId.data || courtId.url || courtId.courtId || JSON.stringify(courtId);
    console.log(`[${requestId}] Converted object courtId to string:`, courtIdString);
  } else if (typeof courtId !== 'string') {
    courtIdString = String(courtId);
    console.log(`[${requestId}] Converted non-string courtId to string:`, courtIdString);
  }
  
  // Create a unique lock key for this court
  const lockKey = `court_${courtIdString}`;
  
  // Wait for lock to be available and acquire it atomically
  while (joinLocks.has(lockKey)) {
    console.log(`[${requestId}] Join already in progress for court ${courtIdString}, waiting...`);
    await new Promise(resolve => setTimeout(resolve, 50)); // Wait 50ms before checking again
  }
  
  // Set the lock with a timestamp for timeout handling
  joinLocks.set(lockKey, { timestamp: Date.now(), courtId: courtIdString, entryId, requestId });
  console.log(`[${requestId}] Acquired join lock for court ${courtIdString}, entryId: ${entryId}`);
  
  // Set a timeout to automatically release the lock after 30 seconds
  const lockTimeout = setTimeout(() => {
    if (joinLocks.has(lockKey)) {
      console.log(`Join lock timeout for court ${courtId}, releasing lock`);
      joinLocks.delete(lockKey);
    }
  }, 30000);
  
  try {
    console.log(`[${requestId}] Joining queue: courtId=${courtIdString}, entryId=${entryId}, displayName=${displayName}`);

    // URL encode the courtId for the API call
    const encodedCourtId = encodeURIComponent(courtIdString);

    // First, ensure the court exists in the courts table
    const existingCourts = await supabaseRequest(`courts?id=eq.${encodedCourtId}`);
    if (existingCourts.length === 0) {
      console.log('Creating new court:', courtIdString);
      await supabaseRequest('courts', {
        method: 'POST',
        body: JSON.stringify({
          id: courtIdString,
          name: courtIdString,
          version: 1,
          playing_teams: [],
          gamestarttime: null
        })
      });
      console.log('Court created successfully');
    }

    // Get existing entries with a fresh query
    const existingEntries = await supabaseRequest(`queue_entries?court_id=eq.${encodedCourtId}&order=position`);
    console.log(`[${requestId}] Existing entries:`, existingEntries);
    
    // No device checking - allow multiple entries with same name

    // Check for duplicate entryId (race condition protection)
    const duplicateEntry = existingEntries.find(entry => entry.id === entryId);
    if (duplicateEntry) {
      console.log(`[${requestId}] Entry ID already exists, returning existing entry`);
      return {
        entry: { id: duplicateEntry.id, display_name: duplicateEntry.display_name, position: duplicateEntry.position },
        queue: existingEntries,
        version: 1
      };
    }

    const position = existingEntries.length + 1;

    // Insert new entry
    const newEntry = {
      id: entryId,
      court_id: courtIdString,
      display_name: displayName,
      position: position,
      joined_at: new Date().toISOString()
    };
    console.log(`[${requestId}] Inserting entry:`, newEntry);

    try {
      await supabaseRequest('queue_entries', {
        method: 'POST',
        body: JSON.stringify(newEntry)
      });
      console.log(`[${requestId}] Entry inserted successfully`);
    } catch (insertError) {
      // If insert fails due to duplicate key, check if entry was added by another process
      if (insertError.message && insertError.message.includes('duplicate key')) {
        console.log(`[${requestId}] Insert failed due to duplicate key, checking for existing entry`);
        const updatedEntries = await supabaseRequest(`queue_entries?court_id=eq.${encodedCourtId}&order=position`);
        const existingEntry = updatedEntries.find(entry => entry.id === entryId);
        if (existingEntry) {
          console.log(`[${requestId}] Entry was added by another process, returning existing entry`);
          return {
            entry: { id: existingEntry.id, display_name: existingEntry.display_name, position: existingEntry.position },
            queue: updatedEntries,
            version: 1
          };
        }
      }
      throw insertError;
    }

    // Get updated queue
    const queue = await supabaseRequest(`queue_entries?court_id=eq.${encodedCourtId}&order=position`);
    console.log(`[${requestId}] Updated queue:`, queue);

    // No auto-starting teams - users must manually click slots to join
    // This allows for the slot-based system where teams choose their slot

    // Update court version (use a simple incrementing number)
    const updatedCourtInfo = await getCourtInfo(courtIdString);
    await supabaseRequest(`courts?id=eq.${encodedCourtId}`, {
      method: 'PATCH',
      body: JSON.stringify({ version: (updatedCourtInfo.version || 0) + 1 })
    });
    console.log('Court version updated');

    console.log(`[${requestId}] Join completed successfully for entryId: ${entryId}`);
    return {
      entry: { id: entryId, display_name: displayName, position },
      queue,
      version: (updatedCourtInfo.version || 0) + 1
    };
  } catch (error) {
    console.error(`[${requestId}] Error joining queue:`, error);
    console.error(`[${requestId}] Error details:`, error.message);
    throw error;
  } finally {
    // Always release the lock and clear timeout
    clearTimeout(lockTimeout);
    joinLocks.delete(lockKey);
    console.log(`[${requestId}] Released join lock for court ${courtId}`);
  }
}

async function leaveTx(courtId, entryId) {
  try {
    console.log('leaveTx called with:', { courtId, entryId, courtIdType: typeof courtId });
    
    // Ensure courtId is a string
    let courtIdString = courtId;
    if (typeof courtId === 'object' && courtId !== null) {
      courtIdString = courtId.data || courtId.url || courtId.courtId || JSON.stringify(courtId);
      console.log('Converted object courtId to string:', courtIdString);
    } else if (typeof courtId !== 'string') {
      courtIdString = String(courtId);
      console.log('Converted non-string courtId to string:', courtIdString);
    }
    
    const encodedCourtId = encodeURIComponent(courtIdString);
    console.log('Encoded court ID:', encodedCourtId);
    
    // Delete the entry
    await supabaseRequest(`queue_entries?id=eq.${entryId}&court_id=eq.${encodedCourtId}`, {
      method: 'DELETE'
    });

    // Get remaining entries and reorder positions
    const remainingEntries = await supabaseRequest(`queue_entries?court_id=eq.${encodedCourtId}&order=joined_at`);
    
    // Update positions
    for (let i = 0; i < remainingEntries.length; i++) {
      await supabaseRequest(`queue_entries?id=eq.${remainingEntries[i].id}`, {
        method: 'PATCH',
        body: JSON.stringify({ position: i + 1 })
      });
    }

    // Update court version
    await supabaseRequest(`courts?id=eq.${encodedCourtId}`, {
      method: 'PATCH',
      body: JSON.stringify({ version: 1 })
    });

    // Get updated queue
    const queue = await supabaseRequest(`queue_entries?court_id=eq.${encodedCourtId}&order=position`);
    
    return { queue, version: 1 };
  } catch (error) {
    console.error('Error leaving queue:', error);
    throw error;
  }
}

async function advanceTx(courtId) {
  try {
    const encodedCourtId = encodeURIComponent(courtId);
    
    // Get current playing teams
    const courtInfo = await getCourtInfo(courtId);
    const currentPlaying = courtInfo.playing_teams || [];
    
    // Get first entry (lowest position)
    const firstEntry = await supabaseRequest(`queue_entries?court_id=eq.${encodedCourtId}&order=position&limit=1`);
    
    if (firstEntry.length > 0) {
      // Delete the first entry
      await supabaseRequest(`queue_entries?id=eq.${firstEntry[0].id}`, {
        method: 'DELETE'
      });
    }

    // Get remaining entries and reorder positions
    const remainingEntries = await supabaseRequest(`queue_entries?court_id=eq.${encodedCourtId}&order=joined_at`);
    
    // Update positions
    for (let i = 0; i < remainingEntries.length; i++) {
      await supabaseRequest(`queue_entries?id=eq.${remainingEntries[i].id}`, {
        method: 'PATCH',
        body: JSON.stringify({ position: i + 1 })
      });
    }
    
    // Only start teams when we have exactly 2 teams ready
    // If 0 teams playing and 2+ in queue, start 2 teams
    // If 1 team playing and 1+ in queue, start 1 team to make 2 total
    if (currentPlaying.length === 0 && remainingEntries.length >= 2) {
      const teamsToStart = remainingEntries.slice(0, 2).map(e => e.id);
      await startPlaying(courtId, teamsToStart);
    } else if (currentPlaying.length === 1 && remainingEntries.length >= 1) {
      const teamsToStart = remainingEntries.slice(0, 1).map(e => e.id);
      await startPlaying(courtId, teamsToStart);
    }

    // Update court version
    const updatedCourtInfo = await getCourtInfo(courtId);
    await supabaseRequest(`courts?id=eq.${encodedCourtId}`, {
      method: 'PATCH',
      body: JSON.stringify({ version: (updatedCourtInfo.version || 0) + 1 })
    });

    // Get updated queue
    const queue = await supabaseRequest(`queue_entries?court_id=eq.${encodedCourtId}&order=position`);
    
    return { queue, version: (updatedCourtInfo.version || 0) + 1 };
  } catch (error) {
    console.error('Error advancing queue:', error);
    throw error;
  }
}

async function getCourtInfo(courtId) {
  try {
    console.log(`Getting court info for: ${courtId}`);
    
    // URL encode the courtId for the API call
    const encodedCourtId = encodeURIComponent(courtId);
    
    // Get court information including playing_teams and gamestarttime (lowercase in DB)
    const courts = await supabaseRequest(`courts?id=eq.${encodedCourtId}&select=id,name,version,playing_teams,gamestarttime`);
    console.log('Court data:', courts);
    
    if (courts.length > 0) {
      const court = courts[0];
      // Ensure playing_teams is an array (handle null or invalid values)
      if (!court.playing_teams || !Array.isArray(court.playing_teams)) {
        court.playing_teams = [];
      }
      // Map lowercase DB column to camelCase for code consistency
      court.gameStartTime = court.gamestarttime || null;
      return court;
    } else {
      // Return default court info if not found
      return {
        id: courtId,
        name: courtId.split('court=')[1] || 'Court',
        version: 0,
        playing_teams: [],
        gameStartTime: null
      };
    }
  } catch (error) {
    console.error('Error getting court info:', error);
    // Return default court info on error
    return {
      id: courtId,
      name: courtId.split('court=')[1] || 'Court',
      version: 0,
      playing_teams: []
    };
  }
}

// Get currently playing teams with their play times
// Returns array of 2 slots (can be null/empty)
async function getPlayingTeams(courtId) {
  try {
    const courtInfo = await getCourtInfo(courtId);
    const playingTeams = courtInfo.playing_teams || [];
    const gameStartTime = courtInfo.gameStartTime || null;
    
    // Get full entry details for playing teams
    const encodedCourtId = encodeURIComponent(courtId);
    const allEntries = await supabaseRequest(`queue_entries?court_id=eq.${encodedCourtId}&order=position`);
    
    // Ensure we always return 2 slots
    const slots = [null, null];
    const queueEntryIds = new Set(allEntries.map(e => e.id));
    
    // playing_teams should be an array of 2 slots (with nulls preserved)
    // If it's a filtered array (old format), reconstruct based on slotIndex
    if (Array.isArray(playingTeams) && playingTeams.length > 0) {
      // Check if teams have slotIndex property (new format)
      const hasSlotIndex = playingTeams.some(team => team && team.slotIndex !== undefined);
      
      if (hasSlotIndex) {
        // New format: teams have slotIndex, reconstruct slots
        playingTeams.forEach((team, arrayIndex) => {
          if (team === null) {
            // Null slot preserved - in new format, array index = slot index
            if (arrayIndex < 2) {
              slots[arrayIndex] = null;
            }
          } else if (team && team.slotIndex !== undefined && team.slotIndex < 2) {
            // Only include teams that are still in the queue
            if (queueEntryIds.has(team.entryId)) {
              const entry = allEntries.find(e => e.id === team.entryId);
              slots[team.slotIndex] = {
                ...team,
                display_name: entry ? entry.display_name : 'Unknown',
                position: entry ? entry.position : null
              };
            } else {
              // Team is no longer in queue, slot should be null
              slots[team.slotIndex] = null;
            }
          }
        });
      } else {
        // Old format: assume teams are in order [slot0, slot1] or filtered
        // If length is 2, assume [slot0, slot1]
        // If length is 1, assume it's in slot 0 (migration case)
        playingTeams.forEach((team, index) => {
          if (team && index < 2) {
            // Only include teams that are still in the queue
            if (queueEntryIds.has(team.entryId)) {
              const entry = allEntries.find(e => e.id === team.entryId);
              slots[index] = {
                ...team,
                slotIndex: index,  // Add slotIndex for future
                display_name: entry ? entry.display_name : 'Unknown',
                position: entry ? entry.position : null
              };
            } else {
              // Team is no longer in queue, slot should be null
              slots[index] = null;
            }
          }
        });
      }
    }
    
    return { slots, gameStartTime };
  } catch (error) {
    console.error('Error getting playing teams:', error);
    return { slots: [null, null], gameStartTime: null };
  }
}

// Join a specific slot (0 or 1)
async function joinSlot(courtId, slotIndex, entryId, displayName) {
  try {
    const encodedCourtId = encodeURIComponent(courtId);
    
    // Validate slot index
    if (slotIndex !== 0 && slotIndex !== 1) {
      throw new Error('Invalid slot index. Must be 0 or 1');
    }
    
    // Get current court info
    const courtInfo = await getCourtInfo(courtId);
    const currentPlaying = courtInfo.playing_teams || [];
    const gameStartTime = courtInfo.gameStartTime || null;
    
    // Get current queue to validate teams in slots
    const existingEntries = await supabaseRequest(`queue_entries?court_id=eq.${encodedCourtId}&order=position`);
    const queueEntryIds = new Set(existingEntries.map(e => e.id));
    
    // Reconstruct slots array (handle both old format with filtered array and new format with nulls)
    // Use the same logic as getPlayingTeams for consistency
    const slots = [null, null];
    let currentSlotIndex = -1;
    
    if (Array.isArray(currentPlaying) && currentPlaying.length > 0) {
      // Check if teams have slotIndex property (new format)
      const hasSlotIndex = currentPlaying.some(team => team && team.slotIndex !== undefined);
      
      if (hasSlotIndex) {
        // New format: teams have slotIndex, reconstruct slots
        currentPlaying.forEach((team, arrayIndex) => {
          if (team === null) {
            // Null slot preserved - in new format, array index = slot index
            if (arrayIndex < 2) {
              slots[arrayIndex] = null;
            }
          } else if (team && team.slotIndex !== undefined && team.slotIndex < 2) {
            // Only keep teams that are still in the queue
            if (queueEntryIds.has(team.entryId)) {
              slots[team.slotIndex] = team;
              if (team.entryId === entryId) {
                currentSlotIndex = team.slotIndex;
              }
            } else {
              // Team is no longer in queue, clear the slot
              slots[team.slotIndex] = null;
            }
          }
        });
      } else {
        // Old format: assume teams are in order [slot0, slot1] or filtered
        // If length is 2, assume [slot0, slot1]
        // If length is 1, assume it's in slot 0 (migration case)
        currentPlaying.forEach((team, index) => {
          if (team && index < 2) {
            // Only keep teams that are still in the queue
            if (queueEntryIds.has(team.entryId)) {
              slots[index] = team;
              if (team.entryId === entryId) {
                currentSlotIndex = index;
              }
            } else {
              // Team is no longer in queue, clear the slot
              slots[index] = null;
            }
          }
        });
      }
    }
    
    // If this entryId is already in the requested slot, return success
    if (currentSlotIndex === slotIndex) {
      // Already in this slot, just return the current state
      return { slots, gameStartTime, queue: existingEntries, version: courtInfo.version || 1 };
    }
    
    // If this entryId is in a different slot, remove them from that slot first
    if (currentSlotIndex !== -1) {
      slots[currentSlotIndex] = null;
    }
    
    // Check if target slot is already occupied by someone else (who is still in queue)
    if (slots[slotIndex] !== null && queueEntryIds.has(slots[slotIndex].entryId)) {
      throw new Error('Slot is already occupied by another team');
    }
    
    // If slot is occupied by a team not in queue, clear it
    if (slots[slotIndex] !== null && !queueEntryIds.has(slots[slotIndex].entryId)) {
      slots[slotIndex] = null;
    }
    
    // Check if entry already exists in queue (we already have existingEntries)
    let entry = existingEntries.find(e => e.id === entryId);
    
    // If entry doesn't exist, create it
    if (!entry) {
      const position = existingEntries.length + 1;
      const newEntry = {
        id: entryId,
        court_id: courtId,
        display_name: displayName,
        position: position,
        joined_at: new Date().toISOString()
      };
      
      await supabaseRequest('queue_entries', {
        method: 'POST',
        body: JSON.stringify(newEntry)
      });
      entry = newEntry;
    }
    
    // Add team to the slot
    slots[slotIndex] = {
      entryId,
      startTime: new Date().toISOString(),
      extensions: 0,
      slotIndex: slotIndex  // Store which slot this team is in
    };
    
    // Store slots array with nulls preserved to maintain slot positions
    // This ensures slot 0 and slot 1 positions are maintained
    const updatedPlaying = slots;
    
    // If both slots are now filled and game hasn't started, start the timer
    // If only one slot remains, reset timer (game stops)
    let newGameStartTime = gameStartTime;
    const occupiedSlots = slots.filter(slot => slot !== null).length;
    if (occupiedSlots === 2 && gameStartTime === null) {
      newGameStartTime = new Date().toISOString();
    } else if (occupiedSlots < 2 && gameStartTime !== null) {
      newGameStartTime = null; // Reset timer if a slot becomes empty
    }
    
    // Update court with cleaned slots (nulls preserved)
    await supabaseRequest(`courts?id=eq.${encodedCourtId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        playing_teams: updatedPlaying,
        gamestarttime: newGameStartTime,
        version: (courtInfo.version || 0) + 1
      })
    });
    
    // Get updated queue
    const queue = await supabaseRequest(`queue_entries?court_id=eq.${encodedCourtId}&order=position`);
    
    return { slots, gameStartTime: newGameStartTime, queue, version: (courtInfo.version || 0) + 1 };
  } catch (error) {
    console.error('Error joining slot:', error);
    throw error;
  }
}

// Start playing: Move teams from queue to playing
async function startPlaying(courtId, entryIds) {
  try {
    const encodedCourtId = encodeURIComponent(courtId);
    
    // Get current court info
    const courtInfo = await getCourtInfo(courtId);
    const currentPlaying = courtInfo.playing_teams || [];
    
    // Add new teams to playing (max 2 teams)
    const newTeams = entryIds.slice(0, 2 - currentPlaying.length).map(entryId => ({
      entryId,
      startTime: new Date().toISOString(),
      extensions: 0
    }));
    
    const updatedPlaying = [...currentPlaying, ...newTeams];
    
    // Update court with new playing teams
    await supabaseRequest(`courts?id=eq.${encodedCourtId}`, {
      method: 'PATCH',
      body: JSON.stringify({ 
        playing_teams: updatedPlaying,
        version: (courtInfo.version || 0) + 1
      })
    });
    
    return updatedPlaying;
  } catch (error) {
    console.error('Error starting play:', error);
    throw error;
  }
}

// Remove a team from playing (slot-based)
async function removePlayingTeam(courtId, entryId) {
  try {
    const encodedCourtId = encodeURIComponent(courtId);
    
    // Get current court info
    const courtInfo = await getCourtInfo(courtId);
    const currentPlaying = courtInfo.playing_teams || [];
    const gameStartTime = courtInfo.gameStartTime;
    
    // playing_teams should be an array of 2 slots (with nulls preserved)
    // Reconstruct slots array
    const slots = [null, null];
    let removedSlotIndex = -1;
    
    // Handle both old format (filtered array) and new format (with nulls)
    if (Array.isArray(currentPlaying)) {
      if (currentPlaying.length === 2) {
        // New format: array of 2 slots with nulls preserved
        currentPlaying.forEach((team, index) => {
          if (team && team.entryId === entryId) {
            removedSlotIndex = index;
          } else {
            slots[index] = team;
          }
        });
      } else {
        // Old format: filtered array, need to find by slotIndex or assume order
        currentPlaying.forEach((team) => {
          if (team) {
            const slotIdx = team.slotIndex !== undefined ? team.slotIndex : 
                          (currentPlaying.indexOf(team) < 2 ? currentPlaying.indexOf(team) : -1);
            if (slotIdx >= 0 && slotIdx < 2) {
              if (team.entryId === entryId) {
                removedSlotIndex = slotIdx;
              } else {
                slots[slotIdx] = team;
              }
            }
          }
        });
      }
    }
    
    if (removedSlotIndex === -1) {
      throw new Error('Team not found in playing slots');
    }
    
    // Remove the team (set slot to null)
    slots[removedSlotIndex] = null;
    
    // Store slots array with nulls preserved
    const updatedPlaying = slots;
    
    // If only one team remains, reset gameStartTime (timer stops)
    let newGameStartTime = gameStartTime;
    const occupiedSlots = slots.filter(slot => slot !== null).length;
    if (occupiedSlots < 2) {
      newGameStartTime = null;
    }
    
    // Update court
    await supabaseRequest(`courts?id=eq.${encodedCourtId}`, {
      method: 'PATCH',
      body: JSON.stringify({ 
        playing_teams: updatedPlaying,
        gamestarttime: newGameStartTime,
        version: (courtInfo.version || 0) + 1
      })
    });
    
    // Remove from queue and reorder
    await supabaseRequest(`queue_entries?id=eq.${entryId}&court_id=eq.${encodedCourtId}`, {
      method: 'DELETE'
    });
    
    // Reorder remaining entries
    const remainingEntries = await supabaseRequest(`queue_entries?court_id=eq.${encodedCourtId}&order=joined_at`);
    for (let i = 0; i < remainingEntries.length; i++) {
      await supabaseRequest(`queue_entries?id=eq.${remainingEntries[i].id}`, {
        method: 'PATCH',
        body: JSON.stringify({ position: i + 1 })
      });
    }
    
    // Get updated queue
    const queue = await supabaseRequest(`queue_entries?court_id=eq.${encodedCourtId}&order=position`);
    
    return { queue, version: (courtInfo.version || 0) + 1 };
  } catch (error) {
    console.error('Error removing playing team:', error);
    throw error;
  }
}

// Extend play time for a team
async function extendPlayTime(courtId, entryId) {
  try {
    const encodedCourtId = encodeURIComponent(courtId);
    
    // Get current court info
    const courtInfo = await getCourtInfo(courtId);
    const currentPlaying = courtInfo.playing_teams || [];
    
    // Find and update the team
    const updatedPlaying = currentPlaying.map(team => {
      if (team.entryId === entryId) {
        return {
          ...team,
          extensions: (team.extensions || 0) + 1,
          startTime: new Date().toISOString() // Reset timer
        };
      }
      return team;
    });
    
    // Update court with updated playing teams
    await supabaseRequest(`courts?id=eq.${encodedCourtId}`, {
      method: 'PATCH',
      body: JSON.stringify({ 
        playing_teams: updatedPlaying,
        version: (courtInfo.version || 0) + 1
      })
    });
    
    return updatedPlaying;
  } catch (error) {
    console.error('Error extending play time:', error);
    throw error;
  }
}

module.exports = { 
  pool, 
  getQueue, 
  joinTx, 
  leaveTx, 
  advanceTx, 
  getCourtInfo,
  getPlayingTeams,
  startPlaying,
  removePlayingTeam,
  extendPlayTime,
  joinSlot
};
