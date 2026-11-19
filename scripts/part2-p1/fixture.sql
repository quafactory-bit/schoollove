-- Disposable local fixture for Part 2 P1 (no remote data). Stubs only the columns the new functions read.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
END $$;
CREATE TABLE public.schools(id uuid PRIMARY KEY, school_name text NOT NULL, slug text NOT NULL);
CREATE TABLE public.private_profiles(id uuid, owner_user_id uuid, display_name text, status text, profile_visibility text DEFAULT 'private', PRIMARY KEY(id, owner_user_id));
CREATE TABLE public.profile_school_memberships(id uuid PRIMARY KEY, profile_id uuid, owner_user_id uuid, school_id uuid, graduation_year integer, created_at timestamptz DEFAULT now());
CREATE TABLE public.school_roster_consents(membership_id uuid PRIMARY KEY, owner_user_id uuid, consented_at timestamptz DEFAULT now(), withdrawn_at timestamptz);
CREATE TABLE public.part2_daily_funnel(metric_date date, event_key text, source_channel text, browser_context text, school_id uuid, event_count bigint);
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;

INSERT INTO public.schools VALUES
 ('a0000000-0000-4000-8000-000000000001','서울서초고등학교','seocho-high'),
 ('a0000000-0000-4000-8000-000000000002','부산중학교','busan-middle'),
 ('a0000000-0000-4000-8000-000000000003','빈초등학교','empty-elem');
-- u1 김민수, u2 " 이 준 ", u3 남궁민수, u4 withdrawn, u5 inactive, u6 one char, u7 old consent at another school
INSERT INTO public.private_profiles(id,owner_user_id,display_name,status) VALUES
 ('b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','김민수','active'),
 ('b0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000002',' 이 준 ','active'),
 ('b0000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-000000000003','남궁민수','active'),
 ('b0000000-0000-4000-8000-000000000004','c0000000-0000-4000-8000-000000000004','탈퇴자','active'),
 ('b0000000-0000-4000-8000-000000000005','c0000000-0000-4000-8000-000000000005','비활성','deleted'),
 ('b0000000-0000-4000-8000-000000000006','c0000000-0000-4000-8000-000000000006','진','active'),
 ('b0000000-0000-4000-8000-000000000007','c0000000-0000-4000-8000-000000000007','오래된','active');
INSERT INTO public.profile_school_memberships(id,profile_id,owner_user_id,school_id,graduation_year)
SELECT ('d0000000-0000-4000-8000-00000000000'||n)::uuid, ('b0000000-0000-4000-8000-00000000000'||n)::uuid, ('c0000000-0000-4000-8000-00000000000'||n)::uuid,
       CASE WHEN n=7 THEN 'a0000000-0000-4000-8000-000000000002'::uuid ELSE 'a0000000-0000-4000-8000-000000000001'::uuid END, 2005
FROM generate_series(1,7) n;
INSERT INTO public.school_roster_consents(membership_id,owner_user_id,consented_at,withdrawn_at)
SELECT ('d0000000-0000-4000-8000-00000000000'||n)::uuid, ('c0000000-0000-4000-8000-00000000000'||n)::uuid,
       CASE WHEN n=7 THEN now() - interval '30 days' ELSE now() - (n||' hours')::interval END,
       CASE WHEN n=4 THEN now() ELSE NULL END
FROM generate_series(1,7) n;
INSERT INTO public.part2_daily_funnel VALUES
 ((now() AT TIME ZONE 'Asia/Seoul')::date,'school_result_selected','direct','external','a0000000-0000-4000-8000-000000000001',5),
 ((now() AT TIME ZONE 'Asia/Seoul')::date,'school_result_selected','threads','threads','a0000000-0000-4000-8000-000000000002',2),
 ((now() AT TIME ZONE 'Asia/Seoul')::date - 10,'school_result_selected','direct','external','a0000000-0000-4000-8000-000000000003',99);
