CREATE TABLE public.phase10p_launch_before AS SELECT * FROM public.public_account_launch_control;
CREATE TABLE public.phase10p_audit_before AS SELECT count(*) AS count FROM public.public_account_launch_audit;
