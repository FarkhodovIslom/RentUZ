-- Init: extensions before any models. Applied by `prisma migrate dev`, which
-- replays it against the shadow database too — that is why PostGIS lives in
-- this migration instead of the docker init scripts.
-- `search_path=public,extensions` is set on the connection URL in every env.

CREATE SCHEMA IF NOT EXISTS extensions;

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
