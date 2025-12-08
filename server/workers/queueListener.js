// server/src/workers/queueListener.js
const { createClient } = require('@supabase/supabase-js');
// const fetch = require('node-fetch'); // if you're on Node < 18, npm install node-fetch

// Use the same Supabase credentials as queries.js
const supabaseUrl = process.env.SUPABASE_URL || 'https://phunvrocpkmmnnbfwwmw.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBodW52cm9jcGttbW5uYmZ3d213Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDUwMjcwOCwiZXhwIjoyMDc2MDc4NzA4fQ.2iAwLDPm8msp5zRqrtVIuc4Q81y_sGQukaLrPUYiOtA';

const supabase = createClient(supabaseUrl, serviceRoleKey);

console.log('Setting up queue listener with Supabase URL:', supabaseUrl);

// Test Supabase connection first
supabase.from('queue_entries').select('id').limit(1).then(({ data, error }) => {
  if (error) {
    console.error('❌ Supabase connection test failed:', error);
  } else {
    console.log('✅ Supabase connection test successful');
  }
});

const channel = supabase
  .channel('queue-listener')
  .on(
    'postgres_changes',
    { 
      event: '*', 
      schema: 'public', 
      table: 'queue_entries'
    },
    async (payload) => {
      console.log('HELLO', payload);
      const { new: newRow, old: oldRow, eventType } = payload;
      
      console.log('Event type:', eventType, 'New row:', newRow, 'Old row:', oldRow);

      // Check if someone became first in line
      // This happens when:
      // 1. INSERT: newRow.position === 1 and oldRow is null (new entry at position 1)
      // 2. UPDATE: newRow.position === 1 and oldRow.position !== 1 (position changed to 1)
      const becameFirst =
        newRow &&
        newRow.position === 1 &&
        (!oldRow || oldRow.position !== 1);
      
      console.log('Became first?', becameFirst, {
        hasNewRow: !!newRow,
        newPosition: newRow?.position,
        hasOldRow: !!oldRow,
        oldPosition: oldRow?.position
      });
      
      if (!becameFirst) {
        console.log('Not becoming first, skipping notification');
        return;
      }

      console.log('👀 Entry became first:', newRow);

      // get the court info to check who's in playing slots
      const { data: courtInfo, error: courtError } = await supabase
        .from('courts')
        .select('name, playing_teams')
        .eq('id', newRow.court_id)
        .maybeSingle();

      if (courtError || !courtInfo) {
        console.error('Error fetching court info:', courtError);
        return;
      }

      // get the entryIds that are currently in playing slots
      const playingTeams = courtInfo.playing_teams || [];
      const entryIdsInSlots = new Set();
      
      // playing_teams is an array of 2 slots (can be null)
      if (Array.isArray(playingTeams)) {
        playingTeams.forEach((team) => {
          if (team && team.entryId) {
            entryIdsInSlots.add(team.entryId);
          }
        });
      }

      console.log('Entry IDs in slots:', Array.from(entryIdsInSlots));

      // Check if the person who became first is in a slot
      let targetEntry = newRow;
      if (entryIdsInSlots.has(newRow.id)) {
        console.log('Person at position 1 is in a slot, finding first waiting person...');
        
        // Get the full queue ordered by position
        const { data: queueEntries, error: queueError } = await supabase
          .from('queue_entries')
          .select('*')
          .eq('court_id', newRow.court_id)
          .order('position', { ascending: true });

        if (queueError || !queueEntries) {
          console.error('Error fetching queue:', queueError);
          return;
        }

        // Find the first person in queue who is NOT in a slot
        targetEntry = queueEntries.find(entry => !entryIdsInSlots.has(entry.id)); // should go through queueEntries in order to find the first on not in entryIdsInSlots
        
        if (!targetEntry) {
          console.log('No waiting person found in queue (all are in slots)');
          return;
        }

        console.log('Found first waiting person:', targetEntry);
      }

      // Get push token for the target entry (first waiting person)
      if (!targetEntry.device_id) {
        console.error('Target entry has no device_id:', targetEntry);
        return;
      }

      console.log('Looking up push token for device_id:', targetEntry.device_id);
      const { data: tokenRow, error: tokenError } = await supabase
        .from('device_push_tokens')
        .select('expo_push_token')
        .eq('device_id', targetEntry.device_id)
        .maybeSingle();

      console.log('Fetched court name:', courtInfo.name);
      console.log('Fetched token row:', { tokenRow, tokenError, device_id: targetEntry.device_id });

      if (tokenError) {
        console.error('Error fetching token:', tokenError);
        return;
      }

      if (!tokenRow || !tokenRow.expo_push_token) {
        console.error('No push token found for device:', targetEntry.device_id);
        return;
      }

      const courtName = courtInfo.name || 'the court';
      const message = {
        to: tokenRow.expo_push_token,
        title: 'You\'re next!',
        body: `You\'re now first in line for ${courtName}. Please return to the court within the next minute.`,
        data: { courtId: targetEntry.court_id, entryId: targetEntry.id },
      };

      try {
        console.log('Sending push notification:', message);
        const res = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message),
        });
        
        const responseData = await res.json().catch(() => null);
        console.log('Expo push result status:', res.status, 'Response:', responseData);
        
        if (!res.ok) {
          console.error('Failed to send push notification:', res.status, responseData);
        } else {
          console.log('✅ Push notification sent successfully!');
        }
      } catch (e) {
        console.error('Error sending push:', e);
      }
    }
    )
    .subscribe((status) => {
      console.log('Queue listener subscription status:', status);
      if (status === 'SUBSCRIBED') {
        console.log('✅ Queue listener successfully subscribed to Supabase realtime');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('❌ Queue listener channel error - check Supabase realtime configuration');
      } else if (status === 'TIMED_OUT') {
        console.error('❌ Queue listener subscription timed out');
      } else if (status === 'CLOSED') {
        console.warn('⚠️ Queue listener channel closed');
      }
    });

// Also listen for connection status
channel.on('system', {}, (payload) => {
  console.log('Queue listener system event:', payload);
});
