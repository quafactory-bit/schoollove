BEGIN;

-- Immutable first-contribution authority. Existing memberships are seen, XP=0.
-- Keys are one-way pseudonyms; no profile, class, email or display name retained.
CREATE TABLE private.school_growth_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  contributor_key text NOT NULL,
  principal_key text NOT NULL,
  base_xp integer NOT NULL CHECK (base_xp IN (0,100)),
  referral_xp integer NOT NULL DEFAULT 0 CHECK (referral_xp IN (0,50)),
  created_at timestamptz NOT NULL DEFAULT now(),
  batch_id uuid,
  UNIQUE (school_id,contributor_key)
);
CREATE UNIQUE INDEX school_growth_one_referral_reward
  ON private.school_growth_contributions(principal_key) WHERE referral_xp=50;
CREATE INDEX school_growth_pending ON private.school_growth_contributions(school_id,created_at)
  WHERE batch_id IS NULL AND base_xp=100;
CREATE INDEX school_growth_principal ON private.school_growth_contributions(principal_key);

CREATE TABLE private.school_growth_states (
  school_id uuid PRIMARY KEY REFERENCES public.schools(id),
  xp bigint NOT NULL DEFAULT 0 CHECK (xp>=0),
  current_level integer NOT NULL DEFAULT 1 CHECK (current_level>=1),
  last_growth_at timestamptz, last_level_up_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private.school_growth_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  contribution_id uuid NOT NULL REFERENCES private.school_growth_contributions(id),
  event_type text NOT NULL CHECK (event_type IN ('growth_awarded','referral_bonus','level_up')),
  level_after integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(contribution_id,event_type)
);
CREATE TABLE private.school_growth_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  xp_delta bigint NOT NULL CHECK(xp_delta>0),
  cumulative_xp bigint NOT NULL CHECK(cumulative_xp>=xp_delta),
  level_after integer NOT NULL,
  level_up boolean NOT NULL,
  publish_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX school_growth_batches_publication ON private.school_growth_batches(publish_at,school_id);
ALTER TABLE private.school_growth_contributions ADD CONSTRAINT school_growth_contribution_batch_fk
  FOREIGN KEY (batch_id) REFERENCES private.school_growth_batches(id);
CREATE INDEX school_growth_contribution_batch ON private.school_growth_contributions(batch_id);
CREATE INDEX school_growth_events_school ON private.school_growth_events(school_id,created_at);

CREATE TABLE private.school_growth_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  inviter_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days'
);
CREATE INDEX school_growth_referral_owner ON private.school_growth_referrals(inviter_user_id,created_at);
CREATE INDEX school_growth_referral_school ON private.school_growth_referrals(school_id);
CREATE TABLE private.school_growth_visits (
  visit_hash text PRIMARY KEY,
  referral_id uuid NOT NULL REFERENCES private.school_growth_referrals(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  bound_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX school_growth_visits_expiry ON private.school_growth_visits(expires_at);
CREATE INDEX school_growth_visits_referral ON private.school_growth_visits(referral_id);
CREATE INDEX school_growth_visits_owner ON private.school_growth_visits(bound_user_id);
CREATE TABLE private.school_growth_attributions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_id uuid NOT NULL REFERENCES private.school_growth_referrals(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz
);
CREATE INDEX school_growth_attribution_referral ON private.school_growth_attributions(referral_id);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['school_growth_contributions','school_growth_states','school_growth_events',
    'school_growth_batches','school_growth_referrals','school_growth_visits','school_growth_attributions'] LOOP
    EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE private.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON private.%I FROM PUBLIC,anon,authenticated',t);
    EXECUTE format('GRANT SELECT ON private.%I TO service_role',t);
  END LOOP;
END $$;

CREATE FUNCTION private.school_growth_key(value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path='' AS $$
  SELECT encode(extensions.digest(value,'sha256'),'hex')
$$;
REVOKE ALL ON FUNCTION private.school_growth_key(text) FROM PUBLIC,anon,authenticated;

-- Same integer threshold contract as lib/policy/levelPolicy.ts.
CREATE FUNCTION private.school_growth_level(value bigint) RETURNS integer
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path='' AS $$
DECLARE lo integer:=1; hi integer:=2; mid integer;
BEGIN
  WHILE round(50*power(hi::numeric,1.5))<=value LOOP hi:=hi*2; END LOOP;
  WHILE lo+1<hi LOOP
    mid:=(lo+hi)/2;
    IF round(50*power(mid::numeric,1.5))<=value THEN lo:=mid; ELSE hi:=mid; END IF;
  END LOOP;
  RETURN lo;
END $$;
REVOKE ALL ON FUNCTION private.school_growth_level(bigint) FROM PUBLIC,anon,authenticated;

INSERT INTO private.school_growth_contributions(school_id,contributor_key,principal_key,base_xp)
SELECT DISTINCT school_id,private.school_growth_key(owner_user_id::text||':'||school_id::text),
  private.school_growth_key(owner_user_id::text),0 FROM public.profile_school_memberships;
INSERT INTO private.school_growth_states(school_id)
SELECT DISTINCT school_id FROM public.profile_school_memberships;

CREATE FUNCTION private.award_school_membership_growth() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid; bonus integer:=0; old_level integer; new_level integer; live_xp bigint;
  attr private.school_growth_attributions%ROWTYPE; ref private.school_growth_referrals%ROWTYPE;
  batch uuid; batch_xp bigint; prior_xp bigint; prior_level integer; pending_count integer;
BEGIN
  -- Serialize cross-school requests for the same owner, then the school total.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.owner_user_id::text,91));
  INSERT INTO private.school_growth_states(school_id) VALUES(NEW.school_id) ON CONFLICT DO NOTHING;
  SELECT current_level INTO old_level FROM private.school_growth_states WHERE school_id=NEW.school_id FOR UPDATE;
  INSERT INTO private.school_growth_contributions(school_id,contributor_key,principal_key,base_xp)
    VALUES(NEW.school_id,private.school_growth_key(NEW.owner_user_id::text||':'||NEW.school_id::text),
      private.school_growth_key(NEW.owner_user_id::text),100)
    ON CONFLICT(school_id,contributor_key) DO NOTHING RETURNING id INTO c;
  IF c IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO attr FROM private.school_growth_attributions WHERE user_id=NEW.owner_user_id FOR UPDATE;
  IF FOUND AND attr.consumed_at IS NULL THEN
    SELECT * INTO ref FROM private.school_growth_referrals WHERE id=attr.referral_id;
    IF ref.school_id=NEW.school_id AND ref.inviter_user_id<>NEW.owner_user_id AND ref.expires_at>now()
      AND EXISTS(SELECT 1 FROM public.profile_school_memberships WHERE owner_user_id=ref.inviter_user_id AND school_id=NEW.school_id)
      AND NOT EXISTS(SELECT 1 FROM private.school_growth_contributions
        WHERE principal_key=private.school_growth_key(NEW.owner_user_id::text) AND referral_xp=50) THEN
      bonus:=50;
      UPDATE private.school_growth_contributions SET referral_xp=50 WHERE id=c;
      UPDATE private.school_growth_attributions SET consumed_at=now() WHERE user_id=NEW.owner_user_id;
    END IF;
  END IF;
  UPDATE private.school_growth_states SET xp=xp+100+bonus,last_growth_at=now(),updated_at=now()
    WHERE school_id=NEW.school_id RETURNING xp INTO live_xp;
  new_level:=private.school_growth_level(live_xp);
  UPDATE private.school_growth_states SET current_level=new_level,
    last_level_up_at=CASE WHEN new_level>old_level THEN now() ELSE last_level_up_at END
    WHERE school_id=NEW.school_id;
  INSERT INTO private.school_growth_events(school_id,contribution_id,event_type,level_after)
    VALUES(NEW.school_id,c,'growth_awarded',new_level);
  IF bonus=50 THEN INSERT INTO private.school_growth_events(school_id,contribution_id,event_type,level_after)
    VALUES(NEW.school_id,c,'referral_bonus',new_level); END IF;
  IF new_level>old_level THEN INSERT INTO private.school_growth_events(school_id,contribution_id,event_type,level_after)
    VALUES(NEW.school_id,c,'level_up',new_level); END IF;

  -- Publish only a full cohort, at the next UTC day boundary. No GET side effects.
  SELECT count(*),sum(base_xp+referral_xp) INTO pending_count,batch_xp
    FROM private.school_growth_contributions WHERE school_id=NEW.school_id AND base_xp=100 AND batch_id IS NULL;
  IF pending_count>=10 THEN
    SELECT coalesce(sum(xp_delta),0) INTO prior_xp FROM private.school_growth_batches WHERE school_id=NEW.school_id;
    prior_level:=private.school_growth_level(prior_xp);
    INSERT INTO private.school_growth_batches(school_id,xp_delta,cumulative_xp,level_after,level_up,publish_at)
      VALUES(NEW.school_id,batch_xp,prior_xp+batch_xp,private.school_growth_level(prior_xp+batch_xp),
        private.school_growth_level(prior_xp+batch_xp)>prior_level,
        (date_trunc('day',now() AT TIME ZONE 'UTC')+interval '1 day') AT TIME ZONE 'UTC') RETURNING id INTO batch;
    UPDATE private.school_growth_contributions SET batch_id=batch
      WHERE school_id=NEW.school_id AND base_xp=100 AND batch_id IS NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.award_school_membership_growth() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER school_membership_growth_award AFTER INSERT ON public.profile_school_memberships
  FOR EACH ROW EXECUTE FUNCTION private.award_school_membership_growth();

CREATE FUNCTION public.get_school_growth_game(requested_school_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH totals AS (
    SELECT school_id,sum(xp_delta)::bigint AS xp,
      coalesce(sum(xp_delta) FILTER(WHERE publish_at>now()-interval '7 days'),0)::bigint AS weekly,
      max(publish_at) FILTER(WHERE level_up) AS last_up
    FROM private.school_growth_batches WHERE publish_at<=now() GROUP BY school_id
  ), ranked AS (
    SELECT school_id,rank() OVER(ORDER BY weekly DESC) AS place FROM totals WHERE weekly>0
  ), chosen AS (
    SELECT s.id,s.school_name,s.slug,coalesce(t.xp,0) AS xp,coalesce(t.weekly,0) AS weekly,
      r.place,t.last_up,private.school_growth_level(coalesce(t.xp,0)) AS level
    FROM public.schools s LEFT JOIN totals t ON t.school_id=s.id LEFT JOIN ranked r ON r.school_id=s.id
    WHERE (requested_school_id IS NOT NULL AND s.id=requested_school_id)
      OR (requested_school_id IS NULL AND t.weekly>0)
    ORDER BY t.weekly DESC NULLS LAST,s.id LIMIT 5
  ) SELECT coalesce(jsonb_agg(jsonb_build_object(
    'schoolId',id,'schoolName',school_name,'slug',slug,'level',level,
    'progress',floor(100*(xp-CASE WHEN level=1 THEN 0 ELSE round(50*power(level::numeric,1.5)) END)/
      (round(50*power((level+1)::numeric,1.5))-CASE WHEN level=1 THEN 0 ELSE round(50*power(level::numeric,1.5)) END)),
    'weeklyXp',weekly,'rank',place,'lastLevelUp',last_up)), '[]'::jsonb) FROM chosen
$$;
REVOKE ALL ON FUNCTION public.get_school_growth_game(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_school_growth_game(uuid) TO anon,authenticated,service_role;

CREATE FUNCTION public.get_own_school_growth_contribution(requested_school_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('contributed',c.base_xp=100,'xp',c.base_xp+c.referral_xp)
  FROM private.school_growth_contributions c WHERE auth.uid() IS NOT NULL AND c.school_id=requested_school_id
    AND c.contributor_key=private.school_growth_key(auth.uid()::text||':'||requested_school_id::text)
    AND EXISTS(SELECT 1 FROM public.profile_school_memberships m WHERE m.owner_user_id=auth.uid() AND m.school_id=requested_school_id)
$$;
REVOKE ALL ON FUNCTION public.get_own_school_growth_contribution(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_own_school_growth_contribution(uuid) TO authenticated;

CREATE FUNCTION public.create_school_growth_referral(requested_school_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); raw_token text;
BEGIN
  IF actor IS NULL OR NOT public.has_current_adult_access(actor)
    OR NOT public.public_account_access_active(actor)
    OR NOT EXISTS(SELECT 1 FROM public.profile_school_memberships WHERE owner_user_id=actor AND school_id=requested_school_id)
    THEN RAISE EXCEPTION 'GROWTH_REFERRAL_NOT_ALLOWED'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,92));
  IF (SELECT count(*) FROM private.school_growth_referrals WHERE inviter_user_id=actor AND created_at>now()-interval '1 day')>=5
    THEN RAISE EXCEPTION 'GROWTH_REFERRAL_RATE_LIMIT'; END IF;
  raw_token:=encode(extensions.gen_random_bytes(32),'hex');
  INSERT INTO private.school_growth_referrals(school_id,inviter_user_id,token_hash)
    VALUES(requested_school_id,actor,private.school_growth_key(raw_token));
  RETURN jsonb_build_object('token',raw_token,'expiresIn',604800);
END $$;
REVOKE ALL ON FUNCTION public.create_school_growth_referral(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_school_growth_referral(uuid) TO authenticated;

CREATE FUNCTION public.create_school_growth_visit(requested_token text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ref private.school_growth_referrals%ROWTYPE; proof text;
BEGIN
  IF requested_token !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
  SELECT * INTO ref FROM private.school_growth_referrals WHERE token_hash=private.school_growth_key(requested_token)
    AND expires_at>now() AND inviter_user_id IS NOT NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- Cap anonymous records per link. Creates no auth or account data.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(ref.id::text,93));
  IF (SELECT count(*) FROM private.school_growth_visits WHERE referral_id=ref.id)>=100 THEN RETURN NULL; END IF;
  proof:=encode(extensions.gen_random_bytes(32),'hex');
  INSERT INTO private.school_growth_visits(visit_hash,referral_id,expires_at)
    VALUES(private.school_growth_key(proof),ref.id,ref.expires_at);
  RETURN jsonb_build_object('proof',proof,'schoolId',ref.school_id);
END $$;
REVOKE ALL ON FUNCTION public.create_school_growth_visit(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_school_growth_visit(text) TO service_role;

CREATE FUNCTION public.bind_school_growth_visit(requested_proof text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); visit private.school_growth_visits%ROWTYPE;
BEGIN
  IF actor IS NULL OR requested_proof !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
  SELECT * INTO visit FROM private.school_growth_visits WHERE visit_hash=private.school_growth_key(requested_proof) FOR UPDATE;
  IF NOT FOUND OR visit.expires_at<=now() OR (visit.bound_user_id IS NOT NULL AND visit.bound_user_id<>actor)
    OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=actor AND created_at>=visit.created_at)
    OR EXISTS(SELECT 1 FROM private.school_growth_contributions WHERE principal_key=private.school_growth_key(actor::text))
    THEN RETURN false; END IF;
  INSERT INTO private.school_growth_attributions(user_id,referral_id) VALUES(actor,visit.referral_id) ON CONFLICT DO NOTHING;
  UPDATE private.school_growth_visits SET bound_user_id=actor WHERE visit_hash=visit.visit_hash;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.bind_school_growth_visit(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bind_school_growth_visit(text) TO authenticated;

COMMIT;
