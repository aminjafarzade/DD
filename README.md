# Durak Duel

A two-player Durak web app with optional perevod (transfer) rules. The game runs in-memory, starts as soon as your friend joins, and uses a shareable link.

## Features
- Two-player real-time gameplay over WebSockets.
- Optional perevod (transfer) rules toggle when creating the room.
- One active game at a time, no persistence.
- Polished UI with smooth transitions.

## Run Locally
1. Install dependencies: `npm install`
2. Start the server: `npm start`
3. Open `http://localhost:3000`

## How To Play
1. Click **Create & Start** and share the link with your friend.
2. Your friend opens the link or enters the room code.
3. Click a card to attack. If defending, select a card and click the attack to defend.
4. Use **Transfer** (perevod) or **Take** when defending.
5. Use **End Turn** when all attacks are defended.

## Deploy
This is a standard Node.js app and needs a host that supports WebSockets.

1. Push this folder to a Git repo.
2. Create a new web service on Render, Railway, Fly.io, or similar.
3. Use build command: `npm install`
4. Use start command: `npm start`
5. Set the `PORT` environment variable if the host requires it.

Once deployed, share the public URL with your friend and play in the browser.
