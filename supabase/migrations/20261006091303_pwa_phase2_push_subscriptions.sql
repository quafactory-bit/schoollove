-- PWA Phase 2: server-only browser push subscriptions.
-- The public schema is exposed by Supabase, so client roles receive no grants
-- and no RLS policies. Only the backend service role may access these rows.

CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE CHECK (char_length(endpoint) BETWEEN 1 AND 4096 AND endpoint ~ '^https://'),
  p256dh text NOT NULL CHECK (char_length(p256dh) BETWEEN 1 AND 512),
  auth text NOT NULL CHECK (char_length(auth) BETWEEN 1 AND 256),
  user_agent text CHECK (user_agent IS NULL OR char_length(user_agent) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX push_subscriptions_user_id_idx
  ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.push_subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_subscriptions TO service_role;

-- Withdrawal removes every device subscription in the same transaction that
-- records the request. The Auth foreign key is a second deletion boundary.
CREATE OR REPLACE FUNCTION public.request_own_account_deletion()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requester uuid := auth.uid();
  inserted_count integer;
BEGIN
  IF requester IS NULL THEN
    RETURN false;
  END IF;

  DELETE FROM public.push_subscriptions
  WHERE user_id = requester;

  UPDATE public.private_profiles
  SET status = 'deletion_requested', updated_at = clock_timestamp()
  WHERE owner_user_id = requester;

  INSERT INTO public.account_deletion_requests(user_id, reason, status)
  VALUES (requester, NULL, 'pending')
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count = 1 THEN
    PERFORM public.increment_public_account_metric(
      'account_deletion_requested',
      'account',
      'milestone'
    );
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.request_own_account_deletion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_own_account_deletion() TO authenticated;
