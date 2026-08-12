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
CREATE TABLE IF NOT EXISTS place (
  id    INTEGER PRIMARY KEY CHECK (id = 1),  -- exactly one row, enforced
  label TEXT NOT NULL,                       -- 'Farmers Union Coffee Roasters'
  city  TEXT,                                -- 'Eugene', for readers far away;
                                             -- NULL when it'd repeat the label
  seen  INTEGER NOT NULL                     -- unix seconds
);
