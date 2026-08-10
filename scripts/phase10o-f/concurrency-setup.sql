\set ON_ERROR_STOP on
INSERT INTO auth.users(id,email) VALUES
('82000000-0000-4000-8000-000000000001','race-one@example.invalid'),
('82000000-0000-4000-8000-000000000002','race-two@example.invalid'),
('82000000-0000-4000-8000-000000000003','race-three@example.invalid') ON CONFLICT DO NOTHING;
SELECT public.create_provisional_social_account('kakao','slb:v1:k01:kakao:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',decode(repeat('1',64),'hex'),1);
SELECT public.create_provisional_social_account('naver','slb:v1:k01:naver:fffffffffffffffffffffffffffffffffffffffffff',decode(repeat('2',64),'hex'),1);
SELECT public.bind_social_auth_principal(id,'82000000-0000-4000-8000-000000000001') FROM private.private_accounts WHERE primary_provider='kakao';
SELECT public.bind_social_auth_principal(id,'82000000-0000-4000-8000-000000000002') FROM private.private_accounts WHERE primary_provider='naver';
SELECT public.create_recovery_email_verification(id,'activation',decode(repeat('a',64),'hex'),1,decode(repeat('1',96),'hex'),decode(repeat('2',24),'hex'),1,decode(repeat('3',64),'hex'),1) FROM private.private_accounts WHERE primary_provider='kakao';
SELECT public.create_recovery_email_verification(id,'activation',decode(repeat('a',64),'hex'),1,decode(repeat('4',96),'hex'),decode(repeat('2',24),'hex'),1,decode(repeat('3',64),'hex'),1) FROM private.private_accounts WHERE primary_provider='naver';
SELECT public.create_provisional_social_account('google','slb:v1:k01:google:ggggggggggggggggggggggggggggggggggggggggggg',decode(repeat('4',64),'hex'),1);
SELECT public.bind_social_auth_principal(id,'82000000-0000-4000-8000-000000000003') FROM private.private_accounts WHERE primary_provider='google';
SELECT public.create_recovery_email_verification(id,'activation',decode(repeat('b',64),'hex'),1,decode(repeat('5',96),'hex'),decode(repeat('2',24),'hex'),1,decode(repeat('3',64),'hex'),1) FROM private.private_accounts WHERE primary_provider='google';
