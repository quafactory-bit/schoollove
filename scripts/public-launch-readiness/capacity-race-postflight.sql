DO $$ BEGIN
  IF (SELECT count(*) FROM public.beta_invites WHERE program_id='e9000000-0000-4000-8000-000000000001')<>1
    OR private.beta_operational_occupancy('e9000000-0000-4000-8000-000000000001')<>1
  THEN RAISE EXCEPTION 'CONCURRENT_CAP_OVERRUN'; END IF;
  RAISE NOTICE 'PASS: concurrent reservations have exactly one winner';
END $$;
DELETE FROM public.beta_programs WHERE id='e9000000-0000-4000-8000-000000000001';
