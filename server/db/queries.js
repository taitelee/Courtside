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
          version: 1
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

    // Update court version (use a simple incrementing number)
    await supabaseRequest(`courts?id=eq.${encodedCourtId}`, {
      method: 'PATCH',
      body: JSON.stringify({ version: 1 })
    });
    console.log('Court version updated');

    // Get updated queue
    const queue = await supabaseRequest(`queue_entries?court_id=eq.${encodedCourtId}&order=position`);
    console.log(`[${requestId}] Updated queue:`, queue);

    console.log(`[${requestId}] Join completed successfully for entryId: ${entryId}`);
    return {
      entry: { id: entryId, display_name: displayName, position },
      queue,
      version: 1
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

    // Update court version
    await supabaseRequest(`courts?id=eq.${encodedCourtId}`, {
      method: 'PATCH',
      body: JSON.stringify({ version: 1 })
    });

    // Get updated queue
    const queue = await supabaseRequest(`queue_entries?court_id=eq.${encodedCourtId}&order=position`);
    
    return { queue, version: 1 };
  } catch (error) {
    console.error('Error advancing queue:', error);
    throw error;
  }
}

module.exports = { pool, getQueue, joinTx, leaveTx, advanceTx };
