-- profiles 공개 INSERT 경로를 /api/profiles 하나로 제한한다.
-- anon/authenticated의 SELECT와 service_role 권한은 변경하지 않는다.
-- 이 migration은 운영 DB에 아직 적용하지 않는다.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 과거 migration은 컬럼 단위 INSERT를 부여했으므로 테이블 단위와 컬럼 단위
-- 권한을 모두 명시적으로 회수한다.
REVOKE INSERT ON TABLE public.profiles FROM anon, authenticated;
REVOKE INSERT (
  school_id, graduation_year, grade, class_number, department,
  student_year, nickname, instagram_id, description, is_self, message
) ON public.profiles FROM anon, authenticated;

-- anon/authenticated가 통과할 수 있는 INSERT 정책도 제거한다.
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
