// Global leaderboard, backed by Supabase (name only -- no accounts).
//
// Identity is a stable, hidden player_id kept in localStorage. The leaderboard
// stores ONE row per player_id (their best run) with the current display name as
// a label. So:
//   * your name is remembered automatically,
//   * renaming updates your row -- old scores follow you to the new name,
//   * two players who type the same name stay separate (different ids), with no
//     data confusion.
//
// Talks to the REST endpoint with plain fetch (no SDK). The publishable/anon key
// is a PUBLIC client credential; the data is protected by row-level security.
// Every call is wrapped so a blocked network never breaks the game.

export const SUPA_URL = 'https://ttjzmmqalbfeybysmqko.supabase.co';
export const SUPA_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0anptbXFhbGJmZXlieXNtcWtvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NDE2NjcsImV4cCI6MjA5NTIxNzY2N30.IJagwYGih7NI8UMalDJynzV0XPWrZfSLWzBdkBqzZh8';

const REST = SUPA_URL + '/rest/v1/csr_leaderboard';
const HEADERS = { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY };
const NAME_KEY = 'riftbreak_name';
const PID_KEY = 'riftbreak_pid';

// ---- Local identity ----------------------------------------------------

// A stable per-browser id. Generated once, then reused forever.
export function getPlayerId() {
  let id = '';
  try { id = localStorage.getItem(PID_KEY) || ''; } catch (e) {}
  if (!id || id.length < 8) {
    id = 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    try { localStorage.setItem(PID_KEY, id); } catch (e) {}
  }
  return id;
}

export function getName() {
  try { return cleanName(localStorage.getItem(NAME_KEY) || ''); } catch (e) { return ''; }
}
export function setName(name) {
  const n = cleanName(name);
  try { localStorage.setItem(NAME_KEY, n); } catch (e) {}
  return n;
}

// ---- Leaderboard I/O ---------------------------------------------------

// Top scores by distance (already one row per player). Returns [] on failure.
export async function fetchTop(limit = 12) {
  try {
    const url = `${REST}?select=player_id,name,distance,style,top_speed,gates,mode&order=distance.desc&limit=${limit}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    return [];
  }
}

// Submit a finished run: keep the player's BEST distance, always refresh the
// name (so a rename carries the record over). Upsert on player_id.
export async function submitScore(run) {
  try {
    const pid = getPlayerId();
    const cur = await fetchMine(pid);
    const runDist = clampInt(run.distance, 0, 100000000);
    const better = !cur || runDist >= (cur.distance || 0);
    const row = {
      player_id: pid,
      name: cleanName(run.name) || 'PLAYER',
      distance: Math.max(cur ? (cur.distance || 0) : 0, runDist),
      style: clampInt(better ? run.style : cur.style, 0, 2000000000),
      top_speed: clampInt(better ? run.topSpeed : cur.top_speed, 0, 100000),
      gates: clampInt(better ? run.gates : cur.gates, 0, 1000000),
      mode: (better ? run.mode : cur.mode) === 'race' ? 'race' : 'solo',
      updated_at: new Date().toISOString(),
    };
    const res = await fetch(`${REST}?on_conflict=player_id`, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(row),
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

// Rename: update the player's existing row so past scores show the new name.
// (No-op server-side if they haven't posted a score yet.)
export async function pushName(name) {
  try {
    const pid = getPlayerId();
    const res = await fetch(`${REST}?player_id=eq.${encodeURIComponent(pid)}`, {
      method: 'PATCH',
      headers: { ...HEADERS, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ name: cleanName(name) || 'PLAYER', updated_at: new Date().toISOString() }),
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

async function fetchMine(pid) {
  try {
    const url = `${REST}?player_id=eq.${encodeURIComponent(pid)}&select=distance,style,top_speed,gates,mode&limit=1`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return null;
    const rows = await res.json();
    return rows && rows[0] ? rows[0] : null;
  } catch (e) {
    return null;
  }
}

// ---- Helpers -----------------------------------------------------------

export function cleanName(name) {
  return String(name || '')
    .toUpperCase()
    .replace(/[^A-Z0-9 _.\-]/g, '')
    .trim()
    .slice(0, 20);
}

function clampInt(v, lo, hi) {
  v = Math.floor(Number(v) || 0);
  return Math.max(lo, Math.min(hi, v));
}
