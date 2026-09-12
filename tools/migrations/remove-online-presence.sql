-- Apply after deploying the version that no longer reads or writes this table.
-- npx wrangler d1 execute zainsaeed-pulse --remote --file=tools/migrations/remove-online-presence.sql
-- Use --local for a development database. Safe to rerun; visits are untouched.
DROP TABLE IF EXISTS presence;
