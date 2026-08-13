// One-time (well, once per ~180 days): mint the Spotify refresh token that
// feeds the "Listening to" corner on the home page.
//
// Usage:
//   node tools/spotify/authorize.mjs
//
// Reads SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET from the environment or
// from .dev.vars at the repo root. Starts a throwaway server on
// http://127.0.0.1:8888/callback — which must be listed as a Redirect URI on
// the app in the Spotify dashboard — opens the consent page in the browser,
// and prints the refresh token when Spotify calls back.
//
// The token then goes into the `spotify` table in D1 (both --local and
// --remote), not into an environment variable — Spotify rotates these on
// refresh, so the Function needs to be able to write the replacement back.
// See the note above the table in schema.sql.

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";

const PORT = 8888;
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;
// The only two scopes the site ever needs: what's playing, what just played.
const SCOPES = "user-read-currently-playing user-read-recently-played";

function devVar(name) {
  if (process.env[name]) return process.env[name];
  try {
    const text = readFileSync(new URL("../../.dev.vars", import.meta.url), "utf8");
    const m = text.match(new RegExp(`^${name}=(.*)$`, "m"));
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

const id = devVar("SPOTIFY_CLIENT_ID");
const secret = devVar("SPOTIFY_CLIENT_SECRET");
if (!id || !secret) {
  console.error("Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET (env or .dev.vars).");
  process.exit(1);
}

// state ties the callback to this run, so a stray or forged hit on the
// listener can't complete the exchange.
const state = randomBytes(16).toString("hex");

const consent = new URL("https://accounts.spotify.com/authorize");
consent.search = new URLSearchParams({
  client_id: id,
  response_type: "code",
  redirect_uri: REDIRECT,
  scope: SCOPES,
  state,
}).toString();

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (url.pathname !== "/callback") {
    res.writeHead(404).end();
    return;
  }

  const fail = (msg) => {
    res.writeHead(400, { "Content-Type": "text/plain" }).end(msg + "\n");
    console.error(msg);
    process.exit(1);
  };

  if (url.searchParams.get("state") !== state) return fail("state mismatch");
  if (url.searchParams.get("error")) return fail(`spotify said: ${url.searchParams.get("error")}`);
  const code = url.searchParams.get("code");
  if (!code) return fail("no code in callback");

  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
    }),
  });
  const token = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !token.refresh_token) {
    return fail(`token exchange failed: ${tokenRes.status} ${JSON.stringify(token)}`);
  }

  res.writeHead(200, { "Content-Type": "text/plain" })
    .end("Done — the token is in the terminal. This tab can close.\n");

  // stdout carries exactly one line, so the caller can capture it:
  //   REFRESH_TOKEN=$(node tools/spotify/authorize.mjs)
  console.log(token.refresh_token);
  server.close();
});

server.listen(PORT, "127.0.0.1", () => {
  console.error(`Waiting on ${REDIRECT} — approving in the browser...`);
  console.error(`If nothing opened, visit:\n${consent}`);
  // macOS. Elsewhere, the printed URL is the fallback.
  execFile("open", [consent.toString()], () => {});
});
