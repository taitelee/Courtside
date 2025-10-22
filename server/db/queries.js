// server/src/db/queries.js
const https = require('https');
const http = require('http');

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
    
    // Get queue entries
    const queue = await supabaseRequest(`queue_entries?court_id=eq.${courtId}&order=position`);
    console.log('Queue entries:', queue);
    
    // Get court version
    const courts = await supabaseRequest(`courts?id=eq.${courtId}&select=version`);
    console.log('Courts data:', courts);
    const version = courts.length > 0 ? courts[0].version : 0;
    
    return { queue, version };
  } catch (error) {
    console.error('Error getting queue:', error);
    console.error('Error details:', error.message);
    return { queue: [], version: 0 };
  }
}

async function joinTx(courtId, entryId, displayName) {
  try {
    console.log(`Joining queue: courtId=${courtId}, entryId=${entryId}, displayName=${displayName}`);
    
    // First, ensure the court exists in the courts table
    const existingCourts = await supabaseRequest(`courts?id=eq.${courtId}`);
    if (existingCourts.length === 0) {
      console.log('Creating new court:', courtId);
      await supabaseRequest('courts', {
        method: 'POST',
        body: JSON.stringify({
          id: courtId,
          name: courtId,
          version: 1
        })
      });
      console.log('Court created successfully');
    }
    
    // Get next position
    const existingEntries = await supabaseRequest(`queue_entries?court_id=eq.${courtId}&order=position`);
    console.log('Existing entries:', existingEntries);
    const position = existingEntries.length + 1;

    // Insert new entry
    const newEntry = {
      id: entryId,
      court_id: courtId,
      display_name: displayName,
      position: position,
      joined_at: new Date().toISOString()
    };
    console.log('Inserting entry:', newEntry);

    await supabaseRequest('queue_entries', {
      method: 'POST',
      body: JSON.stringify(newEntry)
    });
    console.log('Entry inserted successfully');

    // Update court version (use a simple incrementing number)
    await supabaseRequest(`courts?id=eq.${courtId}`, {
      method: 'PATCH',
      body: JSON.stringify({ version: 1 })
    });
    console.log('Court version updated');

    // Get updated queue
    const queue = await supabaseRequest(`queue_entries?court_id=eq.${courtId}&order=position`);
    console.log('Updated queue:', queue);
    
    return {
      entry: { id: entryId, display_name: displayName, position },
      queue,
      version: 1
    };
  } catch (error) {
    console.error('Error joining queue:', error);
    console.error('Error details:', error.message);
    throw error;
  }
}

async function leaveTx(courtId, entryId) {
  try {
    // Delete the entry
    await supabaseRequest(`queue_entries?id=eq.${entryId}&court_id=eq.${courtId}`, {
      method: 'DELETE'
    });

    // Get remaining entries and reorder positions
    const remainingEntries = await supabaseRequest(`queue_entries?court_id=eq.${courtId}&order=joined_at`);
    
    // Update positions
    for (let i = 0; i < remainingEntries.length; i++) {
      await supabaseRequest(`queue_entries?id=eq.${remainingEntries[i].id}`, {
        method: 'PATCH',
        body: JSON.stringify({ position: i + 1 })
      });
    }

    // Update court version
    await supabaseRequest(`courts?id=eq.${courtId}`, {
      method: 'PATCH',
      body: JSON.stringify({ version: 1 })
    });

    // Get updated queue
    const queue = await supabaseRequest(`queue_entries?court_id=eq.${courtId}&order=position`);
    
    return { queue, version: 1 };
  } catch (error) {
    console.error('Error leaving queue:', error);
    throw error;
  }
}

async function advanceTx(courtId) {
  try {
    // Get first entry (lowest position)
    const firstEntry = await supabaseRequest(`queue_entries?court_id=eq.${courtId}&order=position&limit=1`);
    
    if (firstEntry.length > 0) {
      // Delete the first entry
      await supabaseRequest(`queue_entries?id=eq.${firstEntry[0].id}`, {
        method: 'DELETE'
      });
    }

    // Get remaining entries and reorder positions
    const remainingEntries = await supabaseRequest(`queue_entries?court_id=eq.${courtId}&order=joined_at`);
    
    // Update positions
    for (let i = 0; i < remainingEntries.length; i++) {
      await supabaseRequest(`queue_entries?id=eq.${remainingEntries[i].id}`, {
        method: 'PATCH',
        body: JSON.stringify({ position: i + 1 })
      });
    }

    // Update court version
    await supabaseRequest(`courts?id=eq.${courtId}`, {
      method: 'PATCH',
      body: JSON.stringify({ version: 1 })
    });

    // Get updated queue
    const queue = await supabaseRequest(`queue_entries?court_id=eq.${courtId}&order=position`);
    
    return { queue, version: 1 };
  } catch (error) {
    console.error('Error advancing queue:', error);
    throw error;
  }
}

module.exports = { pool, getQueue, joinTx, leaveTx, advanceTx };
