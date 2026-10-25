-- 013: Deleting an account starts with 30 days deactivated.
--
-- A customer who deletes their account is signed out and gets no offers, but keeps everything:
-- signing in again within 30 days reactivates it. After that the API removes their personal details
-- (backend/lib/accountDeletion.js). The same column and statuses are in database/baseline/schema.sql.
-- Safe to run more than once.
--
--   psql -d shahebbazar -f database/migrations/013_account_deactivation.sql

BEGIN;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS user_deactivated_at timestamp with time zone;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_user_status_check;
ALTER TABLE public.users ADD CONSTRAINT users_user_status_check
    CHECK (((user_status)::text = ANY ((ARRAY['active'::character varying, 'suspended'::character varying, 'deactivated'::character varying, 'deleted'::character varying])::text[])));

COMMIT;
