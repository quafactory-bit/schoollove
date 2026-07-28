\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION public.phase10c_assert(condition boolean, message text)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF condition IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'PHASE10C_ASSERT: %', message;
  END IF;
END;
$$;

DO $$
DECLARE
  user_a constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  user_b constant uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  user_c constant uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  school_id constant uuid := '11111111-1111-4111-8111-111111111111';
  profile_a uuid;
  profile_b uuid;
  profile_c uuid;
  membership_a uuid;
  membership_b uuid;
  membership_c uuid;
  match_result record;
  request_result record;
  response_result record;
  request_ab uuid;
  request_ac uuid;
  connection_ab uuid;
  connection_ac uuid;
  message_ac uuid;
  affected integer;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (user_a, 'test_a@example.invalid'),
    (user_b, 'test_b@example.invalid'),
    (user_c, 'test_c@example.invalid');
  INSERT INTO public.schools (id, school_name) VALUES (school_id, 'TEST SCHOOL');

  INSERT INTO public.adult_eligibility_records
    (user_id, adult_eligible, verification_method, policy_version)
  SELECT id, true, 'self_attestation', 'phase10b-2026-07-28' FROM auth.users;
  INSERT INTO public.consent_records (user_id, consent_type, consented, policy_version)
  SELECT u.id, required_type, true, 'phase10b-2026-07-28'
  FROM auth.users u
  CROSS JOIN unnest(ARRAY['terms','privacy_collection','adult_confirmation','private_by_default']) required_type;

  INSERT INTO public.private_profiles (owner_user_id, display_name)
  VALUES (user_a, 'TEST_A') RETURNING id INTO profile_a;
  INSERT INTO public.private_profiles (owner_user_id, display_name)
  VALUES (user_b, 'TEST_B') RETURNING id INTO profile_b;
  INSERT INTO public.private_profiles (owner_user_id, display_name)
  VALUES (user_c, 'TEST_C') RETURNING id INTO profile_c;

  INSERT INTO public.profile_school_memberships (profile_id, owner_user_id, school_id, graduation_year)
  VALUES (profile_a, user_a, school_id, 2000) RETURNING id INTO membership_a;
  INSERT INTO public.profile_school_memberships (profile_id, owner_user_id, school_id, graduation_year)
  VALUES (profile_b, user_b, school_id, 2000) RETURNING id INTO membership_b;
  INSERT INTO public.profile_school_memberships (profile_id, owner_user_id, school_id, graduation_year)
  VALUES (profile_c, user_c, school_id, 2000) RETURNING id INTO membership_c;

  SELECT * INTO match_result FROM public.find_exact_private_profile_match(user_a, school_id, 2000, 'TEST_B');
  PERFORM public.phase10c_assert(match_result.match_state = 'match_available' AND match_result.match_token IS NOT NULL, 'exact match token');
  PERFORM public.phase10c_assert(
    NOT EXISTS (SELECT 1 FROM public.connection_match_tokens WHERE id = match_result.match_token),
    'raw opaque token is not stored'
  );

  SELECT * INTO request_result FROM public.create_connection_request(user_a, match_result.match_token, 'same_school', '안녕하세요');
  request_ab := request_result.request_id;
  PERFORM public.phase10c_assert(request_result.created AND request_result.request_state = 'pending', 'first request');
  PERFORM public.phase10c_assert(NOT public.remind_connection_request(user_a, request_ab), 'reminder before seven days');

  SELECT * INTO match_result FROM public.find_exact_private_profile_match(user_b, school_id, 2000, 'TEST_A');
  PERFORM public.phase10c_assert(match_result.match_state = 'already_requested', 'reverse duplicate request');

  SELECT * INTO response_result FROM public.respond_connection_request(user_b, request_ab, 'accept', NULL);
  connection_ab := response_result.connection_id;
  PERFORM public.phase10c_assert(response_result.handled AND response_result.request_state = 'accepted', 'accept creates connection');
  PERFORM public.phase10c_assert(public.send_connection_message(user_a, extensions.gen_random_uuid(), '연결 전') IS NULL, 'message without connection');
  PERFORM public.phase10c_assert(public.send_connection_message(user_a, connection_ab, 'https:' || chr(8203) || '//example.com') IS NULL, 'zero-width contact blocked');
  PERFORM public.phase10c_assert(public.send_connection_message(user_a, connection_ab, '반가워요') IS NOT NULL, 'message after accept');
  PERFORM public.phase10c_assert(public.mark_connection_messages_read(user_b, connection_ab) = 1, 'recipient read only');
  PERFORM public.phase10c_assert(public.set_connection_instagram_permission(user_a, connection_ab, true), 'Instagram approval');
  PERFORM public.phase10c_assert(public.set_connection_instagram_permission(user_a, connection_ab, false), 'Instagram revoke');
  PERFORM public.phase10c_assert(NOT public.set_connection_instagram_permission(user_a, connection_ab, false), 'duplicate revoke rejected');

  INSERT INTO public.connection_requests (
    sender_user_id, receiver_user_id, target_school_membership_id, relationship_type, message, sent_at
  ) VALUES (user_a, user_c, membership_c, 'same_school', '오랜만이에요', now() - interval '8 days')
  RETURNING id INTO request_ac;
  PERFORM public.phase10c_assert(public.remind_connection_request(user_a, request_ac), 'first reminder after seven days');
  PERFORM public.phase10c_assert(NOT public.remind_connection_request(user_a, request_ac), 'second reminder rejected');
  SELECT * INTO response_result FROM public.respond_connection_request(user_c, request_ac, 'accept', NULL);
  connection_ac := response_result.connection_id;
  message_ac := public.send_connection_message(user_c, connection_ac, '신고 검증 메시지');
  PERFORM public.phase10c_assert(message_ac IS NOT NULL, 'second connection message');
  PERFORM public.phase10c_assert(NOT public.report_connection_safety(user_a, connection_ac, public.send_connection_message(user_a, connection_ac, '내 메시지'), 'spam'), 'own message cannot be reported');
  PERFORM public.phase10c_assert(public.report_connection_safety(user_a, connection_ac, message_ac, 'spam'), 'report blocks and ends connection');
  PERFORM public.phase10c_assert(public.send_connection_message(user_c, connection_ac, '차단 뒤 메시지') IS NULL, 'message after report');
  PERFORM public.phase10c_assert(
    EXISTS (SELECT 1 FROM public.user_blocks WHERE blocker_user_id = user_a AND blocked_user_id = user_c),
    'report creates block'
  );
  PERFORM public.phase10c_assert(
    NOT EXISTS (SELECT 1 FROM public.connection_instagram_permissions WHERE connection_id = connection_ac AND status = 'active'),
    'report revokes Instagram'
  );

  BEGIN
    UPDATE public.connection_requests SET status = 'declined' WHERE id = request_ab;
    RAISE EXCEPTION 'terminal request mutation unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'terminal request mutation unexpectedly succeeded' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE public.connection_messages SET message = '변경' WHERE id = message_ac;
    RAISE EXCEPTION 'message mutation unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'message mutation unexpectedly succeeded' THEN RAISE; END IF;
  END;

  PERFORM public.phase10c_assert(NOT has_table_privilege('anon', 'public.connection_requests', 'SELECT'), 'anon select grant');
  PERFORM public.phase10c_assert(NOT has_table_privilege('authenticated', 'public.connection_messages', 'INSERT'), 'authenticated direct message write');
  PERFORM public.phase10c_assert(NOT has_table_privilege('authenticated', 'public.notifications', 'UPDATE'), 'authenticated notification mutation');

  INSERT INTO public.user_blocks (blocker_user_id, blocked_user_id) VALUES (user_b, user_c) ON CONFLICT DO NOTHING;
  BEGIN
    INSERT INTO public.user_blocks (blocker_user_id, blocked_user_id) VALUES (user_a, user_b);
    RAISE EXCEPTION 'rollback_probe';
  EXCEPTION WHEN raise_exception THEN
    NULL;
  END;
  PERFORM public.phase10c_assert(
    NOT EXISTS (SELECT 1 FROM public.user_blocks WHERE blocker_user_id = user_a AND blocked_user_id = user_b),
    'subtransaction rollback'
  );

  DELETE FROM auth.users WHERE id = user_c;
  GET DIAGNOSTICS affected = ROW_COUNT;
  PERFORM public.phase10c_assert(affected = 1, 'user deletion FK boundary');
END;
$$;

SELECT public.phase10c_assert(count(*) = 9, 'nine PHASE 10C private tables')
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN (
  'connection_match_tokens','connection_requests','connections','connection_messages',
  'user_blocks','safety_reports','connection_instagram_permissions','notifications',
  'safety_account_restrictions'
);

SELECT public.phase10c_assert(count(*) = 9, 'RLS and FORCE RLS')
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN (
  'connection_match_tokens','connection_requests','connections','connection_messages',
  'user_blocks','safety_reports','connection_instagram_permissions','notifications',
  'safety_account_restrictions'
) AND c.relrowsecurity AND c.relforcerowsecurity;

DROP FUNCTION public.phase10c_assert(boolean, text);
