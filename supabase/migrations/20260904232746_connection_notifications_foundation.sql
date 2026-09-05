BEGIN;

CREATE TABLE public.connection_notifications (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES public.connection_requests(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'request_received',
    'request_reminded',
    'request_accepted'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz NULL,
  UNIQUE (owner_user_id, request_id, event_type)
);

CREATE INDEX connection_notifications_owner_unread_created_idx
  ON public.connection_notifications (owner_user_id, read_at, created_at DESC);

ALTER TABLE public.connection_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_notifications FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.connection_notifications FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.connection_notifications TO service_role;

CREATE OR REPLACE FUNCTION public.record_connection_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  notification_owner uuid;
  notification_event text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    notification_owner := NEW.receiver_user_id;
    notification_event := 'request_received';
  ELSIF OLD.reminder_count = 0 AND NEW.reminder_count = 1 THEN
    notification_owner := NEW.receiver_user_id;
    notification_event := 'request_reminded';
  ELSIF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    notification_owner := NEW.sender_user_id;
    notification_event := 'request_accepted';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.connection_notifications (owner_user_id, request_id, event_type)
  VALUES (notification_owner, NEW.id, notification_event)
  ON CONFLICT (owner_user_id, request_id, event_type) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER connection_requests_record_connection_notification
AFTER INSERT OR UPDATE ON public.connection_requests
FOR EACH ROW EXECUTE FUNCTION public.record_connection_notification();

CREATE OR REPLACE FUNCTION public.get_own_connection_notifications(requested_limit integer DEFAULT 20)
RETURNS TABLE (
  id uuid,
  event_type text,
  created_at timestamptz,
  read_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT notification.id, notification.event_type, notification.created_at, notification.read_at
  FROM public.connection_notifications notification
  WHERE auth.uid() IS NOT NULL
    AND notification.owner_user_id = auth.uid()
  ORDER BY notification.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(requested_limit, 20), 1), 50);
$$;

CREATE OR REPLACE FUNCTION public.get_own_connection_notification_unread_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*)::integer
  FROM public.connection_notifications notification
  WHERE auth.uid() IS NOT NULL
    AND notification.owner_user_id = auth.uid()
    AND notification.read_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.mark_own_connection_notification_read(target_notification_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR target_notification_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.connection_notifications notification
  SET read_at = COALESCE(notification.read_at, now())
  WHERE notification.id = target_notification_id
    AND notification.owner_user_id = auth.uid();

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.record_connection_notification() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_own_connection_notifications(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_own_connection_notification_unread_count() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_own_connection_notification_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_own_connection_notifications(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_own_connection_notification_unread_count() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_own_connection_notification_read(uuid) TO authenticated, service_role;

COMMIT;
