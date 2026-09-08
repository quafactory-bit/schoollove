-- Disposable-only persistent fixture for a two-session race.
INSERT INTO public.beta_programs(id,program_key,name,status,starts_at,ends_at,operational_max_users)
VALUES('e9000000-0000-4000-8000-000000000001','capacity_race','Synthetic capacity race','active',now()-interval '1 day',now()+interval '13 days',1);
