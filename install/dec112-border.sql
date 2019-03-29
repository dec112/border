
-- Uncomment this sql block if you want dec112_border to live
-- in its own database named "dec112_border"

--DROP DATABASE IF EXISTS dec112_border;
--CREATE DATABASE dec112_border
--  WITH OWNER = postgres
--       ENCODING = 'UTF8'
--       TABLESPACE = pg_default
--       LC_COLLATE = 'de_AT.UTF-8'
--       LC_CTYPE = 'de_AT.UTF-8'
--       CONNECTION LIMIT = -1
--       TEMPLATE template0;
--COMMENT ON DATABASE postgres
--  IS 'dec112_border - Deaf Emergency Call border element';
--\c dec112_border;


-- Use this code block to place dec112_border data into
-- its own schema in an existing database ("postgres" is default"
\c postgres
DROP SCHEMA IF EXISTS "dec112_border" CASCADE;
CREATE SCHEMA "dec112_border";
SET search_path TO "dec112_border", public;

-- create extensions (in public)
CREATE EXTENSION IF NOT EXISTS adminpack WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;
--CREATE EXTENSION IF NOT EXISTS postgis_topology WITH SCHEMA public;

-- create enum from where message originates
CREATE TYPE origin AS ENUM ('unknown', 'remote', 'local', 'system');


-- inserted call id if not provided
CREATE OR REPLACE FUNCTION insert_id() RETURNS TRIGGER
AS
$BODY$
BEGIN
  IF NEW.call_id IS NULL THEN
    NEW.call_id = NEW.ID;
  END IF;
  RETURN NEW;
END;
$BODY$
LANGUAGE plpgsql;

-- inserted timestamp function for all tables
CREATE OR REPLACE FUNCTION insert_ts() RETURNS TRIGGER
AS
$BODY$
BEGIN
  NEW.created_ts = now() at time zone 'utc';
  RETURN NEW;
END;
$BODY$
LANGUAGE plpgsql;

-- modified timestamp function for all tables
CREATE OR REPLACE FUNCTION update_ts() RETURNS TRIGGER
AS
$BODY$
BEGIN
  NEW.modified_ts = now() at time zone 'utc';
  RETURN NEW;
END;
$BODY$
LANGUAGE plpgsql;

-- create point from lat,lon location
CREATE OR REPLACE FUNCTION update_location() RETURNS TRIGGER
AS
$BODY$
BEGIN
  -- enable this line in case of a schema so that
  -- postgis functions installed in this schema will be found
  SET search_path TO "dec112_border", public;
  --NEW.location = ST_SetSRID(ST_MakePoint(
  --  NEW.longitude, NEW.latitude, NEW.altitude), 4326);
  NEW.location = ST_SetSRID(ST_MakePoint(
    NEW.longitude, NEW.latitude), 4326);
  RETURN NEW;
END;
$BODY$
LANGUAGE plpgsql;


-- calls table holds master record for each emergency call
CREATE TABLE "calls" (
  ID BIGSERIAL PRIMARY KEY,
  created_ts TIMESTAMP WITHOUT TIME ZONE,
  modified_ts TIMESTAMP WITHOUT TIME ZONE,
  closed_ts TIMESTAMP WITHOUT TIME ZONE,
  call_id VARCHAR,
  call_id_alt VARCHAR,
  device_id VARCHAR,
  caller_sip VARCHAR,
  caller_id INTEGER,
  called_sip VARCHAR,
  requested_service VARCHAR,
  is_test BOOLEAN DEFAULT FALSE
);

ALTER TABLE "calls"
  ADD CONSTRAINT calls_idx UNIQUE (call_id);
ALTER TABLE "calls"
  ADD CONSTRAINT calls_idx_alt UNIQUE (call_id_alt);

CREATE TRIGGER calls_insert_trigger
BEFORE INSERT ON "calls"
FOR EACH ROW
EXECUTE PROCEDURE insert_ts();

CREATE TRIGGER calls_insert_id_trigger
BEFORE INSERT ON "calls"
FOR EACH ROW
EXECUTE PROCEDURE insert_id();

CREATE TRIGGER calls_update_trigger
BEFORE UPDATE ON "calls"
FOR EACH ROW
EXECUTE PROCEDURE update_ts();


-- entries table holds a record of raw message for each message during call
CREATE TABLE "entries" (
  ID BIGSERIAL PRIMARY KEY,
  created_ts TIMESTAMP WITHOUT TIME ZONE,
  modified_ts TIMESTAMP WITHOUT TIME ZONE,
  call_db_id INTEGER REFERENCES "calls" (ID) ON DELETE CASCADE,
  origin origin,
  message_raw TEXT,
  message_parsed TEXT,
  message_id INTEGER DEFAULT 0
);

ALTER TABLE "entries"
  ADD CONSTRAINT entries_idx UNIQUE (call_db_id, ID);
CREATE INDEX entries_call_idx on "entries" (call_db_id);

CREATE TRIGGER entries_insert_trigger
BEFORE INSERT ON "entries"
FOR EACH ROW
EXECUTE PROCEDURE insert_ts();

CREATE TRIGGER entries_update_trigger
BEFORE UPDATE ON "entries"
FOR EACH ROW
EXECUTE PROCEDURE update_ts();


-- texts holds a record containing parsed human readable text for each message
CREATE TABLE "texts" (
  ID BIGSERIAL PRIMARY KEY,
  created_ts TIMESTAMP WITHOUT TIME ZONE,
  modified_ts TIMESTAMP WITHOUT TIME ZONE,
  entry_db_id INTEGER REFERENCES "entries" (ID) ON DELETE CASCADE,
  content TEXT
);

ALTER TABLE "texts"
  ADD CONSTRAINT texts_idx UNIQUE (entry_db_id, ID);
CREATE INDEX texts_entry_idx on "texts" (entry_db_id);

CREATE TRIGGER texts_insert_trigger
BEFORE INSERT ON "texts"
FOR EACH ROW
EXECUTE PROCEDURE insert_ts();

CREATE TRIGGER texts_update_trigger
BEFORE UPDATE ON "texts"
FOR EACH ROW
EXECUTE PROCEDURE update_ts();


-- data holds a name=value records for additional data submitted during chat
CREATE TABLE "data" (
  ID BIGSERIAL PRIMARY KEY,
  created_ts TIMESTAMP WITHOUT TIME ZONE,
  modified_ts TIMESTAMP WITHOUT TIME ZONE,
  entry_db_id INTEGER REFERENCES "entries" (ID) ON DELETE CASCADE,
  name TEXT,
  value TEXT
);

ALTER TABLE "data"
  ADD CONSTRAINT data_idx UNIQUE (entry_db_id, ID);
CREATE INDEX data_entry_idx on "data" (entry_db_id);

CREATE TRIGGER data_insert_trigger
BEFORE INSERT ON "data"
FOR EACH ROW
EXECUTE PROCEDURE insert_ts();

CREATE TRIGGER data_update_trigger
BEFORE UPDATE ON "data"
FOR EACH ROW
EXECUTE PROCEDURE update_ts();


-- locations hold lat/lon position data submited during chat
CREATE TABLE "locations" (
  ID BIGSERIAL PRIMARY KEY,
  created_ts TIMESTAMP WITHOUT TIME ZONE,
  modified_ts TIMESTAMP WITHOUT TIME ZONE,
  entry_db_id INTEGER REFERENCES "entries" (ID) ON DELETE CASCADE,
  latitude DOUBLE PRECISION DEFAULT 0.00,
  longitude DOUBLE PRECISION DEFAULT 0.00,
  altitude DOUBLE PRECISION DEFAULT 0.00,
  radius DOUBLE PRECISION DEFAULT 0.00,
  method VARCHAR,
  --location GEOMETRY(PointZ, 4326)
  location GEOMETRY(Point, 4326)
);


ALTER TABLE "locations"
  ADD CONSTRAINT locationss_idx UNIQUE (entry_db_id, ID);
CREATE INDEX locations_entry_idx on "locations" (entry_db_id);

CREATE TRIGGER locationss_insert_trigger
BEFORE INSERT ON "locations"
FOR EACH ROW
EXECUTE PROCEDURE insert_ts();

CREATE TRIGGER locationss_update_trigger
BEFORE UPDATE ON "locations"
FOR EACH ROW
EXECUTE PROCEDURE update_ts();

CREATE TRIGGER update_location_trigger
BEFORE INSERT OR UPDATE ON "locations"
FOR EACH ROW
EXECUTE PROCEDURE update_location();

