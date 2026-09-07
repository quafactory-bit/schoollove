\set ON_ERROR_STOP on
CREATE SCHEMA class_history_audit;
CREATE TABLE class_history_audit.baseline AS
SELECT (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r') tables,
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public') columns,
  (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace) functions,
  pg_get_functiondef('public.find_exact_private_profile_match(uuid,uuid,integer,text)'::regprocedure) exact_definition,
  pg_get_functiondef('public.find_exact_private_profile_class_match(uuid,uuid,integer,integer,integer,text)'::regprocedure) class_definition,
  pg_get_functiondef('public.add_own_school_membership_with_class_history(uuid,integer,jsonb)'::regprocedure) create_definition;
TABLE class_history_audit.baseline \g /dev/null
SELECT tables,columns,functions FROM class_history_audit.baseline;
