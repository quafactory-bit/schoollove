# Google-only Preview authentication policy

Date: 2026-08-24

The sole official user-facing login provider is Google. Kakao and Naver are not supported deployed login providers, and Supabase Auth email OTP is not a user-login path. SchoolLove custom recovery email and its eight-digit OTP remain for recovery, ownership proof, and duplicate-account prevention; they never replace provider login.

The historical Kakao `existing_account_match` evidence remains preserved as security evidence. Apple Sign in is deferred to a separate iOS decision. This decision authorizes Preview code closure only: Production rollout and external Supabase, Vercel, or provider-console credential/config changes require separate approval.

The subsequent operator sequence is: disable the Preview Kakao/Naver custom providers, remove only their Preview Vercel credentials, disable provider-console callback authority, observe Google-only stability, then consider irreversible credential/app deletion. Supabase email-provider disablement must be separately validated because this code change does not alter Supabase Auth configuration.
