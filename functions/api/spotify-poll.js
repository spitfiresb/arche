// Cloudflare Pages Function: POST /api/spotify-poll
//
// The clock the music corner otherwise lacks. Everything else about the
// Spotify cache is refreshed opportunistically, riding /api/pulse whenever a
// visitor happens to beat — which is fine for songs (Spotify's own history
// remembers them, so a late check still recovers them) and fatal for podcast
// episodes, which Spotify's history endpoint never records. An episode is
// visible only while it's playing, so *something* has to look during
// playback, visitors or not.
//
// This is that something's target. A scheduled GitHub Actions workflow
// (.github/workflows/spotify-poll.yml) POSTs here every 15 minutes; the
// handler runs the exact same refreshSpotify pass a visitor beat would have
// triggered, and the result lands in the same cached row every /api/pulse
// response reads. No new state, no second pipeline — just a guaranteed
// heartbeat under the existing one.
//
// Token-gated even though it writes nothing from the request: unauthenticated
// it would let anyone on the internet spend this site's Spotify quota at
// will. Same refuse-rather-than-default-open posture as /api/where.
//
// Required bindings (wrangler.toml / Pages dashboard):
//   PULSE_DB            D1 database, schema in schema.sql
//   SPOTIFY_POLL_TOKEN  random string, secret. Shared with the GitHub
//                       Actions workflow (repo secret of the same name).

import { refreshSpotify } from "./pulse.js";

export async function onRequestPost({ request, env }) {
  try {
    const db = env.PULSE_DB;
    if (!db) return json({ error: "PULSE_DB is not bound" }, 500);

    if (!env.SPOTIFY_POLL_TOKEN) {
      console.error("SPOTIFY_POLL_TOKEN is not set — /api/spotify-poll is disabled");
      return json({ error: "Not configured" }, 503);
    }
    const auth = request.headers.get("Authorization") || "";
    if (!safeEqual(auth.replace(/^Bearer\s+/i, ""), env.SPOTIFY_POLL_TOKEN)) {
      return json({ error: "Forbidden" }, 403);
    }

    const row = await db
      .prepare(
        `SELECT refresh_token, access_token, token_expires, track
           FROM spotify WHERE id = 1`,
      )
      .first();
    if (!row) return json({ error: "spotify table is not seeded" }, 503);

    // Awaited rather than waitUntil'd: there's no visitor waiting on this
    // response, and a poller that returns before the work happened can't
    // tell a dead refresh from a live one.
    await refreshSpotify(db, env, row);
    return json({ ok: true }, 200);
  } catch (error) {
    console.error("Spotify Poll Error:", error);
    return json({ error: "Internal Server Error" }, 500);
  }
}

// Constant-time compare, same as /api/where and for the same reason.
function safeEqual(a, b) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
