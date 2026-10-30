# Bomb Squad Duo — Challenge Edition (v1.1)

A playable online two-player sci-fi puzzle game with **co-op objectives**, **friendly individual scores**, **private room codes**, and progressive challenge levels. It's a fictional puzzle game; it contains no real-world device or explosive instructions.

## What's new

- **Three difficulties**, selected by the room host before each mission:

  | Difficulty | Clock per module | Mistakes allowed | Time lost per mistake | Co-op target |
  | --- | --- | --- | --- | --- |
  | Warm-up | 110 seconds | 3 | 4 seconds | Secure 5 of 8 |
  | Challenge (default) | 85 seconds | 3 | 6 seconds | Secure 5 of 8 |
  | Expert | 65 seconds | 2 | 8 seconds | Secure 6 of 8 |

- **Three puzzle tiers**, increasing the number of steps, decoy choices, and manual entries as the mission progresses:
  - Tier I: Badge matching and straightforward control sequences.
  - Tier II: Device also displays a **SOLAR / LUNAR** signal. The Expert must use the matching conditional sequence in the manual.
  - Tier III: Device additionally displays **NORMAL / REVERSED polarity**. REVERSED means perform the selected sequence in reverse order, including keypad digits.
- **Longer sequences** in later rounds: up to six glyph taps, four wire disconnects, five circuit taps, or five keypad digits.
- **Fair escalation**: Each player operates one of each of the four puzzle types, and gets the **same distribution of puzzle tiers** as their partner.
- **Editable difficulty each rematch**: A rematch takes players back to the lobby without changing the room code.
- More decoy manual entries (up to six). Mistakes reset the sequence and consume time.

## How to play

1. Host creates a private room and shares the six-character code or the invite link.
2. Your partner joins from a different computer; both need the same public website address.
3. Host selects the difficulty in the lobby and clicks **Start mission**.
4. The **Defuser** sees a badge and, in harder rounds, a signal and polarity.
5. The **Expert** sees an instruction manual, finds the corresponding badge, clicks **Transmit**, and tells the Defuser which sequence to follow. Experts must **ask for the signal and polarity**, because they cannot see those values.
6. The Defuser taps the correct controls. Mistakes consume strikes and timer seconds; too many strikes or an expired timer loses the module.
7. Both click **Ready**. Roles alternate every round. Your co-op target is to secure enough modules; both earn individual badge points for speed and clean play.
8. After eight rounds, see the co-op outcome and friendly personal score. The host can **Set up a rematch** and choose a new difficulty in the same room.

**Tip:** A voice call makes the Expert/Defuser coordination much more exciting. Built-in text chat is also available.

## Test on your computer

Requires **Node.js 22 or newer** (no external application dependencies).

```bash
npm ci
npm test
npm start
```

Open **http://localhost:3000**. For local testing, join from two separate browser tabs. For separate computers over the internet, host the Node server on Render or another host that supports WebSockets.

## Put it online using GitHub and Render

**If this is a new deployment:**

1. Extract this ZIP. Upload the **contents** of this folder (`package.json`, `package-lock.json`, `public/`, `server/`, etc.) to a GitHub repository. Do not upload `node_modules`.
2. In Render, choose **New > Web Service**, connect the GitHub repository, and choose **Node** as the runtime.
3. If `package.json` sits at the GitHub repository root, leave **Root Directory** blank. If you uploaded the entire `bomb-squad-duo-challenge` folder, set **Root Directory** to `bomb-squad-duo-challenge`.
4. Set **Build Command** to `npm ci` and **Start Command** to `npm start`.
5. Deploy. The app will open at the Render website URL. Check `/health` for `{"status":"ok"}` and share the website URL with your partner.

**If you already deployed the earlier version:**

1. In your existing GitHub repo, replace the old `server/`, `public/`, `tests/`, `package.json`, and `package-lock.json` with the new versions. Keep the same directory structure: if your old `package.json` is in a subfolder, update those files *in that same folder*.
2. Commit the changes to the branch Render tracks (often `main`).
3. Render should auto-deploy. If not, choose **Manual Deploy > Deploy latest commit**.
4. Restart your game in a fresh room. In-progress old-version rooms won't survive a server restart.

No API keys, user accounts or database are required for this version. The server holds the authoritative scores, roles, timing, puzzle solutions and room access tokens.

## Limits

- Rooms are kept **in server memory**. A Render instance restart, a free-tier sleep, or a new deployment clears existing rooms and matches.
- The game requires two online players; if either disconnects mid-round, its clock pauses until they reconnect.
- Room codes are **private invitations, not passwords**. Only share them with your partner.
- Rejoining after a reload works as long as the browser tab's session storage still has the player token.
- Performance and browser layout should be checked after deployment with your own devices and internet connections.

## Project files

- `server/index.js`: HTTP/WebSocket routes, room management and difficulty selection.
- `server/game.js`: authoritative game logic, increasingly difficult puzzle generator, scoring, timers and role-based views.
- `server/websocket.js`: built-in lightweight WebSocket handling.
- `public/index.html`, `public/style.css`, `public/app.js`: the browser UI.
- `tests/*.test.js`: multiplayer and gameplay verification.

Version **1.1.0**. Built for personal, educational and recreational use.
