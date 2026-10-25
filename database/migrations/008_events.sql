-- 008: Events businesses run themselves (KAN-298).
--
-- A business adds an event from its dashboard, with a cover photo and gallery, an event type, a
-- venue or an online link, and whether it is free or ticketed. New events are public at once unless
-- an admin switches on require_event_approval. Signed-in customers mark themselves Interested or
-- Going and see those events in their account; people going get the business's updates about the
-- event as messages, in a conversation linked to the event. The same objects are in
-- database/baseline/schema.sql. Safe to run more than once.
--
--   psql -d shahebbazar -f database/migrations/008_events.sql

BEGIN;

ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS event_type character varying(20) DEFAULT 'other' NOT NULL,
    ADD COLUMN IF NOT EXISTS event_is_online boolean DEFAULT false NOT NULL,
    ADD COLUMN IF NOT EXISTS event_online_url character varying(500),
    ADD COLUMN IF NOT EXISTS event_price_type character varying(10) DEFAULT 'free' NOT NULL,
    ADD COLUMN IF NOT EXISTS event_price_bdt numeric(10,2),
    ADD COLUMN IF NOT EXISTS event_ticket_url character varying(500),
    ADD COLUMN IF NOT EXISTS event_rejection_reason text,
    ADD COLUMN IF NOT EXISTS event_created_by integer REFERENCES public.users(user_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS event_updated_at timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_event_status_check;
ALTER TABLE public.events ADD CONSTRAINT events_event_status_check CHECK (
    event_status IN ('draft', 'pending', 'published', 'rejected', 'cancelled'));
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_event_type_check;
ALTER TABLE public.events ADD CONSTRAINT events_event_type_check CHECK (
    event_type IN ('market', 'festival', 'sale', 'workshop', 'launch', 'trade', 'community', 'other'));
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_event_price_type_check;
ALTER TABLE public.events ADD CONSTRAINT events_event_price_type_check CHECK (event_price_type IN ('free', 'paid'));
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_event_price_bdt_check;
ALTER TABLE public.events ADD CONSTRAINT events_event_price_bdt_check CHECK (event_price_bdt IS NULL OR event_price_bdt >= 0);
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_event_urls_check;
ALTER TABLE public.events ADD CONSTRAINT events_event_urls_check CHECK (
    (event_online_url IS NULL OR event_online_url ~ '^https?://')
    AND (event_ticket_url IS NULL OR event_ticket_url ~ '^https?://'));

CREATE INDEX IF NOT EXISTS idx_events_vendor ON public.events (vendor_id, event_starts_at DESC);

-- Cover photo and gallery. events.event_image_url holds the cover's path, for the pages and share
-- cards that only need the one image.
CREATE TABLE IF NOT EXISTS public.event_photos (
    photo_id serial PRIMARY KEY,
    event_id integer NOT NULL REFERENCES public.events(event_id) ON DELETE CASCADE,
    photo_url text NOT NULL,
    photo_sort_order integer DEFAULT 0 NOT NULL,
    photo_is_cover boolean DEFAULT false NOT NULL,
    photo_created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_event_photos_event ON public.event_photos (event_id, photo_sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_photos_one_cover ON public.event_photos (event_id) WHERE photo_is_cover;

-- Interested / Going, one answer per customer and event.
CREATE TABLE IF NOT EXISTS public.event_responses (
    event_id integer NOT NULL REFERENCES public.events(event_id) ON DELETE CASCADE,
    user_id integer NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    response_type character varying(12) NOT NULL,
    response_created_at timestamp with time zone DEFAULT now() NOT NULL,
    response_updated_at timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (event_id, user_id),
    CONSTRAINT event_responses_type_check CHECK (response_type IN ('interested', 'going'))
);
CREATE INDEX IF NOT EXISTS idx_event_responses_user ON public.event_responses (user_id);

-- Messages about an event (cancelled, moved, or a note from the business) go in their own conversation.
ALTER TABLE public.conversations
    ADD COLUMN IF NOT EXISTS event_id integer REFERENCES public.events(event_id) ON DELETE SET NULL;

INSERT INTO public.platform_settings (setting_key, setting_value) VALUES ('require_event_approval', 'false')
ON CONFLICT (setting_key) DO NOTHING;

COMMIT;
