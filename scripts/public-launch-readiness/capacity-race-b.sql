BEGIN;
INSERT INTO public.beta_invites(program_id,token_hash,max_uses,expires_at,created_by)
VALUES('e9000000-0000-4000-8000-000000000001',repeat('e',64),1,now()+interval '1 day','local-race');
SELECT pg_sleep(2);
COMMIT;
