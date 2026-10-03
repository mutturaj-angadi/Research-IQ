BEGIN;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM researchiq_app;
REVOKE USAGE ON SCHEMA public FROM researchiq_app;
DROP ROLE IF EXISTS researchiq_app;
COMMIT;
