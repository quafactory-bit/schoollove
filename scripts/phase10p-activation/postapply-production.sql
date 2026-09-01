DO $$ BEGIN
  IF (SELECT count(*) FROM public.public_account_launch_control)<>1
    OR EXISTS((SELECT * FROM public.public_account_launch_control EXCEPT SELECT * FROM public.phase10p_launch_before)
      UNION ALL (SELECT * FROM public.phase10p_launch_before EXCEPT SELECT * FROM public.public_account_launch_control))
    OR (SELECT count(*) FROM public.public_account_launch_audit)<>(SELECT count FROM public.phase10p_audit_before)
  THEN RAISE EXCEPTION 'PHASE10P_VALID_SINGLETON_MUTATED'; END IF;
END $$;
DROP TABLE public.phase10p_launch_before,public.phase10p_audit_before;
SELECT 'PHASE10P_PRODUCTION_VALID_SINGLETON_PRESERVED_OK' AS status;
