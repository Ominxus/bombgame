# Bomb Squad Duo

**An online two-player co-op browser puzzle game with a friendly badge-points rivalry.**

One person is the **Defuser**, viewing a sci-fi control panel; the other is the **Expert**, viewing a secret instruction manual. The Defuser shares the device badge over the built-in chat (or voice call). The Expert matches that badge to a manual entry and transmits authorization, then guides their teammate through the correct button presses. They swap roles every round.

- **8 rounds**, each with a **90-second** timer
- **4 module types:** glyph matrix, energy wires, pulse circuits, security keypad
- **3 strikes per round**; incorrect actions also cost 6 seconds
- **Win together:** secure at least **5 of 8** modules
- **Friendly competition:** each player earns badge points for speed and accuracy. With alternating roles, both play Defuser 4 times and Expert 4 times.
- Private, random **six-character room codes**, plus shareable invite links
- Built-in chat, reconnection via session token, automatic pause while a player is disconnected
- Zero external runtime dependencies; Node.js 22+ and any modern browser

These are entirely fictional puzzles, not real-world bomb defusal instructions.

## Run locally

```sh
npm ci
npm start
```

Visit `http://localhost:3000` in a browser. To test with two players on one computer, use two separate browser tabs (each has its own session token). For two **different computers over the internet**, deploy the server to a public host.

To run automated tests:

```sh
npm test
```

## Deploy to Render (recommended)

1. Extract the ZIP and push **the contents of the `bomb-squad-duo` folder** to a new GitHub repository. `package.json`, `package-lock.json`, `render.yaml`, `public/`, `server/`, and `tests/` should be at the **repository root**.
2. In Render, select **New → Web Service → Build and deploy from a Git repository**; connect your GitHub repo.
3. Set **Language / Runtime** = `Node` and **Instance Type** = `Free` (where available).
4. Set **Root Directory** = blank **if** `package.json` is at the repository root. If you uploaded the entire folder rather than its contents, set Root Directory to `bomb-squad-duo`.
5. Set **Build Command** = `npm ci`, **Start Command** = `npm start`.
6. Deploy. Render provides a website URL. Open it, create a room, and share the invitation link with your partner. You can also visit `/health` to confirm the server is responding.

The included `render.yaml` contains equivalent settings if you prefer a Render Blueprint.

**Note:** Rooms and game state are stored in server memory. An instance restart or a free-tier sleep clears active rooms. If a session expires, create a new room and share a new code. For permanent saves, add a persistent database later. On free tiers, the first visit after inactivity may be slow as the server wakes up.

## Fairness and security notes

- The multiplayer server validates player membership, roles, turns, countdowns and answers.
- Only the Expert receives the secret manual. The Expert's view does **not** include the target badge. Only the Defuser receives it.
- The Expert must authorize the matching manual row before the Defuser can use the panel.
- Both receive points for successful modules; speed and strike-free bonuses differ by stage but are symmetric across the four alternating role swaps.
- An interrupted round pauses until both players reconnect.
- Players are identified by private, random session tokens scoped to the room.
- Browser sessions are stored in sessionStorage, so you can reload your tab and rejoin. If both tabs are closed and their session is lost, there is no account/password recovery in this version.
- Room codes are invitations, **not passwords**. Share them only with your partner.

## Game rules

1. The room creator starts after both players join.
2. The Defuser reads the device badge (e.g. `NOVA`).
3. The Expert finds `NOVA` in their private manual, clicks **Transmit**, and tells their partner the instruction in that row.
4. The Defuser enters the correct sequence/code. Wrong moves cause strikes and cost 6 seconds. The third strike or timer expiry loses the round.
5. Each player clicks **Ready** after a round. Roles switch for the next round.
6. After eight rounds, see the shared mission outcome and friendly individual winner. The host can start a rematch.

## Tech

- Server: built-in Node.js HTTP server + a lightweight RFC 6455 WebSocket implementation
- Client: responsive vanilla HTML/CSS/JavaScript
- Real-time state: authoritative, in-memory room model; separate per-player views
- Files: `server/game.js`, `server/index.js`, `server/websocket.js`, `public/*`, `tests/*`

Licensed for your personal use and modification. No external art or assets are required.
