-- Durable, secret-free Google callback diagnostic persistence.
BEGIN;

DO $$
BEGIN
  IF to_regclass('private.upstream_login_legs') IS NULL
    OR to_regclass('private.oauth_login_attempts') IS NULL
    OR to_regclass('private.downstream_authorization_transactions') IS NULL
    OR to_regprocedure('public.fail_upstream_login_leg(uuid,uuid,text)') IS NULL
    OR to_regprocedure('private.lock_downstream_authorization_transaction_for_attempt(uuid)') IS NULL
    OR to_regprocedure('private.terminalize_bound_downstream_authorization_transaction(uuid,uuid,text,timestamptz)') IS NULL THEN
    RAISE EXCEPTION 'GOOGLE_CALLBACK_DIAGNOSTIC_BASELINE_MISSING';
  END IF;
  IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='private' AND table_name='upstream_login_legs'
        AND column_name IN ('diagnostic_reason','diagnostic_upstream_status')
    )
    OR to_regprocedure('public.fail_upstream_login_leg_with_diagnostic(uuid,uuid,text,text,integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'GOOGLE_CALLBACK_DIAGNOSTIC_OBJECT_COLLISION';
  END IF;
END $$;

ALTER TABLE private.upstream_login_legs
  ADD COLUMN diagnostic_reason text NULL,
  ADD COLUMN diagnostic_upstream_status integer NULL,
  ADD CONSTRAINT upstream_login_legs_diagnostic_reason_check CHECK (
    diagnostic_reason IS NULL OR diagnostic_reason IN (
      'pkce_resume_failed',
      'token_exchange_transport_failed',
      'token_exchange_http_failed',
      'token_response_malformed',
      'id_token_missing_or_malformed',
      'jwks_fetch_failed',
      'jwks_key_rejected',
      'id_token_signature_failed',
      'issuer_or_audience_failed',
      'token_time_failed',
      'nonce_failed',
      'provider_identity_malformed',
      'verifier_unclassified_failure'
    )
  ),
  ADD CONSTRAINT upstream_login_legs_diagnostic_status_check CHECK (
    diagnostic_upstream_status IS NULL OR diagnostic_upstream_status BETWEEN 100 AND 599
  ),
  ADD CONSTRAINT upstream_login_legs_diagnostic_coherence_check CHECK (
    (diagnostic_reason IS NULL AND diagnostic_upstream_status IS NULL)
    OR (
      diagnostic_reason IS NOT NULL
      AND provider='google'
      AND status IN ('rejected','expired')
      AND terminal_at IS NOT NULL
    )
  );

CREATE FUNCTION private.enforce_upstream_login_leg_diagnostic_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=''
AS $$
BEGIN
  IF OLD.diagnostic_reason IS NOT NULL
    AND (NEW.diagnostic_reason IS DISTINCT FROM OLD.diagnostic_reason
      OR NEW.diagnostic_upstream_status IS DISTINCT FROM OLD.diagnostic_upstream_status) THEN
    RAISE EXCEPTION 'UPSTREAM_LOGIN_LEG_DIAGNOSTIC_IMMUTABLE';
  END IF;
  IF OLD.diagnostic_reason IS NULL AND NEW.diagnostic_reason IS NOT NULL
    AND NOT (OLD.status='callback_claimed' AND NEW.status IN ('rejected','expired')) THEN
    RAISE EXCEPTION 'UPSTREAM_LOGIN_LEG_DIAGNOSTIC_TRANSITION_REJECTED';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER upstream_login_legs_diagnostic_immutability
BEFORE UPDATE OF diagnostic_reason,diagnostic_upstream_status ON private.upstream_login_legs
FOR EACH ROW EXECUTE FUNCTION private.enforce_upstream_login_leg_diagnostic_immutability();

CREATE FUNCTION public.fail_upstream_login_leg_with_diagnostic(
  target_attempt_id uuid,
  target_leg_id uuid,
  reason text,
  requested_diagnostic_reason text,
  requested_diagnostic_upstream_status integer DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  attempt private.oauth_login_attempts%ROWTYPE;
  leg private.upstream_login_legs%ROWTYPE;
  now_at timestamptz:=clock_timestamp();
  next_tx_status text;
BEGIN
  PERFORM private.require_social_attempt_service();
  IF reason IS NULL
    OR reason NOT IN ('provider_failure','identity_failure','expired')
    OR requested_diagnostic_reason IS NULL
    OR requested_diagnostic_reason NOT IN (
      'pkce_resume_failed',
      'token_exchange_transport_failed',
      'token_exchange_http_failed',
      'token_response_malformed',
      'id_token_missing_or_malformed',
      'jwks_fetch_failed',
      'jwks_key_rejected',
      'id_token_signature_failed',
      'issuer_or_audience_failed',
      'token_time_failed',
      'nonce_failed',
      'provider_identity_malformed',
      'verifier_unclassified_failure'
    )
    OR (requested_diagnostic_upstream_status IS NOT NULL
      AND requested_diagnostic_upstream_status NOT BETWEEN 100 AND 599) THEN
    RAISE EXCEPTION 'UPSTREAM_LOGIN_LEG_DIAGNOSTIC_FAILURE_REJECTED';
  END IF;

  -- Preserve the established transaction -> attempt -> leg lock order.
  PERFORM private.lock_downstream_authorization_transaction_for_attempt(target_attempt_id);
  SELECT * INTO attempt FROM private.oauth_login_attempts
    WHERE id=target_attempt_id FOR UPDATE;
  SELECT * INTO leg FROM private.upstream_login_legs
    WHERE id=target_leg_id AND login_attempt_id=target_attempt_id FOR UPDATE;

  IF attempt.id IS NULL OR leg.id IS NULL OR leg.status<>'callback_claimed' THEN
    RETURN 'REPLAY_REJECTED';
  END IF;
  IF leg.provider<>'google' OR leg.diagnostic_reason IS NOT NULL
    OR leg.diagnostic_upstream_status IS NOT NULL THEN
    RAISE EXCEPTION 'UPSTREAM_LOGIN_LEG_DIAGNOSTIC_FAILURE_REJECTED';
  END IF;

  next_tx_status:=CASE
    WHEN reason='expired' OR requested_diagnostic_reason='token_time_failed'
      OR attempt.expires_at<=now_at OR leg.expires_at<=now_at
      THEN 'expired'
    ELSE 'rejected'
  END;

  IF NOT private.terminalize_bound_downstream_authorization_transaction(
    target_attempt_id,target_leg_id,next_tx_status,now_at
  ) THEN
    RETURN 'REPLAY_REJECTED';
  END IF;

  -- Diagnostic persistence and terminal scrubbing are one row update inside
  -- the same RPC transaction as downstream and attempt terminalization.
  UPDATE private.upstream_login_legs
  SET status=next_tx_status,
      state_digest=NULL,
      nonce_digest=NULL,
      pkce_s256_challenge=NULL,
      pkce_verifier_ciphertext=NULL,
      pkce_verifier_iv=NULL,
      pkce_verifier_key_version=NULL,
      terminal_at=now_at,
      diagnostic_reason=requested_diagnostic_reason,
      diagnostic_upstream_status=requested_diagnostic_upstream_status,
      version=version+1
  WHERE id=leg.id AND status='callback_claimed'
    AND diagnostic_reason IS NULL AND diagnostic_upstream_status IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'UPSTREAM_LOGIN_LEG_DIAGNOSTIC_FAILURE_REJECTED';
  END IF;

  UPDATE private.oauth_login_attempts
  SET state=CASE WHEN next_tx_status='expired' THEN 'expired' ELSE 'failed_safe' END,
      coarse_terminal_reason=CASE WHEN next_tx_status='expired' THEN 'expired' ELSE 'failed_safe' END,
      updated_at=now_at,
      version=version+1
  WHERE id=attempt.id;

  RETURN CASE WHEN next_tx_status='expired' THEN 'EXPIRED' ELSE 'REJECTED' END;
END $$;

REVOKE ALL ON FUNCTION public.fail_upstream_login_leg_with_diagnostic(uuid,uuid,text,text,integer)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.enforce_upstream_login_leg_diagnostic_immutability()
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fail_upstream_login_leg_with_diagnostic(uuid,uuid,text,text,integer)
  TO service_role;

COMMENT ON COLUMN private.upstream_login_legs.diagnostic_reason IS
  'Allowlisted, secret-free Google verifier failure boundary; null on success and legacy paths.';
COMMENT ON COLUMN private.upstream_login_legs.diagnostic_upstream_status IS
  'Optional numeric upstream HTTP status (100-599); no response content is stored.';
COMMENT ON FUNCTION public.fail_upstream_login_leg_with_diagnostic(uuid,uuid,text,text,integer) IS
  'Service-only atomic Google verifier failure terminalization with allowlisted durable diagnostics.';

COMMIT;
