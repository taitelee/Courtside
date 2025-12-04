// server/src/workers/queueListener.js
const { createClient } = require('@supabase/supabase-js');
// const fetch = require('node-fetch'); // if you're on Node < 18, npm install node-fetch

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE; // name it whatever you used in .env

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE env vars');
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

supabase
  .channel('queue-listener')
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'queue_entries' },
    // (payload) => console.log('HELLO', payload))
    async (payload) => {
      console.log('HELLO', payload);
      const { new: newRow, old: oldRow } = payload;

      const becameFirst =
        newRow &&
        newRow.position === 1 &&
        (oldRow?.position ?? Infinity) !== 1;
      console.log('Became first?', becameFirst);
      if (!becameFirst) return;

      console.log('👀 Entry became first:', newRow);

      const { data: tokenRow, error } = await supabase
        .from('device_push_tokens')
        .select('expo_push_token')
        .eq('device_id', newRow.device_id)
        .maybeSingle();
      const { data: courtName, error: courtError } = await supabase
        .from('courts')
        .select('name')
        .eq('id', newRow.court_id)
        .maybeSingle();

      console.log('Fetched court name:', { courtName, courtError });
      console.log('Fetched token row:', { tokenRow, error });

      if (error || !tokenRow) {
        console.error('No token for device', newRow.device_id, error);
        return;
      }

      const message = {
        to: tokenRow.expo_push_token,
        title: 'You\'re next!',
        body: `You\'re now first in line for ${courtName}. Please return to the court within the next minute.`,
        data: { courtId: newRow.court_id, entryId: newRow.id },
      };

      try {
        const res = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message),
        });
        console.log('Expo push result status:', res.status);
      } catch (e) {
        console.error('Error sending push:', e);
      }
    }
  )
  .subscribe();

console.log('queue-listener worker subscribed');
