DO $setup$
DECLARE
  program_uuid uuid := '10000000-0000-4000-8000-000000000001';
  target_school uuid;
  actor uuid;
  account_id uuid;
  identity_id uuid;
  broker text;
BEGIN
  SELECT schools.school_id INTO target_school
  FROM public.beta_program_schools schools
  WHERE schools.program_id=program_uuid;
  FOR position IN 2..4 LOOP
    actor:=('20000000-0000-4000-8000-'||lpad(position::text,12,'0'))::uuid;
    account_id:=('21000000-0000-4000-8000-'||lpad(position::text,12,'0'))::uuid;
    identity_id:=('22000000-0000-4000-8000-'||lpad(position::text,12,'0'))::uuid;
    broker:='slb:v1:k01:google:'||repeat(chr(64+position),43);
    INSERT INTO auth.users(id,email) VALUES(actor,NULL) ON CONFLICT(id) DO NOTHING;
    INSERT INTO auth.identities(id,user_id,provider_id,provider,identity_data)
    VALUES(identity_id,actor,broker,'custom:schoollove-google',jsonb_build_object('sub',broker));
    INSERT INTO private.private_accounts(id,auth_user_id,status,primary_provider,primary_broker_subject)
    VALUES(account_id,actor,'provisional','google',broker);
    INSERT INTO private.social_identity_registry(
      broker_subject,provider,subject_digest,subject_key_version,account_id,auth_user_id,status
    ) VALUES(broker,'google',decode(repeat(lpad(position::text,2,'0'),32),'hex'),1,account_id,actor,'provisional');
  END LOOP;
  INSERT INTO public.beta_invites(id,program_id,token_hash,max_uses,use_count,expires_at,created_by) VALUES
    ('30000000-0000-4000-8000-000000000002',program_uuid,repeat('b',64),1,0,now()+interval '1 day','local-test'),
    ('30000000-0000-4000-8000-000000000003',program_uuid,repeat('c',64),1,0,now()+interval '1 day','local-test');

  IF public.claim_beta_invite_for_onboarding(
    '20000000-0000-4000-8000-000000000004',repeat('c',64),NULL,NULL
  )<>'ONBOARDING_CLAIMED' THEN RAISE EXCEPTION 'FINALIZE_RACE_CLAIM_SETUP_FAILED'; END IF;
  PERFORM set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000004',true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM public.admin_complete_own_adult_eligibility(
    '20000000-0000-4000-8000-000000000004','phase10b-2026-07-28'
  );
  PERFORM public.record_own_required_consents('phase10b-2026-07-28');
  PERFORM public.upsert_own_private_profile('Concurrency Owner',NULL,NULL);
  PERFORM public.add_own_school_membership_with_class_history(target_school,2020,'[]'::jsonb);
END
$setup$;
