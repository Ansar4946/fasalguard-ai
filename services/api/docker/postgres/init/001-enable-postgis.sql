CREATE EXTENSION IF NOT EXISTS postgis;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname='postgis') THEN RAISE EXCEPTION 'PostGIS extension was not enabled'; END IF; END $$;
