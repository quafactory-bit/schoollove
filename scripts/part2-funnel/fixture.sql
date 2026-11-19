-- Disposable offline database fixtures, never apply to a remote database.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
 $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE public.schools(id uuid PRIMARY KEY,school_name text,slug text);
INSERT INTO public.schools VALUES
 ('00000000-0000-4000-8000-000000000011','Fixture A','fixture-a'),
 ('00000000-0000-4000-8000-000000000012','Fixture B','fixture-b');
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
GRANT SELECT ON public.schools TO anon,authenticated,service_role;
CREATE TABLE public.adult_eligibility_records(user_id uuid,policy_version text,school_membership_first_created_at timestamptz,PRIMARY KEY(user_id,policy_version));
INSERT INTO public.adult_eligibility_records(user_id,policy_version)
SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'phase10b-2026-07-28' FROM generate_series(1,4)n;
CREATE TABLE public.fixture_memberships(id uuid DEFAULT gen_random_uuid(),owner_user_id uuid,school_id uuid,year integer);
-- Stand-in for the unchanged owner RPC. Test Part2's delegation/serialization/
-- error isolation here; the original owner's real policy tests remain unchanged.
CREATE FUNCTION public.add_own_school_membership_with_roster(uuid,integer,jsonb,boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE saved public.fixture_memberships;
BEGIN
 IF auth.uid() IS NULL OR $2<1950 THEN RAISE EXCEPTION 'OWNER_REJECTED'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
 IF auth.uid()='00000000-0000-4000-8000-000000000003'::uuid THEN PERFORM pg_sleep(1); END IF;
 INSERT INTO public.fixture_memberships(owner_user_id,school_id,year) VALUES(auth.uid(),$1,$2) RETURNING * INTO saved;
 UPDATE public.adult_eligibility_records SET school_membership_first_created_at=clock_timestamp()
 WHERE user_id=auth.uid() AND school_membership_first_created_at IS NULL;
 RETURN jsonb_build_object('id',saved.id,'roster_visible',$4);
END $$;
REVOKE ALL ON FUNCTION public.add_own_school_membership_with_roster(uuid,integer,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_own_school_membership_with_roster(uuid,integer,jsonb,boolean) TO authenticated,service_role;
