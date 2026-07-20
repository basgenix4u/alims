-- Creates the least-privilege application role.
--
-- Critical: the application must NOT be a superuser and must NOT have
-- BYPASSRLS, otherwise PostgreSQL Row-Level Security is silently ignored
-- and cross-institution isolation (PRD §6.1) fails open.
--
-- Migrations run as alims_owner; the running app connects as alims_app.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'alims_app') THEN
    CREATE ROLE alims_app LOGIN PASSWORD 'alims_dev_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE alims TO alims_app;
GRANT USAGE ON SCHEMA public TO alims_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO alims_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO alims_app;
