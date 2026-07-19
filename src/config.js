// Central tuning for RIFTBREAK VELOCITY.
// Everything that governs "feel" lives here so the polish is easy to iterate on.

export const CFG = {
  // ---- Canyon geometry -------------------------------------------------
  seg: 4,            // metres between cross-sections
  behind: 40,        // metres of corridor kept behind the ship
  segments: 300,     // number of cross-sections in the rolling window
  wallHeight: 46,    // height of the canyon walls
  widthBase: 24,     // baseline canyon half-width
  widthAmp: 9,       // how much the half-width breathes
  widthMin: 13,      // tightest the canyon ever gets (the "fracture")

  // ---- Ship / flight ---------------------------------------------------
  shipRadius: 2.2,   // collision radius
  startSpeed: 62,    // metres/second at launch
  maxSpeed: 235,     // hard cap on forward speed
  speedRamp: 0.55,   // how quickly base speed climbs with distance
  boostSpeed: 70,    // extra m/s while boosting at full charge
  accelLat: 210,     // lateral input acceleration
  accelVert: 170,    // vertical input acceleration
  dampLat: 6.5,      // velocity damping (higher = snappier stop)
  dampVert: 6.5,
  maxLatVel: 46,     // clamp on lateral velocity
  maxVertVel: 40,
  floorClear: 3.0,   // minimum height above the floor before you scrape
  ceilClear: 4.0,    // buffer below the wall tops

  // ---- Boost meter -----------------------------------------------------
  boostMax: 100,
  boostDrain: 42,    // per second while held
  boostRegen: 9,     // per second passive trickle
  gateBoostRefill: 34, // instant refill when you thread a gate

  // ---- Gates -----------------------------------------------------------
  gateSpacing: 165,  // metres between gates
  gateRadius: 8.5,   // threadable radius
  gateFirst: 260,    // distance to the first gate

  // ---- The Rift (collapse chasing you) ---------------------------------
  riftStartGap: 150, // starting head start, in metres
  riftBase: 0.86,    // rift speed as a fraction of ship base speed...
  riftRamp: 0.16,    //   ...climbing toward (riftBase + riftRamp) over the run
  riftRampDist: 9000,// distance over which the rift ramps to full menace
  gateKnockback: 46, // metres the rift is shoved back when you thread a gate
  grazeKnockback: 8, // metres of breathing room a clean graze buys you

  // ---- Scoring ---------------------------------------------------------
  distanceScorePerM: 1,
  gateScore: 500,
  grazeScore: 40,
  multiplierMax: 12,
  chainPerMultiplier: 2, // gate-chain length needed per +1 multiplier

  // ---- Graze detection -------------------------------------------------
  grazeDist: 3.4,    // how close to a wall counts as a graze
  grazeCooldown: 0.14,

  // ---- Camera ----------------------------------------------------------
  camDist: 15,
  camHeight: 5.2,
  camLookAhead: 34,
  camLookUp: 2.5,
  camLerp: 7.5,      // positional smoothing (higher = tighter)
  fovBase: 74,
  fovSpeed: 24,      // extra FOV added as you approach max speed
  fovBoost: 10,      // extra FOV punch while boosting

  // ---- Post FX / juice -------------------------------------------------
  bloomStrength: 0.95,
  bloomRadius: 0.6,
  bloomThreshold: 0.55,
  chromaBase: 0.001,
  chromaSpeed: 0.003, // chromatic aberration added by speed
  chromaBoost: 0.0042,
  shakeSpeed: 0.35,   // camera shake from raw speed
  shakeBoost: 0.7,    // camera shake while boosting

  // ---- Fog / palette ---------------------------------------------------
  fogColor: 0x1a0433,
  fogDensity: 0.0019,
  colFloor: 0x00eaff,   // cyan fault lines (floor)
  colWall: 0xff2bbf,    // magenta fault lines (walls)
  colSurface: 0x04040b,  // black-glass surface
  colGate: 0x39ff8a,
  colGateHit: 0x8affc9,
  colGateMiss: 0xff3b5c,
  colRift: 0xff1e5a,
  colShip: 0x0affff,
};

// Named colour helpers reused across modules.
export const PAL = {
  cyan: 0x00eaff,
  magenta: 0xff2bbf,
  gold: 0xffd36e,
  ember: 0xff5e3a,
  green: 0x39ff8a,
  danger: 0xff1e5a,
};
