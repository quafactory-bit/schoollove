-- DB-local expiry avoids sending data or credentials to an external scheduler.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
GRANT USAGE ON SCHEMA cron TO postgres;
DO $$ BEGIN
  IF to_regprocedure('public.run_privacy_retention_cleanup()') IS NULL THEN
    RAISE EXCEPTION 'PRIVACY_RETENTION_CLEANUP_MISSING';
  END IF;
  IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='schoollove-privacy-retention') THEN
    RAISE EXCEPTION 'PRIVACY_RETENTION_SCHEDULE_COLLISION';
  END IF;
END $$;
SELECT cron.schedule('schoollove-privacy-retention','*/5 * * * *',
  $job$SET statement_timeout='30s'; SELECT public.run_privacy_retention_cleanup();
  DELETE FROM cron.job_run_details WHERE jobid IN (
    SELECT jobid FROM cron.job WHERE jobname='schoollove-privacy-retention'
  ) AND end_time<now()-interval '7 days';$job$);
COMMIT;
