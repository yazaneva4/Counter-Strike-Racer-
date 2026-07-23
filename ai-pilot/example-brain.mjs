// Example custom brain for the AI Pilot (see ai-pilot/README.md).
//
// A brain is just a function: decide(state) -> { ax, ay, boost }.
//   state.z              -- distance travelled (metres)
//   state.u, state.v      -- lateral / vertical position in canyon-local space
//   state.velU, state.velV -- current lateral / vertical velocity
//   state.speed           -- current forward speed (m/s)
//   state.boostFraction   -- 0..1, how full the boost meter is
//   state.halfWidthNow    -- corridor half-width at the current z
//   state.peers           -- Map<id, {name,z,u,v,speed,lastSeen}> of other
//                            racers broadcasting in the same room
//
// Return values:
//   ax, ay  -- desired push toward +u / +v, roughly -1..1 (clamped for you)
//   boost   -- truthy to hold boost this tick
//
// This example is deliberately simple (aim for the corridor centre, boost
// when clear) so you can see the shape of a brain. Swap the body of decide()
// for anything: a hand-written strategy, a trained model's inference call,
// or an async call out to an LLM each tick (decide() may be async).

export function decide(state) {
  const targetU = 0;                       // hug the centreline
  const targetV = 23;                      // roughly mid-height (wallHeight*0.5)

  const ax = clamp((targetU - state.u) * 0.2, -1, 1);
  const ay = clamp((targetV - state.v) * 0.2, -1, 1);

  // Boost whenever there's meter to spare and nothing in the way.
  const boost = state.boostFraction > 0.6;

  return { ax, ay, boost };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
