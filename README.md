# COUNTER STRIKE RACER
### *Neon Canyon Hyperracer*

Pilot a hovership at extreme speed through an **infinite, procedurally generated
canyon** that twists, banks, narrows and dives. Thread glowing gates to chain
boosts, graze the walls for style at the edge of disaster, and outrun the
**collapsing rift** devouring the world behind you. One crash ends the run.

Built from scratch with **Three.js** — full 3D, custom shaders, and a physical
sense of speed (FOV surge, camera shake, chromatic aberration, motion streaks).
Plays on desktop **and mobile**.

<p align="center"><i>Synthwave-noir: black-glass terrain · glowing wireframe fault lines · volumetric fog · a burning horizon sun.</i></p>

---

## Play

You need a tiny local web server (browsers won't load ES modules over `file://`).
No build step, no install — the game and its copy of Three.js are fully vendored.

```bash
npm start          # zero-dependency Node static server
```

Then open **http://localhost:8080** and press **Space** (or tap) to launch.

> Any static server works if you prefer, e.g. `python3 -m http.server 8080`.

### Controls

**Desktop**

| Action | Keys |
| --- | --- |
| Steer left / right | `←` `→` or `A` `D` — or just **move the mouse** |
| Climb / dive | `↑` `↓` or `W` `S` |
| Boost | `Space` or `Shift` (or hold a mouse button) |
| Launch / restart | `Space` or click |
| Mute | `M` (or click the SOUND label) |

**Mobile / touch**

- **Drag** a finger anywhere to steer and fly — horizontal drag steers, vertical
  drag climbs/dives, like a floating joystick.
- Hold the on-screen **BOOST** pad (bottom-right) with a second thumb.
- **Tap** to launch or restart.

---

## How it plays

- **Distance** is the main score — the further you fly, the faster it gets.
- **Gates** give a boost refill, shove the rift back, and build a **chain**. Every
  couple of gates in a row raises your **style multiplier** (up to `x12`). Miss
  one and the chain resets.
- **Grazing** a wall or the floor without touching it pours on style — the closer
  and longer, the better, but contact is fatal.
- **Boost** drains a meter (refilled by gates and a passive trickle). Use it to
  extend your lead on the rift and to punch through tight sections.
- **The Rift** speeds up the longer you survive. Keep moving, keep threading
  gates, or it consumes you. Your best distance is saved locally.

---

## What's under the hood

| Piece | File | Notes |
| --- | --- | --- |
| Procedural spine | `src/path.js` | The canyon is one continuous function of forward distance — layered sines for meander, dive and width, with banking derived from curvature. Seamless forever, and every subsystem agrees on where the walls are. |
| Terrain | `src/canyon.js` | A rolling, grid-snapped window of cross-sections: a near-black glass surface plus an additive neon wireframe (cyan floor, magenta walls). |
| Flight & collision | `src/ship.js` | Momentum-based steering, corridor collision, graze detection, and a detailed neon starfighter — a faceted violet hull with a glowing canopy, long swept wings that fork at the tips, and twin engine nacelles that flare magenta under thrust. |
| Gates | `src/gates.js` | Pooled rings addressed by absolute index so each resolves hit/miss exactly once. |
| The Rift | `src/rift.js` | An animated fBm energy curtain plus a red flood light and a danger signal that drives the HUD and post FX. |
| Particles | `src/particles.js` | Streaming speed dust, graze sparks, exhaust trail and crash bursts. |
| Environment | `src/environment.js` | A camera-locked sky dome with a hand-written gradient and a striped burning sun baked into the shader. |
| Post FX | `src/postfx.js` | A neon glow pass + chromatic aberration, vignette, film grain and the rift-danger red pulse. |
| Input | `src/input.js` | Keyboard, mouse-steer and touch (floating joystick + boost pad) folded into one set of axes. |
| Leaderboard | `src/leaderboard.js` | Global guest leaderboard over Supabase REST (plain `fetch`, no SDK). Submits a finished run and pulls the top scores; fails safe offline. |
| Bots | `src/bots.js` | AI rivals for Race mode — each flies the corridor at its own pace with gentle rubber-banding so the pack stays in the race. |
| Live arena | `src/realtime.js` | Live multiplayer over Supabase Realtime broadcast (raw WebSocket, Phoenix protocol). Everyone in Race mode shares one arena and sees each other as ghost craft. |
| Ghost craft | `src/ghost.js` | The lightweight neon wireframe + name label used for both bots and live players. |
| Camera / loop / scoring | `src/main.js` | The state machine, boost/rift economy, the speed-drunk multi-view camera, and the SOLO / RACE modes. |

### Online play

- **Modes** — pick **SOLO RUN** (endless time-trial) or **RACE** (AI bots + live players) from the menu after entering a pilot name.
- **Global leaderboard** — every run is submitted by distance and shown on the menu and game-over screens. Backed by a Supabase table (`csr_scores`) with row-level security and value constraints; the client uses the project's **publishable** key (safe to ship) and reads/writes over REST.
- **Live multiplayer** — Race mode joins a shared Supabase Realtime channel and broadcasts your ship state ~10×/sec, so anyone else racing at the same time appears as a named ghost. There's no matchmaking — it's one open arena — and it degrades gracefully to "bots only" if the socket can't connect.
- **Sign-in** — guest names for now; Google sign-in is planned (it needs Google OAuth credentials configured in Supabase).

> The Supabase URL + publishable key live in `src/leaderboard.js`. These are **public client credentials** by design; the data is protected by row-level security on the server.

All tuning lives in **`src/config.js`** — speeds, camera feel, glow, fog, colours.

### Rendering & compatibility

The neon glow is rendered in a way that works on **every** WebGL2 device,
including phones — it doesn't depend on floating-point render targets, which a
number of drivers *claim* to support but actually render as a black screen.

If you're on a high-end desktop GPU and want the wider, softer **UnrealBloom**
glow, opt in with **`?hd`** (a runtime probe still verifies your GPU can really
render it before switching):

```
http://localhost:8080/?hd       # fancier bloom on capable desktop GPUs
http://localhost:8080/?safe      # force the default lightweight path
```

---

## Requirements

- A browser with **WebGL 2** (any modern Chrome, Firefox, Edge, or Safari — mobile included).
- **Node.js** only to run the bundled static server (`npm start`). The game
  itself ships with its own copy of Three.js in `lib/` and needs nothing else.

## License

MIT
