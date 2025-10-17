Maybe do npm install first

# Testing Locally

Generate new cloudflare link:
./cloudflared tunnel --url http://localhost:8080

When you run this, there should be a box or popup in your terminal with something like this:

Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |
2025-10-17T21:17:05Z INF |  https://profits-quad-encoding-provided.trycloudflare.com    

Don't cancel this terminal. Make a new terminal and then run:

cd server && node src/index.js

Then in the third terminal run:
npx expo start --tunnel 

If you need to for some reason clear the expo cache run with the cache clear flag:
npx expo start --clear --tunnel
