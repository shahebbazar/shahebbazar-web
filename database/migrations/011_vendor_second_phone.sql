-- 011: A business's contact number is its owner's sign-in mobile, plus an optional second number.
--
-- There is one mobile per account: the one its owner signs in with, which is also the business's
-- contact number (shown read-only in Edit Business). Any other number is the second number, with its
-- type: a landline (an office number, shown as 0721-775544), a mobile or a WhatsApp number (shown as
-- +8801712345678). The separate WhatsApp field is folded into it.
--
-- Nothing is lost moving over: a WhatsApp number unlike both numbers becomes the second number;
-- otherwise a contact number unlike the owner's sign-in does. The same columns are in
-- database/baseline/schema.sql. Safe to run more than once.
--
--   psql -d shahebbazar -f database/migrations/011_vendor_second_phone.sql

BEGIN;

ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS vendor_phone_alt character varying(20);
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS vendor_phone_alt_type character varying(10);
ALTER TABLE public.vendors DROP CONSTRAINT IF EXISTS vendors_phone_alt_type_check;
ALTER TABLE public.vendors ADD CONSTRAINT vendors_phone_alt_type_check
    CHECK (vendor_phone_alt_type IS NULL OR vendor_phone_alt_type IN ('landline', 'mobile', 'whatsapp'));

UPDATE public.vendors v
SET vendor_phone_alt = v.vendor_whatsapp, vendor_phone_alt_type = 'whatsapp'
FROM public.users u
WHERE u.user_id = v.user_id AND v.vendor_phone_alt IS NULL AND v.vendor_whatsapp IS NOT NULL
  AND v.vendor_whatsapp IS DISTINCT FROM v.vendor_phone AND v.vendor_whatsapp IS DISTINCT FROM u.user_phone;

UPDATE public.vendors v
SET vendor_phone_alt = v.vendor_phone,
    vendor_phone_alt_type = CASE WHEN v.vendor_phone LIKE '+8801%' THEN 'mobile' ELSE 'landline' END
FROM public.users u
WHERE u.user_id = v.user_id AND v.vendor_phone_alt IS NULL AND v.vendor_phone IS NOT NULL
  AND v.vendor_phone IS DISTINCT FROM u.user_phone;

UPDATE public.vendors v
SET vendor_phone = u.user_phone,
    vendor_whatsapp = CASE WHEN v.vendor_phone_alt_type = 'whatsapp' THEN v.vendor_phone_alt END
FROM public.users u
WHERE u.user_id = v.user_id;

COMMIT;
