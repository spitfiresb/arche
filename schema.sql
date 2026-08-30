-- Schema for the zainsaeed-pulse D1 database (see wrangler.toml).
--
-- Apply it with:
--   npx wrangler d1 execute zainsaeed-pulse --remote --file=schema.sql
--   npx wrangler d1 execute zainsaeed-pulse --local  --file=schema.sql
--
-- Two tables, both tiny, both self-pruning from functions/api/pulse.js.

-- One row per (day, visitor) pair, where visitor is a salted SHA-256 of the
-- day and the caller's IP, truncated to 80 bits. The IP itself is never
-- written down, and because the day is inside the hash, yesterday's rows
-- can't be matched against today's — the identifier a person gets is only
-- stable for 24 hours.
--
-- The primary key IS the dedupe: a second visit on the same day is an
-- INSERT OR IGNORE that changes nothing, so "visits (30d)" counts people
-- rather than page loads, and refreshing can't move the number.
CREATE TABLE IF NOT EXISTS hits (
  day     TEXT NOT NULL,  -- 'YYYY-MM-DD', UTC
  visitor TEXT NOT NULL,  -- 20 hex chars
  PRIMARY KEY (day, visitor)
) WITHOUT ROWID;

-- One row per open tab, rewritten by that tab's heartbeat every 30s. A tab is
-- "online" while its row is fresher than the online window; rows well past it
-- are deleted on the next request, so the table stays the size of the traffic
-- actually on the site right now.
--
-- country is the two-letter code Cloudflare puts on the request at the edge,
-- and it is the only thing here that says anything about who a visitor is. It
-- rides on the ephemeral table rather than the visit log on purpose: it lives
-- and dies with the open tab, so nothing about where people are is kept once
-- they have gone. Adding it to `hits` would have built a 30-day location
-- history, which is not what the flags are for.
CREATE TABLE IF NOT EXISTS presence (
  tab     TEXT PRIMARY KEY,  -- client-generated UUID, per browser tab
  seen    INTEGER NOT NULL,  -- unix seconds
  country TEXT               -- ISO 3166-1 alpha-2, or NULL if the edge had none
) WITHOUT ROWID;

-- Both the online count and the sweep filter on seen alone.
CREATE INDEX IF NOT EXISTS presence_seen ON presence (seen);

-- One row, forever, holding the last place worth saying out loud: the widget
-- in the bottom-left corner of the home page. Written only by /api/where,
-- which a launchd job on my Mac beats while I'm logged in.
--
-- What is NOT here is the point. There is no latitude, no longitude, no
-- accuracy radius, no history — one label and one timestamp. Coordinates
-- exist for a few milliseconds inside the Function while it asks
-- OpenStreetMap what building they fall in, and are never written down. Even
-- a full dump of this database is a single line of text saying where I was
-- once, which is the most it should ever be able to say.
--
-- label is a venue name that already survived the allowlist in where.js, so
-- by construction it is somewhere public — a cafe, a restaurant, a library.
-- Anywhere private simply never reaches this table, and "at home" is not a
-- state that gets stored: it's the absence of a write, so the row keeps
-- whatever public place came last and quietly ages instead.
--
-- seen is refreshed by every beat while I'm still there, so it means "last
-- confirmed at this place" rather than "arrived at". The moment I leave it
-- stops moving and the corner starts counting up.
-- One row, forever: the Spotify connection and the last track worth showing,
-- the line in the bottom-left corner of the home page. Nothing per-visitor
-- ever touches this table — it is entirely about my own listening.
--
-- The refresh token lives here rather than in an environment variable on
-- purpose: this app's tokens expire 180 days after issue, and Spotify may
-- hand back a replacement on any refresh. A token in the dashboard would be
-- a token nobody rotates; a token here is rewritten by the Function the
-- moment Spotify rotates it, so the connection never silently dies.
--
-- track is a small JSON blob ({title, artist, url, playing}) cached by
-- functions/api/pulse.js so a burst of visitors is served from here instead
-- of fanning out into a Spotify call per heartbeat. fetched is when that
-- cache was last written; the Function refreshes it in the background when
-- it's older than one beat.
CREATE TABLE IF NOT EXISTS spotify (
  id            INTEGER PRIMARY KEY CHECK (id = 1),  -- exactly one row
  refresh_token TEXT NOT NULL,
  access_token  TEXT,               -- short-lived, minted from refresh_token
  token_expires INTEGER,            -- unix seconds
  track         TEXT,               -- JSON, see above
  fetched       INTEGER             -- unix seconds
);

CREATE TABLE IF NOT EXISTS place (
  id    INTEGER PRIMARY KEY CHECK (id = 1),  -- exactly one row, enforced
  label TEXT NOT NULL,                       -- 'Farmers Union Coffee Roasters'
  city  TEXT,                                -- 'Eugene', for readers far away;
                                             -- NULL when it'd repeat the label
  area  TEXT,                                -- 'South Beach': the neighbourhood,
                                             -- for the hover hint; NULL where
                                             -- OSM maps none (most towns)
  seen  INTEGER NOT NULL                     -- unix seconds
);

-- area arrived after the table did, and CREATE IF NOT EXISTS won't add a
-- column to a database that already has the table. Databases created before
-- it need, once:
--   npx wrangler d1 execute zainsaeed-pulse --remote \
--     --command "ALTER TABLE place ADD COLUMN area TEXT"
-- (and the same with --local). Not in this file because SQLite has no ADD
-- COLUMN IF NOT EXISTS, and a statement that fails on rerun would cost this
-- file its idempotence.
