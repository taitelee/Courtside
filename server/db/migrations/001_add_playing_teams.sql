-- Migration: Add playing_teams and gameStartTime columns to courts table
-- This column stores an array of JSON objects representing teams currently playing

ALTER TABLE courts 
ADD COLUMN IF NOT EXISTS playing_teams JSONB DEFAULT '[]'::jsonb;

ALTER TABLE courts 
ADD COLUMN IF NOT EXISTS gameStartTime TIMESTAMPTZ;

-- Add comments to document the column structure
COMMENT ON COLUMN courts.playing_teams IS 'Array of playing team objects with structure: [{"entryId": "uuid", "startTime": "ISO8601", "extensions": number}]';
COMMENT ON COLUMN courts.gameStartTime IS 'Timestamp when the game started (when both slots were filled). NULL if game is not active.';

