// Optional Google sign-in via Supabase Auth. Uses the plain OAuth redirect flow
// (no SDK): we bounce to Supabase's /authorize endpoint, come back with a token
// in the URL hash, and read the user's profile from it. Everything degrades to
// guest play if the provider isn't configured or the network is blocked.
//
// SETUP REQUIRED for Google to actually work (one-time, in the dashboards):
//   1. Google Cloud Console -> create an OAuth 2.0 Client ID (Web application).
//      Authorised redirect URI: https://ttjzmmqalbfeybysmqko.supabase.co/auth/v1/callback
//   2. Supabase -> Authentication -> Providers -> Google: paste the Client ID +
//      Secret and enable it.
//   3. Supabase -> Authentication -> URL Configuration -> add the site URL
//      (https://counter-strike-racer.vercel.app) to the redirect allow-list.

import { SUPA_URL, SUPA_KEY, cleanName } from './leaderboard.js';

const SESSION_KEY = 'riftbreak_session';

// Kick off Google sign-in (full-page redirect).
export function signInWithGoogle() {
  const redirect = location.origin + location.pathname;
  const url = `${SUPA_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirect)}`;
  location.href = url;
}

// On page load: if we've just returned from the OAuth redirect, capture the
// token from the URL hash and resolve the signed-in user. Returns null if not
// a redirect (or on any failure).
export async function handleRedirect() {
  try {
    const hash = location.hash || '';
    if (hash.indexOf('access_token=') === -1) return null;
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const token = params.get('access_token');
    history.replaceState(null, '', location.pathname + location.search);
    if (!token) return null;
    const user = await fetchUser(token);
    if (user) saveSession(token, user);
    return user;
  } catch (e) {
    return null;
  }
}

// A previously stored session (best-effort; token may have expired server-side).
export function storedUser() {
  const s = loadSession();
  return s ? s.user : null;
}

export function signOut() {
  try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
}

async function fetchUser(token) {
  try {
    const res = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + token },
    });
    if (!res.ok) return null;
    return normalize(await res.json());
  } catch (e) {
    return null;
  }
}

function normalize(u) {
  if (!u || !u.id) return null;
  const meta = u.user_metadata || {};
  const raw = meta.full_name || meta.name || meta.user_name || (u.email ? u.email.split('@')[0] : 'PLAYER');
  return { id: u.id, email: u.email || '', name: cleanName(raw) || 'PLAYER' };
}

function saveSession(token, user) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({ token, user })); } catch (e) {}
}
function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; }
}
