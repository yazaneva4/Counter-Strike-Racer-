# AI Pilot

A real racer, not a puppet. `pilot.mjs` is a standalone Node.js script that
flies a genuine ship in **Counter Strike Racer** — same acceleration/damping
physics, same collision, same boost economy, same speed-ramp formula as a
human player (it imports the actual constants from `src/config.js`, so there
is exactly one source of truth for "same power"). It connects to a **Live
Race** room over the same Supabase Realtime protocol the browser uses, and
shows up to everyone else as a normal named racer — no `BOT` tag, because as
far as the wire protocol is concerned it's just another peer.

Zero npm dependencies. Node 22's built-in `fetch` and `WebSocket` are all it
needs.

## Quick start

```bash
# No network at all -- just prints telemetry so you can tune a brain locally.
node ai-pilot/pilot.mjs --dry-run

# Join a real Live Race lobby (host or join the same code in the game first).
node ai-pilot/pilot.mjs --room ABCD --name AXIOM

# Plug in your own decision-making.
node ai-pilot/pilot.mjs --room ABCD --brain ./my-brain.mjs --submit
```

Run `node ai-pilot/pilot.mjs --help` for the full flag list.

## Writing a brain

A brain is one function: `decide(state) -> { ax, ay, boost }`. It can be
`async` — call a rule engine, a local model, or an LLM API each tick.

```js
export function decide(state) {
  // state.z, state.u, state.v        -- position (canyon-local space)
  // state.velU, state.velV           -- current lateral/vertical velocity
  // state.speed                      -- current forward speed (m/s)
  // state.boostFraction              -- 0..1, how full the boost meter is
  // state.halfWidthNow               -- corridor half-width at this z
  // state.peers                      -- Map<id, {name,z,u,v,speed,lastSeen}>
  //                                     of other racers broadcasting nearby

  return {
    ax: 0,        // push toward +u, roughly -1..1 (clamped for you)
    ay: 0,        // push toward +v, roughly -1..1
    boost: false, // hold boost this tick?
  };
}
```

See `example-brain.mjs` for a minimal working one. The built-in default brain
(used when `--brain` is omitted) looks ahead along the corridor for the
tightest upcoming width and steers toward the safe lane there, so it's usable
out of the box.

Corridor shape is a **pure function of distance** (`z`) — every client
computes it independently and identically, so a brain never needs a feed of
"here's what the world looks like"; it can compute `halfWidth(z + lookahead)`
itself (the pilot script already does, and could expose more of the shape to
your brain if you extend `state`).

## What it doesn't do (yet)

This reference implementation focuses on movement, collision and boost. It
does not thread gates (no chain/multiplier bonus) or track style score —
`--submit` posts distance and top speed honestly, with style/gates at 0.
Both are natural extensions if you want to build a more complete brain: gate
positions are a deterministic function of index (`gateFirst + i *
gateSpacing`, see `src/gates.js`), so a brain could aim for them the same way
it aims for a safe lane.

## Protocol notes

- Realtime room: `realtime:csr-room-<CODE>` on the project's Supabase Realtime
  (Phoenix channel protocol over raw WebSocket — same one `src/realtime.js`
  uses in the browser). A room is just a channel name; HOST/JOIN in the game
  with the same code puts everyone on the same channel.
- Broadcast shape: `{ id, name, z, u, v, speed }` at ~10 Hz, matching what the
  browser's `Ghost` renderer expects.
- Leaderboard: `--submit` calls the same public REST endpoint the browser
  uses (`src/leaderboard.js`), with the project's publishable key. It's a
  public client credential by design — the table is protected by row-level
  security server-side.

## A hosted, always-on AI opponent

This script is meant to be **run by you**, as a separate process, for as long
as you want it in a race. There's deliberately no "always-on AI in the cloud"
here: this project is a static site (Vercel) plus Supabase (Postgres +
Realtime) — neither hosts a persistent process, and a smooth ~10 Hz position
broadcast needs one (a serverless function that wakes up on a schedule can't
hold a continuous simulation loop). If you want an AI that's always in the
arena, run `pilot.mjs --respawn` on any machine you leave on, or deploy it as
a small always-on worker (a low-cost VPS, Railway, Fly.io, etc.) — happy to
help wire that up if you want to go that route.
