// Global leaderboard, backed by Supabase (guest names, no login yet).
//
// Talks to the REST endpoint directly with fetch -- no SDK to vendor. The
// publishable/anon key is a PUBLIC client credential (safe to ship); the data
// is protected by row-level security on the server. Every call is wrapped so a
// blocked network or offline player never breaks the game.

export const SUPA_URL = 'https://ttjzmmqalbfeybysmqko.supabase.co';
// Legacy anon JWT -- understood directly by PostgREST + Realtime over raw fetch/WS.
export const SUPA_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0anptbXFhbGJmZXlieXNtcWtvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NDE2NjcsImV4cCI6MjA5NTIxNzY2N30.IJagwYGih7NI8UMalDJynzV0XPWrZfSLWzBdkBqzZh8';

const REST = SUPA_URL + '/rest/v1/csr_scores';
const HEADERS = { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY };
const NAME_KEY = 'riftbreak_name';

// Fetch the top scores by distance. Returns [] on any failure.
export async function fetchTop(limit = 12) {
  try {
    const url = `${REST}?select=name,distance,style,top_speed,gates,mode&order=distance.desc&limit=${limit}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    return [];
  }
}

// Submit a finished run. Returns true on success, false otherwise.
export async function submitScore(row) {
  try {
    const body = {
      name: cleanName(row.name),
      distance: clampInt(row.distance, 0, 100000000),
      style: clampInt(row.style, 0, 2000000000),
      top_speed: clampInt(row.topSpeed, 0, 100000),
      gates: clampInt(row.gates, 0, 1000000),
      mode: row.mode === 'race' ? 'race' : 'solo',
    };
    const res = await fetch(REST, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

// The player's remembered display name.
export function getName() {
  try { return cleanName(localStorage.getItem(NAME_KEY) || ''); } catch (e) { return ''; }
}
export function setName(name) {
  const n = cleanName(name);
  try { localStorage.setItem(NAME_KEY, n); } catch (e) {}
  return n;
}

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
