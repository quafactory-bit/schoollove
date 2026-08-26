\set ON_ERROR_STOP on
\pset pager off

SELECT version();
SHOW server_version;
SHOW server_version_num;
SHOW standard_conforming_strings;
SELECT datcollate,datctype FROM pg_database WHERE datname=current_database();

SELECT md5(regexp_replace(
  pg_get_functiondef('public.connection_text_is_safe(text,integer)'::regprocedure),
  E'\\r\\n?',E'\\n','g'
)) AS normalized_function_md5;
SELECT pg_get_functiondef('public.connection_text_is_safe(text,integer)'::regprocedure);

\echo PHASE10U_MINIMUM_FUNCTION_PROBE greeting_1
SELECT public.connection_text_is_safe('안녕하세요',200);
\echo PHASE10U_MINIMUM_FUNCTION_PROBE greeting_2
SELECT public.connection_text_is_safe('오랜만이야 잘 지냈어',200);

\echo PHASE10U_REGEX_PROBE url
SELECT '안녕하세요' !~* '(https?://|www\.)[^[:space:]]+' AS url_clause;
\echo PHASE10U_REGEX_PROBE domain
SELECT '안녕하세요' !~* '([A-Za-z0-9-]+\.)+(com|net|org|kr|io|me|co|app|dev)(/[^[:space:]]*)?' AS domain_clause;
\echo PHASE10U_REGEX_PROBE email
SELECT '안녕하세요' !~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[A-Za-z]{2,}' AS email_clause;
\echo PHASE10U_REGEX_PROBE phone
SELECT '안녕하세요' !~ '(\+?82[- .]?)?(0[0-9]{1,2}[- .]?)?[0-9]{3,4}[- .]?[0-9]{4}' AS phone_clause;
\echo PHASE10U_REGEX_PROBE handle
SELECT '안녕하세요' !~ '(^|[[:space:]])@[A-Za-z0-9._-]{2,30}([[:space:]]|$)' AS handle_clause;
\echo PHASE10U_REGEX_PROBE external_id
SELECT '안녕하세요' !~* '(카카오톡|카톡|kakao|인스타그램|instagram|텔레그램|telegram|라인|line)[[:space:]]*(아이디|id)?[[:space:]]*[:：]?[[:space:]]*[A-Za-z0-9@._-]{2,}' AS external_id_clause;

\echo PHASE10U_LITERAL_FIXTURE_PROBE
SELECT public.connection_text_is_safe('과거 안부',200);
