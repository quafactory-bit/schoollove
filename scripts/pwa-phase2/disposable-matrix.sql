-- Run only in the disposable PWA Phase 2 database.
BEGIN;

DO $$
DECLARE
  actor uuid := 'a1000000-0000-4000-8000-000000000001';
  cascade_actor uuid := 'a2000000-0000-4000-8000-000000000001';
  result boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'push_subscriptions'
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'push_subscriptions RLS boundary missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'push_subscriptions'
  ) THEN
    RAISE EXCEPTION 'push_subscriptions must not expose client policies';
  END IF;

  IF has_table_privilege('anon', 'public.push_subscriptions', 'SELECT')
     OR has_table_privilege('authenticated', 'public.push_subscriptions', 'SELECT')
     OR has_table_privilege('authenticated', 'public.push_subscriptions', 'INSERT')
     OR has_table_privilege('authenticated', 'public.push_subscriptions', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.push_subscriptions', 'DELETE') THEN
    RAISE EXCEPTION 'client table privilege boundary is open';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.push_subscriptions', 'SELECT, INSERT, UPDATE, DELETE') THEN
    RAISE EXCEPTION 'service role CRUD grant missing';
  END IF;

  INSERT INTO auth.users(id) VALUES (actor), (cascade_actor);
  INSERT INTO public.push_subscriptions(user_id, endpoint, p256dh, auth)
  VALUES
    (actor, 'https://push.local/withdrawal', 'p256dh-a', 'auth-a'),
    (cascade_actor, 'https://push.local/cascade', 'p256dh-b', 'auth-b');

  PERFORM set_config('request.jwt.claim.sub', actor::text, true);
  SELECT public.request_own_account_deletion() INTO result;
  IF result IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'withdrawal RPC did not succeed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.push_subscriptions WHERE user_id = actor) THEN
    RAISE EXCEPTION 'withdrawal RPC retained a push subscription';
  END IF;

  DELETE FROM auth.users WHERE id = cascade_actor;
  IF EXISTS (SELECT 1 FROM public.push_subscriptions WHERE user_id = cascade_actor) THEN
    RAISE EXCEPTION 'Auth cascade retained a push subscription';
  END IF;
END;
$$;

ROLLBACK;
