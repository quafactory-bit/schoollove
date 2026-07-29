\set ON_ERROR_STOP on
DO $$
DECLARE table_name text; function_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['payment_transactions','payment_webhook_events','payment_refund_attempts','payment_document_requests'] LOOP
    IF has_table_privilege('anon','public.'||table_name,'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'anon privilege leak on %',table_name; END IF;
    IF has_table_privilege('authenticated','public.'||table_name,'INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'authenticated mutation leak on %',table_name; END IF;
    IF NOT has_table_privilege('service_role','public.'||table_name,'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'service role missing on %',table_name; END IF;
  END LOOP;
  FOREACH function_name IN ARRAY ARRAY['create_payment_attempt','update_payment_attempt_status','confirm_verified_payment','register_payment_webhook_event','finish_payment_webhook_event','admin_retry_payment_webhook','reserve_provider_refund','complete_provider_refund','request_payment_document'] LOOP
    IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=function_name AND has_function_privilege('authenticated',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'authenticated privileged RPC leak on %',function_name; END IF;
  END LOOP;
END $$;
SELECT 'PHASE10G_PAYMENT_PERMISSIONS_OK' AS status;
