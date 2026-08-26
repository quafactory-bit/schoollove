\set ON_ERROR_STOP on
\pset pager off
SELECT version();
SHOW server_version;
SHOW server_version_num;
SHOW standard_conforming_strings;
SELECT normalize('Ｉｎｓｔａｇｒａｍ： friend12',NFKC)='Instagram: friend12' AS nfkc_supported;
SELECT public.connection_text_is_safe('나 완이야. 오랜만이야.',200) AS safe_natural_greeting;
SELECT NOT public.connection_text_is_safe('0 1 0 1 2 3 4 5 6 7 8',200) AS spaced_phone_rejected;
SELECT NOT public.connection_text_is_safe('k a k a o id friend12',200) AS spaced_provider_rejected;
SELECT NOT public.connection_text_is_safe('example dot kr',200) AS dot_domain_rejected;
