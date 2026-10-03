-- 004: least-privilege application role. The migration owner keeps DDL rights; the app role gets DML only.
-- Enable login out of band:  ALTER ROLE researchiq_app LOGIN PASSWORD '<from your secret store>';
BEGIN;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'researchiq_app') THEN
        CREATE ROLE researchiq_app NOLOGIN;
    END IF;
END $$;

GRANT USAGE ON SCHEMA public TO researchiq_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO researchiq_app;
REVOKE INSERT, UPDATE, DELETE ON roles FROM researchiq_app;      -- role catalogue is admin-managed
DO $$
BEGIN
    IF to_regclass('public.schema_migrations') IS NOT NULL THEN
        REVOKE ALL ON schema_migrations FROM researchiq_app;
    END IF;
END $$;
GRANT EXECUTE ON FUNCTION get_paper_statistics(uuid) TO researchiq_app;
COMMIT;
