#!/bin/bash

# Start the backend server with Supabase database
cd /home/thefakesttaite/Courtside2/server
export PATH="/home/thefakesttaite/.nvm/versions/node/v20.17.0/bin:$PATH"
SUPABASE_DB_URL="postgresql://postgres:unsent-poker-bagel@db.phunvrocpkmmnnbfwwmw.supabase.co:5432/postgres" node src/index.js
