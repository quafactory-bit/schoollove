-- READ ONLY: aggregate counts and operational configuration only. No row hashes.
SELECT jsonb_build_object(
 'migrations',(SELECT count(*) FROM supabase_migrations.schema_migrations),
 'auth_users',(SELECT count(*) FROM auth.users),
 'auth_identities',(SELECT count(*) FROM auth.identities),
 'profiles',(SELECT count(*) FROM public.private_profiles),
 'memberships',(SELECT count(*) FROM public.profile_school_memberships),
 'class_histories',(SELECT count(*) FROM public.profile_school_class_histories),
 'accepted_requests',(SELECT count(*) FROM public.connection_requests WHERE status='accepted'),
 'active_connections',(SELECT count(*) FROM public.connections WHERE status='active'),
 'messages',(SELECT count(*) FROM public.connection_messages),
 'notifications',(SELECT count(*) FROM public.notifications),
 'instagram_handles',(SELECT count(*) FROM public.private_profiles WHERE nullif(instagram_handle,'') IS NOT NULL),
 'instagram_permissions',(SELECT count(*) FROM public.connection_instagram_permissions WHERE status='active'),
 'instagram_history',(SELECT count(*) FROM public.connection_instagram_permissions),
 'launch',(SELECT jsonb_build_object('state',state,'registration',account_registration_enabled,'profile',private_profile_enabled,'membership',school_membership_enabled) FROM public.public_account_launch_control WHERE control_key='public_account'),
 'programs',(SELECT jsonb_agg(jsonb_build_object('key',p.program_key,'status',p.status,'cap',p.operational_max_users,'active_members',(SELECT count(*) FROM public.beta_members b WHERE b.program_id=p.id AND b.status='active'),'enabled',(SELECT jsonb_agg(f.feature_key ORDER BY f.feature_key) FROM public.beta_feature_flags f WHERE f.program_id=p.id AND f.user_id IS NULL AND f.enabled))) FROM public.beta_programs p WHERE p.program_key LIKE 'people_discovery_%' OR p.program_key LIKE 'connected_instagram_%')
 ) AS baseline;
