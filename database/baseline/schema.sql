--
-- PostgreSQL database dump
--


-- Dumped from database version 15.19
-- Dumped by pg_dump version 15.19

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    audit_id bigint NOT NULL,
    audit_actor_user_id integer,
    audit_action character varying(60) NOT NULL,
    audit_target_type character varying(20) NOT NULL,
    audit_target_id integer,
    audit_before jsonb,
    audit_after jsonb,
    audit_created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_logs_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_logs_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_logs_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_logs_audit_id_seq OWNED BY public.audit_logs.audit_id;


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    category_id integer NOT NULL,
    category_parent_id integer,
    category_name character varying(255) NOT NULL,
    category_name_bn character varying(255),
    category_slug character varying(255) NOT NULL,
    category_icon character varying(64),
    category_sort_order smallint DEFAULT 0 NOT NULL,
    category_is_active boolean DEFAULT true NOT NULL
);


--
-- Name: categories_category_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.categories_category_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: categories_category_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.categories_category_id_seq OWNED BY public.categories.category_id;


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    conversation_id integer NOT NULL,
    vendor_id integer NOT NULL,
    user_id integer NOT NULL,
    listing_id integer,
    rfq_id integer,
    conversation_status character varying(20) DEFAULT 'open'::character varying NOT NULL,
    conversation_created_at timestamp with time zone DEFAULT now() NOT NULL,
    conversation_last_message_at timestamp with time zone,
    CONSTRAINT conversations_conversation_status_check CHECK (((conversation_status)::text = ANY ((ARRAY['open'::character varying, 'closed'::character varying, 'blocked'::character varying])::text[])))
);


--
-- Name: conversations_conversation_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.conversations_conversation_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: conversations_conversation_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.conversations_conversation_id_seq OWNED BY public.conversations.conversation_id;


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    event_id integer NOT NULL,
    event_title character varying(255) NOT NULL,
    event_title_bn character varying(255),
    event_slug character varying(255) NOT NULL,
    event_description text,
    event_venue character varying(255),
    location_id integer,
    vendor_id integer,
    event_starts_at timestamp with time zone NOT NULL,
    event_ends_at timestamp with time zone,
    event_image_url text,
    event_status character varying(20) DEFAULT 'published'::character varying NOT NULL,
    event_created_at timestamp with time zone DEFAULT now() NOT NULL,
    -- KAN-298 (also database/migrations/008_events.sql).
    event_type character varying(20) DEFAULT 'other' NOT NULL,
    event_is_online boolean DEFAULT false NOT NULL,
    event_online_url character varying(500),
    event_price_type character varying(10) DEFAULT 'free' NOT NULL,
    event_price_bdt numeric(10,2),
    event_ticket_url character varying(500),
    event_rejection_reason text,
    event_created_by integer,
    event_updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_check CHECK (((event_ends_at IS NULL) OR (event_ends_at >= event_starts_at))),
    CONSTRAINT events_event_status_check CHECK (event_status IN ('draft', 'pending', 'published', 'rejected', 'cancelled')),
    CONSTRAINT events_event_type_check CHECK (
        event_type IN ('market', 'festival', 'sale', 'workshop', 'launch', 'trade', 'community', 'other')),
    CONSTRAINT events_event_price_type_check CHECK (event_price_type IN ('free', 'paid')),
    CONSTRAINT events_event_price_bdt_check CHECK (event_price_bdt IS NULL OR event_price_bdt >= 0),
    CONSTRAINT events_event_urls_check CHECK (
        (event_online_url IS NULL OR event_online_url ~ '^https?://')
        AND (event_ticket_url IS NULL OR event_ticket_url ~ '^https?://'))
);


--
-- Name: events_event_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.events_event_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: events_event_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.events_event_id_seq OWNED BY public.events.event_id;


--
-- Name: listing_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listing_photos (
    photo_id integer NOT NULL,
    listing_id integer NOT NULL,
    photo_url text NOT NULL,
    photo_alt_text character varying(255),
    photo_sort_order smallint DEFAULT 0 NOT NULL,
    photo_is_primary boolean DEFAULT false NOT NULL,
    photo_created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: listing_photos_photo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.listing_photos_photo_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: listing_photos_photo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.listing_photos_photo_id_seq OWNED BY public.listing_photos.photo_id;


--
-- Name: locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.locations (
    location_id integer NOT NULL,
    location_parent_id integer,
    location_name character varying(255) NOT NULL,
    location_name_bn character varying(255),
    location_type character varying(20) NOT NULL,
    location_slug character varying(255) NOT NULL,
    location_path text NOT NULL,
    location_created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT locations_location_type_check CHECK (((location_type)::text = ANY ((ARRAY['country'::character varying, 'division'::character varying, 'district'::character varying, 'city'::character varying, 'area'::character varying])::text[])))
);


--
-- Name: locations_location_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.locations_location_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: locations_location_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.locations_location_id_seq OWNED BY public.locations.location_id;


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    message_id integer NOT NULL,
    conversation_id integer NOT NULL,
    sender_user_id integer NOT NULL,
    message_body text NOT NULL,
    message_read_at timestamp with time zone,
    message_created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: messages_message_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.messages_message_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: messages_message_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.messages_message_id_seq OWNED BY public.messages.message_id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    notification_id integer NOT NULL,
    user_id integer NOT NULL,
    notification_type character varying(40) NOT NULL,
    notification_channel character varying(10) NOT NULL,
    notification_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    notification_status character varying(20) DEFAULT 'queued'::character varying NOT NULL,
    notification_error text,
    notification_sent_at timestamp with time zone,
    notification_read_at timestamp with time zone,
    notification_created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notifications_notification_channel_check CHECK (((notification_channel)::text = ANY ((ARRAY['in_app'::character varying, 'sms'::character varying, 'email'::character varying])::text[]))),
    CONSTRAINT notifications_notification_status_check CHECK (((notification_status)::text = ANY ((ARRAY['queued'::character varying, 'sent'::character varying, 'failed'::character varying, 'skipped'::character varying])::text[])))
);


--
-- Name: notifications_notification_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notifications_notification_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notifications_notification_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notifications_notification_id_seq OWNED BY public.notifications.notification_id;


--
-- Name: otp_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.otp_codes (
    otp_id integer NOT NULL,
    otp_phone character varying(20) NOT NULL,
    otp_code_hash character varying(255) NOT NULL,
    otp_purpose character varying(20) DEFAULT 'login'::character varying NOT NULL,
    otp_expires_at timestamp with time zone NOT NULL,
    otp_attempts smallint DEFAULT 0 NOT NULL,
    otp_consumed_at timestamp with time zone,
    otp_request_ip inet,
    otp_created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT otp_codes_otp_purpose_check CHECK (((otp_purpose)::text = ANY ((ARRAY['login'::character varying, 'register'::character varying, 'recover'::character varying, 'verify'::character varying])::text[])))
);


--
-- Name: otp_codes_otp_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.otp_codes_otp_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: otp_codes_otp_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.otp_codes_otp_id_seq OWNED BY public.otp_codes.otp_id;


--
-- Name: quote_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quote_requests (
    rfq_id integer NOT NULL,
    rfq_public_ref character varying(16) NOT NULL,
    user_id integer,
    rfq_contact_name character varying(255) NOT NULL,
    rfq_contact_phone character varying(20) NOT NULL,
    rfq_contact_email character varying(255),
    vendor_id integer,
    listing_id integer,
    category_id integer,
    rfq_title character varying(255) NOT NULL,
    rfq_details text,
    rfq_quantity numeric(12,2),
    rfq_unit character varying(32),
    rfq_target_price numeric(12,2),
    rfq_needed_by date,
    rfq_delivery_location_id integer,
    rfq_status character varying(20) DEFAULT 'open'::character varying NOT NULL,
    rfq_created_at timestamp with time zone DEFAULT now() NOT NULL,
    rfq_expires_at timestamp with time zone,
    CONSTRAINT quote_requests_check CHECK (((vendor_id IS NOT NULL) OR (category_id IS NOT NULL))),
    CONSTRAINT quote_requests_rfq_status_check CHECK (((rfq_status)::text = ANY ((ARRAY['open'::character varying, 'quoted'::character varying, 'accepted'::character varying, 'closed'::character varying, 'expired'::character varying])::text[])))
);


--
-- Name: quote_requests_rfq_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.quote_requests_rfq_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: quote_requests_rfq_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.quote_requests_rfq_id_seq OWNED BY public.quote_requests.rfq_id;


--
-- Name: quote_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quote_responses (
    quote_id integer NOT NULL,
    rfq_id integer NOT NULL,
    vendor_id integer NOT NULL,
    quote_price numeric(12,2) NOT NULL,
    quote_currency character(3) DEFAULT 'BDT'::bpchar NOT NULL,
    quote_lead_time_days integer,
    quote_payment_terms character varying(20) DEFAULT 'cash_on_delivery'::character varying NOT NULL,
    quote_notes text,
    quote_valid_until date,
    quote_status character varying(20) DEFAULT 'sent'::character varying NOT NULL,
    quote_created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT quote_responses_quote_payment_terms_check CHECK (((quote_payment_terms)::text = ANY ((ARRAY['cash_on_delivery'::character varying, 'advance'::character varying, 'partial_advance'::character varying, 'credit'::character varying, 'negotiable'::character varying])::text[]))),
    CONSTRAINT quote_responses_quote_status_check CHECK (((quote_status)::text = ANY ((ARRAY['sent'::character varying, 'accepted'::character varying, 'rejected'::character varying, 'withdrawn'::character varying, 'expired'::character varying])::text[])))
);


--
-- Name: quote_responses_quote_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.quote_responses_quote_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: quote_responses_quote_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.quote_responses_quote_id_seq OWNED BY public.quote_responses.quote_id;


--
-- Name: reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reports (
    report_id integer NOT NULL,
    report_target_type character varying(20) NOT NULL,
    report_target_id integer NOT NULL,
    reporter_user_id integer,
    report_reason character varying(40) NOT NULL,
    report_details text,
    report_status character varying(20) DEFAULT 'open'::character varying NOT NULL,
    report_resolved_by integer,
    report_resolved_at timestamp with time zone,
    report_created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reports_report_status_check CHECK (((report_status)::text = ANY ((ARRAY['open'::character varying, 'actioned'::character varying, 'dismissed'::character varying])::text[]))),
    CONSTRAINT reports_report_target_type_check CHECK (((report_target_type)::text = ANY ((ARRAY['vendor'::character varying, 'listing'::character varying, 'review'::character varying, 'message'::character varying])::text[])))
);


--
-- Name: reports_report_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reports_report_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reports_report_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reports_report_id_seq OWNED BY public.reports.report_id;


--
-- Name: reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reviews (
    review_id integer NOT NULL,
    vendor_id integer NOT NULL,
    user_id integer NOT NULL,
    review_rating smallint NOT NULL,
    review_body text,
    review_status character varying(20) DEFAULT 'published'::character varying NOT NULL,
    review_created_at timestamp with time zone DEFAULT now() NOT NULL,
    review_reply text,
    review_replied_at timestamp with time zone,
    CONSTRAINT reviews_review_rating_check CHECK (((review_rating >= 1) AND (review_rating <= 5))),
    CONSTRAINT reviews_review_status_check CHECK (((review_status)::text = ANY ((ARRAY['published'::character varying, 'pending'::character varying, 'hidden'::character varying, 'removed'::character varying])::text[])))
);


--
-- Name: reviews_review_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reviews_review_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reviews_review_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reviews_review_id_seq OWNED BY public.reviews.review_id;


--
-- Name: saved_businesses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_businesses (
    user_id integer NOT NULL,
    vendor_id integer NOT NULL,
    saved_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: search_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.search_logs (
    search_id bigint NOT NULL,
    search_query_raw text NOT NULL,
    search_query_normalised text NOT NULL,
    category_id integer,
    location_id integer,
    search_result_count integer DEFAULT 0 NOT NULL,
    search_session_hash character(64),
    search_created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: search_logs_search_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.search_logs_search_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: search_logs_search_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.search_logs_search_id_seq OWNED BY public.search_logs.search_id;


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    session_id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id integer NOT NULL,
    session_token_hash character varying(255) NOT NULL,
    session_expires_at timestamp with time zone NOT NULL,
    session_user_agent text,
    session_ip inet,
    session_created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    user_id integer NOT NULL,
    user_phone character varying(20) NOT NULL,
    user_email character varying(255),
    user_name character varying(255) NOT NULL,
    user_password_hash character varying(255),
    user_role character varying(20) DEFAULT 'customer'::character varying NOT NULL,
    user_phone_verified_at timestamp with time zone,
    user_status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    user_created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_updated_at timestamp with time zone DEFAULT now() NOT NULL,
    user_avatar_url character varying(500),
    location_id integer,
    user_language character varying(2) DEFAULT 'en'::character varying NOT NULL,
    user_deactivated_at timestamp with time zone,
    CONSTRAINT users_user_language_check CHECK (((user_language)::text = ANY ((ARRAY['en'::character varying, 'bn'::character varying])::text[]))),
    CONSTRAINT users_user_role_check CHECK (((user_role)::text = ANY ((ARRAY['customer'::character varying, 'vendor'::character varying, 'admin'::character varying])::text[]))),
    CONSTRAINT users_user_status_check CHECK (((user_status)::text = ANY ((ARRAY['active'::character varying, 'suspended'::character varying, 'deactivated'::character varying, 'deleted'::character varying])::text[])))
);


--
-- Name: users_user_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_user_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_user_id_seq OWNED BY public.users.user_id;


--
-- Name: vendor_profile_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_profile_views (
    view_id bigint NOT NULL,
    vendor_id integer NOT NULL,
    listing_id integer,
    view_source character varying(20),
    view_session_hash character(64),
    view_created_at timestamp with time zone DEFAULT now() NOT NULL,
    -- The campaign whose link the visitor followed (KAN-287); its foreign key is added with the campaigns below.
    view_campaign_id integer,
    CONSTRAINT vendor_profile_views_view_source_check CHECK (
        view_source IN ('search', 'category', 'direct', 'share', 'sponsored', 'email', 'facebook', 'whatsapp'))
);


--
-- Name: v_active_users_daily; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_active_users_daily AS
 SELECT activity.active_day,
    count(DISTINCT activity.session_hash) AS active_sessions
   FROM ( SELECT (date_trunc('day'::text, vendor_profile_views.view_created_at))::date AS active_day,
            vendor_profile_views.view_session_hash AS session_hash
           FROM public.vendor_profile_views
        UNION ALL
         SELECT (date_trunc('day'::text, search_logs.search_created_at))::date AS date_trunc,
            search_logs.search_session_hash
           FROM public.search_logs) activity
  GROUP BY activity.active_day;


--
-- Name: vendor_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_categories (
    vendor_id integer NOT NULL,
    category_id integer NOT NULL
);


--
-- Name: vendor_opening_hours; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_opening_hours (
    hours_id integer NOT NULL,
    vendor_id integer NOT NULL,
    hours_day_of_week smallint NOT NULL,
    hours_open_time time without time zone,
    hours_close_time time without time zone,
    hours_is_closed boolean DEFAULT false NOT NULL,
    hours_is_24h boolean DEFAULT false NOT NULL,
    CONSTRAINT vendor_opening_hours_check CHECK ((hours_is_closed OR hours_is_24h OR ((hours_open_time IS NOT NULL) AND (hours_close_time IS NOT NULL)))),
    CONSTRAINT vendor_opening_hours_hours_day_of_week_check CHECK (((hours_day_of_week >= 0) AND (hours_day_of_week <= 6)))
);


--
-- Name: vendors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendors (
    vendor_id integer NOT NULL,
    user_id integer NOT NULL,
    vendor_name character varying(255) NOT NULL,
    vendor_name_bn character varying(255),
    vendor_slug character varying(255) NOT NULL,
    vendor_description text,
    vendor_phone character varying(20) NOT NULL,
    vendor_email character varying(255),
    vendor_whatsapp character varying(20),
    vendor_phone_alt character varying(20),
    vendor_phone_alt_type character varying(10),
    vendor_address text,
    location_id integer,
    vendor_lat numeric(9,6),
    vendor_lng numeric(9,6),
    vendor_logo_url text,
    vendor_cover_url text,
    vendor_business_type character varying(10) DEFAULT 'both'::character varying NOT NULL,
    vendor_status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    vendor_verified_at timestamp with time zone,
    vendor_verified_by integer,
    vendor_rejection_reason text,
    vendor_is_featured boolean DEFAULT false NOT NULL,
    vendor_featured_until timestamp with time zone,
    vendor_created_at timestamp with time zone DEFAULT now() NOT NULL,
    vendor_updated_at timestamp with time zone DEFAULT now() NOT NULL,
    vendor_website character varying(255),
    vendor_nid_reference character varying(50),
    vendor_nid_status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    vendor_nid_submitted_at timestamp with time zone,
    vendor_nid_verified_at timestamp with time zone,
    vendor_nid_verified_by integer,
    CONSTRAINT vendors_phone_alt_type_check CHECK (((vendor_phone_alt_type IS NULL) OR ((vendor_phone_alt_type)::text = ANY ((ARRAY['landline'::character varying, 'mobile'::character varying, 'whatsapp'::character varying])::text[])))),
    CONSTRAINT vendors_nid_status_check CHECK (((vendor_nid_status)::text = ANY ((ARRAY['pending'::character varying, 'verified'::character varying, 'rejected'::character varying])::text[]))),
    CONSTRAINT vendors_vendor_business_type_check CHECK (((vendor_business_type)::text = ANY ((ARRAY['b2b'::character varying, 'b2c'::character varying, 'both'::character varying])::text[]))),
    CONSTRAINT vendors_vendor_status_check CHECK (((vendor_status)::text = ANY ((ARRAY['draft'::character varying, 'pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'suspended'::character varying])::text[])))
);


--
-- Name: COLUMN vendors.vendor_nid_reference; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vendors.vendor_nid_reference IS 'Prototype NID reference. Do not use genuine identity numbers in development.';


--
-- Name: COLUMN vendors.vendor_nid_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vendors.vendor_nid_status IS 'NID identity-verification status, separate from business moderation status.';


--
-- Name: v_business_cards; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_business_cards AS
 SELECT v.vendor_id,
    v.vendor_slug,
    v.vendor_name,
    v.vendor_name_bn,
    v.vendor_description,
    v.vendor_logo_url,
    v.vendor_cover_url,
    v.vendor_phone,
    v.vendor_address,
    (v.vendor_is_featured AND v.vendor_featured_until IS NOT NULL AND v.vendor_featured_until > now()) AS vendor_is_featured,
    (v.vendor_verified_at IS NOT NULL) AS is_verified,
    loc.location_name AS area_name,
    loc.location_name_bn AS area_name_bn,
    cat.category_name AS primary_category,
    cat.category_name_bn AS primary_category_bn,
    cat.category_slug AS primary_category_slug,
    (COALESCE(r.avg_rating, (0)::numeric))::numeric(2,1) AS rating,
    COALESCE(r.review_count, (0)::bigint) AS review_count,
    h.open_state,
    h.close_time_today
   FROM ((((public.vendors v
     LEFT JOIN public.locations loc ON ((loc.location_id = v.location_id)))
     LEFT JOIN LATERAL ( SELECT c.category_name,
            c.category_name_bn,
            c.category_slug
           FROM (public.vendor_categories vc
             JOIN public.categories c ON ((c.category_id = vc.category_id)))
          WHERE (vc.vendor_id = v.vendor_id)
          ORDER BY c.category_sort_order, c.category_id
         LIMIT 1) cat ON (true))
     LEFT JOIN LATERAL ( SELECT avg(reviews.review_rating) AS avg_rating,
            count(*) AS review_count
           FROM public.reviews
          WHERE ((reviews.vendor_id = v.vendor_id) AND ((reviews.review_status)::text = 'published'::text))) r ON (true))
     LEFT JOIN LATERAL ( SELECT
                CASE
                    WHEN oh.hours_is_closed THEN 'closed'::text
                    WHEN oh.hours_is_24h THEN 'open'::text
                    WHEN ((LOCALTIME >= oh.hours_open_time) AND (LOCALTIME <= oh.hours_close_time)) THEN 'open'::text
                    ELSE 'closed'::text
                END AS open_state,
                CASE
                    WHEN oh.hours_is_24h THEN NULL::time without time zone
                    ELSE oh.hours_close_time
                END AS close_time_today
           FROM public.vendor_opening_hours oh
          WHERE ((oh.vendor_id = v.vendor_id) AND ((oh.hours_day_of_week)::numeric = EXTRACT(dow FROM CURRENT_DATE)))) h ON (true))
  WHERE ((v.vendor_status)::text = 'approved'::text);


--
-- Name: vendor_listings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_listings (
    listing_id integer NOT NULL,
    vendor_id integer NOT NULL,
    category_id integer,
    listing_title character varying(255) NOT NULL,
    listing_title_bn character varying(255),
    listing_slug character varying(255) NOT NULL,
    listing_description text,
    listing_price numeric(12,2),
    listing_price_max numeric(12,2),
    listing_price_unit character varying(32),
    listing_min_order_qty integer,
    listing_is_negotiable boolean DEFAULT true NOT NULL,
    listing_status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    listing_rejection_reason text,
    listing_created_at timestamp with time zone DEFAULT now() NOT NULL,
    listing_updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vendor_listings_check CHECK (((listing_price_max IS NULL) OR (listing_price IS NULL) OR (listing_price_max >= listing_price))),
    CONSTRAINT vendor_listings_listing_status_check CHECK (((listing_status)::text = ANY ((ARRAY['draft'::character varying, 'pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'archived'::character varying])::text[])))
);


--
-- Name: v_moderation_queue; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_moderation_queue AS
 SELECT 'vendor'::text AS queue_type,
    v.vendor_id AS queue_target_id,
    v.vendor_name AS queue_label,
    v.vendor_created_at AS queue_created_at
   FROM public.vendors v
  WHERE ((v.vendor_status)::text = 'pending'::text)
UNION ALL
 SELECT 'listing'::text AS queue_type,
    l.listing_id AS queue_target_id,
    l.listing_title AS queue_label,
    l.listing_created_at AS queue_created_at
   FROM public.vendor_listings l
  WHERE ((l.listing_status)::text = 'pending'::text)
UNION ALL
 SELECT 'report'::text AS queue_type,
    r.report_id AS queue_target_id,
    r.report_reason AS queue_label,
    r.report_created_at AS queue_created_at
   FROM public.reports r
  WHERE ((r.report_status)::text = 'open'::text);


--
-- Name: v_search_trends_daily; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_search_trends_daily AS
 SELECT (date_trunc('day'::text, search_logs.search_created_at))::date AS trend_day,
    search_logs.search_query_normalised,
    count(*) AS trend_count,
    (avg(search_logs.search_result_count))::numeric(10,2) AS trend_avg_results
   FROM public.search_logs
  GROUP BY ((date_trunc('day'::text, search_logs.search_created_at))::date), search_logs.search_query_normalised
 HAVING (count(*) >= 5);


--
-- Name: vendor_facts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_facts (
    fact_id integer NOT NULL,
    vendor_id integer NOT NULL,
    fact_group character varying(10) DEFAULT 'about'::character varying NOT NULL,
    fact_label character varying(60) NOT NULL,
    fact_value character varying(120) NOT NULL,
    fact_icon character varying(40),
    fact_sort_order smallint DEFAULT 0 NOT NULL,
    CONSTRAINT vendor_facts_fact_group_check CHECK (((fact_group)::text = ANY ((ARRAY['about'::character varying, 'quick'::character varying])::text[])))
);


--
-- Name: vendor_facts_fact_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vendor_facts_fact_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendor_facts_fact_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vendor_facts_fact_id_seq OWNED BY public.vendor_facts.fact_id;


--
-- Name: vendor_listings_listing_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vendor_listings_listing_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendor_listings_listing_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vendor_listings_listing_id_seq OWNED BY public.vendor_listings.listing_id;


--
-- Name: vendor_opening_hours_hours_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vendor_opening_hours_hours_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendor_opening_hours_hours_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vendor_opening_hours_hours_id_seq OWNED BY public.vendor_opening_hours.hours_id;


--
-- Name: vendor_payment_methods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_payment_methods (
    payment_method_id integer NOT NULL,
    vendor_id integer NOT NULL,
    payment_method character varying(20) NOT NULL,
    payment_note character varying(120),
    payment_sort_order smallint DEFAULT 0 NOT NULL,
    CONSTRAINT vendor_payment_methods_payment_method_check CHECK (((payment_method)::text = ANY ((ARRAY['cash'::character varying, 'cash_on_delivery'::character varying, 'bank_transfer'::character varying, 'bkash'::character varying, 'nagad'::character varying, 'rocket'::character varying, 'card'::character varying])::text[])))
);


--
-- Name: vendor_payment_methods_payment_method_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vendor_payment_methods_payment_method_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendor_payment_methods_payment_method_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vendor_payment_methods_payment_method_id_seq OWNED BY public.vendor_payment_methods.payment_method_id;


--
-- Name: vendor_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_photos (
    vendor_photo_id integer NOT NULL,
    vendor_id integer NOT NULL,
    vendor_photo_url text NOT NULL,
    vendor_photo_alt character varying(255),
    vendor_photo_sort smallint DEFAULT 0 NOT NULL,
    vendor_photo_created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vendor_photos_vendor_photo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vendor_photos_vendor_photo_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendor_photos_vendor_photo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vendor_photos_vendor_photo_id_seq OWNED BY public.vendor_photos.vendor_photo_id;


--
-- Name: vendor_profile_views_view_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vendor_profile_views_view_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendor_profile_views_view_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vendor_profile_views_view_id_seq OWNED BY public.vendor_profile_views.view_id;


--
-- Name: vendor_search_impressions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_search_impressions (
    vendor_id integer NOT NULL,
    impression_day date NOT NULL,
    impression_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT vendor_search_impressions_impression_count_check CHECK ((impression_count >= 0))
);


--
-- Name: vendor_social_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_social_links (
    vendor_id integer NOT NULL,
    social_platform character varying(20) NOT NULL,
    social_url character varying(255) NOT NULL,
    CONSTRAINT vendor_social_links_social_platform_check CHECK (((social_platform)::text = ANY ((ARRAY['facebook'::character varying, 'instagram'::character varying, 'youtube'::character varying, 'tiktok'::character varying])::text[])))
);


--
-- Name: vendors_vendor_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vendors_vendor_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendors_vendor_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vendors_vendor_id_seq OWNED BY public.vendors.vendor_id;


--
-- Name: audit_logs audit_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN audit_id SET DEFAULT nextval('public.audit_logs_audit_id_seq'::regclass);


--
-- Name: categories category_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories ALTER COLUMN category_id SET DEFAULT nextval('public.categories_category_id_seq'::regclass);


--
-- Name: conversations conversation_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations ALTER COLUMN conversation_id SET DEFAULT nextval('public.conversations_conversation_id_seq'::regclass);


--
-- Name: events event_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events ALTER COLUMN event_id SET DEFAULT nextval('public.events_event_id_seq'::regclass);


--
-- Name: listing_photos photo_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_photos ALTER COLUMN photo_id SET DEFAULT nextval('public.listing_photos_photo_id_seq'::regclass);


--
-- Name: locations location_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations ALTER COLUMN location_id SET DEFAULT nextval('public.locations_location_id_seq'::regclass);


--
-- Name: messages message_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages ALTER COLUMN message_id SET DEFAULT nextval('public.messages_message_id_seq'::regclass);


--
-- Name: notifications notification_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications ALTER COLUMN notification_id SET DEFAULT nextval('public.notifications_notification_id_seq'::regclass);


--
-- Name: otp_codes otp_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otp_codes ALTER COLUMN otp_id SET DEFAULT nextval('public.otp_codes_otp_id_seq'::regclass);


--
-- Name: quote_requests rfq_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_requests ALTER COLUMN rfq_id SET DEFAULT nextval('public.quote_requests_rfq_id_seq'::regclass);


--
-- Name: quote_responses quote_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_responses ALTER COLUMN quote_id SET DEFAULT nextval('public.quote_responses_quote_id_seq'::regclass);


--
-- Name: reports report_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports ALTER COLUMN report_id SET DEFAULT nextval('public.reports_report_id_seq'::regclass);


--
-- Name: reviews review_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews ALTER COLUMN review_id SET DEFAULT nextval('public.reviews_review_id_seq'::regclass);


--
-- Name: search_logs search_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_logs ALTER COLUMN search_id SET DEFAULT nextval('public.search_logs_search_id_seq'::regclass);


--
-- Name: users user_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN user_id SET DEFAULT nextval('public.users_user_id_seq'::regclass);


--
-- Name: vendor_facts fact_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_facts ALTER COLUMN fact_id SET DEFAULT nextval('public.vendor_facts_fact_id_seq'::regclass);


--
-- Name: vendor_listings listing_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_listings ALTER COLUMN listing_id SET DEFAULT nextval('public.vendor_listings_listing_id_seq'::regclass);


--
-- Name: vendor_opening_hours hours_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_opening_hours ALTER COLUMN hours_id SET DEFAULT nextval('public.vendor_opening_hours_hours_id_seq'::regclass);


--
-- Name: vendor_payment_methods payment_method_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_payment_methods ALTER COLUMN payment_method_id SET DEFAULT nextval('public.vendor_payment_methods_payment_method_id_seq'::regclass);


--
-- Name: vendor_photos vendor_photo_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_photos ALTER COLUMN vendor_photo_id SET DEFAULT nextval('public.vendor_photos_vendor_photo_id_seq'::regclass);


--
-- Name: vendor_profile_views view_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_profile_views ALTER COLUMN view_id SET DEFAULT nextval('public.vendor_profile_views_view_id_seq'::regclass);


--
-- Name: vendors vendor_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendors ALTER COLUMN vendor_id SET DEFAULT nextval('public.vendors_vendor_id_seq'::regclass);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (audit_id);


--
-- Name: categories categories_category_parent_id_category_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_category_parent_id_category_name_key UNIQUE (category_parent_id, category_name);


--
-- Name: categories categories_category_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_category_slug_key UNIQUE (category_slug);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (category_id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (conversation_id);


--
-- Name: conversations conversations_vendor_id_user_id_listing_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_vendor_id_user_id_listing_id_key UNIQUE (vendor_id, user_id, listing_id);


--
-- Name: events events_event_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_event_slug_key UNIQUE (event_slug);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (event_id);


--
-- Name: listing_photos listing_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_photos
    ADD CONSTRAINT listing_photos_pkey PRIMARY KEY (photo_id);


--
-- Name: locations locations_location_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_location_slug_key UNIQUE (location_slug);


--
-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (location_id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (message_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (notification_id);


--
-- Name: otp_codes otp_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otp_codes
    ADD CONSTRAINT otp_codes_pkey PRIMARY KEY (otp_id);


--
-- Name: quote_requests quote_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_requests
    ADD CONSTRAINT quote_requests_pkey PRIMARY KEY (rfq_id);


--
-- Name: quote_requests quote_requests_rfq_public_ref_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_requests
    ADD CONSTRAINT quote_requests_rfq_public_ref_key UNIQUE (rfq_public_ref);


--
-- Name: quote_responses quote_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_responses
    ADD CONSTRAINT quote_responses_pkey PRIMARY KEY (quote_id);


--
-- Name: quote_responses quote_responses_rfq_id_vendor_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_responses
    ADD CONSTRAINT quote_responses_rfq_id_vendor_id_key UNIQUE (rfq_id, vendor_id);


--
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (report_id);


--
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (review_id);


--
-- Name: reviews reviews_vendor_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_vendor_id_user_id_key UNIQUE (vendor_id, user_id);


--
-- Name: saved_businesses saved_businesses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_businesses
    ADD CONSTRAINT saved_businesses_pkey PRIMARY KEY (user_id, vendor_id);


--
-- Name: search_logs search_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_logs
    ADD CONSTRAINT search_logs_pkey PRIMARY KEY (search_id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (session_id);


--
-- Name: sessions sessions_session_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_session_token_hash_key UNIQUE (session_token_hash);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (user_id);


--
-- Name: users users_user_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_user_email_key UNIQUE (user_email);


--
-- Name: users users_user_phone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_user_phone_key UNIQUE (user_phone);


--
-- Name: vendor_categories vendor_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_categories
    ADD CONSTRAINT vendor_categories_pkey PRIMARY KEY (vendor_id, category_id);


--
-- Name: vendor_facts vendor_facts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_facts
    ADD CONSTRAINT vendor_facts_pkey PRIMARY KEY (fact_id);


--
-- Name: vendor_facts vendor_facts_vendor_id_fact_group_fact_label_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_facts
    ADD CONSTRAINT vendor_facts_vendor_id_fact_group_fact_label_key UNIQUE (vendor_id, fact_group, fact_label);


--
-- Name: vendor_listings vendor_listings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_listings
    ADD CONSTRAINT vendor_listings_pkey PRIMARY KEY (listing_id);


--
-- Name: vendor_listings vendor_listings_vendor_id_listing_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_listings
    ADD CONSTRAINT vendor_listings_vendor_id_listing_slug_key UNIQUE (vendor_id, listing_slug);


--
-- Name: vendor_opening_hours vendor_opening_hours_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_opening_hours
    ADD CONSTRAINT vendor_opening_hours_pkey PRIMARY KEY (hours_id);


--
-- Name: vendor_opening_hours vendor_opening_hours_vendor_id_hours_day_of_week_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_opening_hours
    ADD CONSTRAINT vendor_opening_hours_vendor_id_hours_day_of_week_key UNIQUE (vendor_id, hours_day_of_week);


--
-- Name: vendor_payment_methods vendor_payment_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_payment_methods
    ADD CONSTRAINT vendor_payment_methods_pkey PRIMARY KEY (payment_method_id);


--
-- Name: vendor_payment_methods vendor_payment_methods_vendor_id_payment_method_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_payment_methods
    ADD CONSTRAINT vendor_payment_methods_vendor_id_payment_method_key UNIQUE (vendor_id, payment_method);


--
-- Name: vendor_photos vendor_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_photos
    ADD CONSTRAINT vendor_photos_pkey PRIMARY KEY (vendor_photo_id);


--
-- Name: vendor_profile_views vendor_profile_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_profile_views
    ADD CONSTRAINT vendor_profile_views_pkey PRIMARY KEY (view_id);


--
-- Name: vendor_search_impressions vendor_search_impressions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_search_impressions
    ADD CONSTRAINT vendor_search_impressions_pkey PRIMARY KEY (vendor_id, impression_day);


--
-- Name: vendor_social_links vendor_social_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_social_links
    ADD CONSTRAINT vendor_social_links_pkey PRIMARY KEY (vendor_id, social_platform);


--
-- Name: vendors vendors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_pkey PRIMARY KEY (vendor_id);


--
-- Name: vendors vendors_vendor_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_vendor_slug_key UNIQUE (vendor_slug);


--
-- Name: idx_audit_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_created ON public.audit_logs USING btree (audit_created_at DESC);


--
-- Name: idx_categories_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categories_parent ON public.categories USING btree (category_parent_id);


--
-- Name: idx_conversations_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_user ON public.conversations USING btree (user_id, conversation_last_message_at DESC);


--
-- Name: idx_conversations_vendor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_vendor ON public.conversations USING btree (vendor_id, conversation_last_message_at DESC);


--
-- Name: idx_events_upcoming; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_upcoming ON public.events USING btree (event_starts_at) WHERE ((event_status)::text = 'published'::text);


--
-- Name: idx_facts_vendor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_facts_vendor ON public.vendor_facts USING btree (vendor_id, fact_group, fact_sort_order);


--
-- Name: idx_hours_vendor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hours_vendor ON public.vendor_opening_hours USING btree (vendor_id);


--
-- Name: idx_listings_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_listings_category ON public.vendor_listings USING btree (category_id);


--
-- Name: idx_listings_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_listings_status ON public.vendor_listings USING btree (listing_status);


--
-- Name: idx_listings_title_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_listings_title_trgm ON public.vendor_listings USING gin (listing_title public.gin_trgm_ops);


--
-- Name: idx_listings_vendor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_listings_vendor ON public.vendor_listings USING btree (vendor_id);


--
-- Name: idx_locations_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_locations_parent ON public.locations USING btree (location_parent_id);


--
-- Name: idx_locations_path; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_locations_path ON public.locations USING btree (location_path text_pattern_ops);


--
-- Name: idx_messages_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_conversation ON public.messages USING btree (conversation_id, message_created_at);


--
-- Name: idx_notifications_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_pending ON public.notifications USING btree (notification_status, notification_created_at) WHERE ((notification_status)::text = 'queued'::text);


--
-- Name: idx_notifications_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id, notification_created_at DESC);


--
-- Name: idx_otp_phone_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_otp_phone_created ON public.otp_codes USING btree (otp_phone, otp_created_at DESC);


--
-- Name: idx_photos_listing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_photos_listing ON public.listing_photos USING btree (listing_id);


--
-- Name: idx_quotes_vendor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotes_vendor ON public.quote_responses USING btree (vendor_id, quote_status);


--
-- Name: idx_reports_open; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_open ON public.reports USING btree (report_status, report_created_at DESC);


--
-- Name: idx_reviews_vendor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reviews_vendor ON public.reviews USING btree (vendor_id, review_status);


--
-- Name: idx_rfq_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfq_created ON public.quote_requests USING btree (rfq_created_at DESC);


--
-- Name: idx_rfq_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfq_user ON public.quote_requests USING btree (user_id);


--
-- Name: idx_rfq_vendor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfq_vendor ON public.quote_requests USING btree (vendor_id, rfq_status);


--
-- Name: idx_saved_vendor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saved_vendor ON public.saved_businesses USING btree (vendor_id);


--
-- Name: idx_search_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_search_created ON public.search_logs USING btree (search_created_at DESC);


--
-- Name: idx_search_normalised; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_search_normalised ON public.search_logs USING btree (search_query_normalised);


--
-- Name: idx_sessions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_user ON public.sessions USING btree (user_id);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.users USING btree (user_role);


--
-- Name: idx_vendor_categories_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendor_categories_category ON public.vendor_categories USING btree (category_id);


--
-- Name: idx_vendor_photos_vendor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendor_photos_vendor ON public.vendor_photos USING btree (vendor_id, vendor_photo_sort);


--
-- Name: idx_vendors_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendors_location ON public.vendors USING btree (location_id);


--
-- Name: idx_vendors_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendors_name_trgm ON public.vendors USING gin (vendor_name public.gin_trgm_ops);


--
-- Name: idx_vendors_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendors_status ON public.vendors USING btree (vendor_status);


--
-- Name: idx_vendors_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendors_user ON public.vendors USING btree (user_id);


--
-- Name: idx_views_vendor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_views_vendor ON public.vendor_profile_views USING btree (vendor_id, view_created_at DESC);


--
-- Name: uq_photos_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_photos_primary ON public.listing_photos USING btree (listing_id) WHERE photo_is_primary;


--
-- Name: audit_logs audit_logs_audit_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_audit_actor_user_id_fkey FOREIGN KEY (audit_actor_user_id) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: categories categories_category_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_category_parent_id_fkey FOREIGN KEY (category_parent_id) REFERENCES public.categories(category_id) ON DELETE RESTRICT;


--
-- Name: conversations conversations_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.vendor_listings(listing_id) ON DELETE SET NULL;


--
-- Name: conversations conversations_rfq_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_rfq_id_fkey FOREIGN KEY (rfq_id) REFERENCES public.quote_requests(rfq_id) ON DELETE SET NULL;


--
-- Name: conversations conversations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: conversations conversations_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(vendor_id) ON DELETE CASCADE;


--
-- Name: events events_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(location_id) ON DELETE SET NULL;


--
-- Name: events events_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(vendor_id) ON DELETE SET NULL;


--
-- Name: listing_photos listing_photos_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_photos
    ADD CONSTRAINT listing_photos_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.vendor_listings(listing_id) ON DELETE CASCADE;


--
-- Name: locations locations_location_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_location_parent_id_fkey FOREIGN KEY (location_parent_id) REFERENCES public.locations(location_id) ON DELETE RESTRICT;


--
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(conversation_id) ON DELETE CASCADE;


--
-- Name: messages messages_sender_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_user_id_fkey FOREIGN KEY (sender_user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: quote_requests quote_requests_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_requests
    ADD CONSTRAINT quote_requests_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(category_id) ON DELETE SET NULL;


--
-- Name: quote_requests quote_requests_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_requests
    ADD CONSTRAINT quote_requests_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.vendor_listings(listing_id) ON DELETE SET NULL;


--
-- Name: quote_requests quote_requests_rfq_delivery_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_requests
    ADD CONSTRAINT quote_requests_rfq_delivery_location_id_fkey FOREIGN KEY (rfq_delivery_location_id) REFERENCES public.locations(location_id) ON DELETE SET NULL;


--
-- Name: quote_requests quote_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_requests
    ADD CONSTRAINT quote_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: quote_requests quote_requests_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_requests
    ADD CONSTRAINT quote_requests_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(vendor_id) ON DELETE CASCADE;


--
-- Name: quote_responses quote_responses_rfq_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_responses
    ADD CONSTRAINT quote_responses_rfq_id_fkey FOREIGN KEY (rfq_id) REFERENCES public.quote_requests(rfq_id) ON DELETE CASCADE;


--
-- Name: quote_responses quote_responses_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_responses
    ADD CONSTRAINT quote_responses_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(vendor_id) ON DELETE CASCADE;


--
-- Name: reports reports_report_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_report_resolved_by_fkey FOREIGN KEY (report_resolved_by) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: reports reports_reporter_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_reporter_user_id_fkey FOREIGN KEY (reporter_user_id) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: reviews reviews_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: reviews reviews_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(vendor_id) ON DELETE CASCADE;


--
-- Name: saved_businesses saved_businesses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_businesses
    ADD CONSTRAINT saved_businesses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: saved_businesses saved_businesses_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_businesses
    ADD CONSTRAINT saved_businesses_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(vendor_id) ON DELETE CASCADE;


--
-- Name: search_logs search_logs_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_logs
    ADD CONSTRAINT search_logs_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(category_id) ON DELETE SET NULL;


--
-- Name: search_logs search_logs_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_logs
    ADD CONSTRAINT search_logs_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(location_id) ON DELETE SET NULL;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: vendor_categories vendor_categories_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_categories
    ADD CONSTRAINT vendor_categories_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(category_id) ON DELETE CASCADE;


--
-- Name: vendor_categories vendor_categories_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_categories
    ADD CONSTRAINT vendor_categories_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(vendor_id) ON DELETE CASCADE;


--
-- Name: vendor_facts vendor_facts_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_facts
    ADD CONSTRAINT vendor_facts_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(vendor_id) ON DELETE CASCADE;


--
-- Name: vendor_listings vendor_listings_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_listings
    ADD CONSTRAINT vendor_listings_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(category_id) ON DELETE SET NULL;


--
-- Name: vendor_listings vendor_listings_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_listings
    ADD CONSTRAINT vendor_listings_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(vendor_id) ON DELETE CASCADE;


--
-- Name: vendor_opening_hours vendor_opening_hours_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_opening_hours
    ADD CONSTRAINT vendor_opening_hours_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(vendor_id) ON DELETE CASCADE;


--
-- Name: vendor_payment_methods vendor_payment_methods_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_payment_methods
    ADD CONSTRAINT vendor_payment_methods_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(vendor_id) ON DELETE CASCADE;


--
-- Name: vendor_photos vendor_photos_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_photos
    ADD CONSTRAINT vendor_photos_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(vendor_id) ON DELETE CASCADE;


--
-- Name: vendor_profile_views vendor_profile_views_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_profile_views
    ADD CONSTRAINT vendor_profile_views_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.vendor_listings(listing_id) ON DELETE CASCADE;


--
-- Name: vendor_profile_views vendor_profile_views_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_profile_views
    ADD CONSTRAINT vendor_profile_views_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(vendor_id) ON DELETE CASCADE;


--
-- Name: vendor_search_impressions vendor_search_impressions_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_search_impressions
    ADD CONSTRAINT vendor_search_impressions_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(vendor_id) ON DELETE CASCADE;


--
-- Name: vendor_social_links vendor_social_links_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_social_links
    ADD CONSTRAINT vendor_social_links_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(vendor_id) ON DELETE CASCADE;


--
-- Name: vendors vendors_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(location_id) ON DELETE SET NULL;


--
-- Name: users users_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(location_id) ON DELETE SET NULL;


--
-- Name: vendors vendors_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: vendors vendors_vendor_nid_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_vendor_nid_verified_by_fkey FOREIGN KEY (vendor_nid_verified_by) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: vendors vendors_vendor_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_vendor_verified_by_fkey FOREIGN KEY (vendor_verified_by) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: vendor_members; Type: TABLE; Schema: public; Owner: -
-- Who can manage each business (KAN-250). vendors.user_id stays the primary owner.
--

CREATE TABLE public.vendor_members (
    vendor_id integer NOT NULL,
    user_id integer NOT NULL,
    member_role character varying(20) DEFAULT 'manager'::character varying NOT NULL,
    member_added_by integer,
    member_added_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vendor_members_pkey PRIMARY KEY (vendor_id, user_id),
    CONSTRAINT vendor_members_member_role_check CHECK (((member_role)::text = ANY ((ARRAY['owner'::character varying, 'manager'::character varying])::text[]))),
    CONSTRAINT vendor_members_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(vendor_id) ON DELETE CASCADE,
    CONSTRAINT vendor_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE,
    CONSTRAINT vendor_members_member_added_by_fkey FOREIGN KEY (member_added_by) REFERENCES public.users(user_id) ON DELETE SET NULL
);

CREATE INDEX idx_vendor_members_user ON public.vendor_members USING btree (user_id);


--
-- Name: sync_vendor_owner_member(); Type: FUNCTION; Schema: public; Owner: -
-- Keeps the primary owner in vendor_members, so every business always has an owner row.
--

CREATE FUNCTION public.sync_vendor_owner_member() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.user_id <> NEW.user_id THEN
        UPDATE public.vendor_members SET member_role = 'manager'
        WHERE vendor_id = NEW.vendor_id AND user_id = OLD.user_id;
    END IF;

    INSERT INTO public.vendor_members (vendor_id, user_id, member_role)
    VALUES (NEW.vendor_id, NEW.user_id, 'owner')
    ON CONFLICT (vendor_id, user_id) DO UPDATE SET member_role = 'owner';

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_vendor_owner_member AFTER INSERT OR UPDATE OF user_id ON public.vendors FOR EACH ROW EXECUTE FUNCTION public.sync_vendor_owner_member();


--
-- Marketing passes (KAN-283). Also in database/migrations/001_marketing_passes.sql.
--

CREATE TABLE public.marketing_packages (
    package_id serial PRIMARY KEY,
    package_name character varying(100) NOT NULL,
    package_duration_days integer NOT NULL,
    package_price_bdt numeric(10,2) NOT NULL,
    package_email_campaign_limit integer DEFAULT 0 NOT NULL,
    package_ai_action_limit integer DEFAULT 0 NOT NULL,
    package_sms_limit integer DEFAULT 0 NOT NULL,
    package_is_active boolean DEFAULT true NOT NULL,
    package_sort_order smallint DEFAULT 0 NOT NULL,
    package_created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT marketing_packages_package_name_key UNIQUE (package_name),
    CONSTRAINT marketing_packages_duration_check CHECK (package_duration_days IN (7, 30, 90)),
    CONSTRAINT marketing_packages_price_check CHECK (package_price_bdt >= 0),
    CONSTRAINT marketing_packages_limits_check CHECK (
        package_email_campaign_limit >= 0 AND package_ai_action_limit >= 0 AND package_sms_limit >= 0)
);

CREATE TABLE public.vendor_marketing_subscriptions (
    subscription_id serial PRIMARY KEY,
    vendor_id integer NOT NULL REFERENCES public.vendors(vendor_id) ON DELETE CASCADE,
    package_id integer NOT NULL REFERENCES public.marketing_packages(package_id),
    subscription_status character varying(20) DEFAULT 'pending' NOT NULL,
    subscription_starts_at timestamp with time zone,
    subscription_ends_at timestamp with time zone,
    subscription_price_bdt numeric(10,2) NOT NULL,
    subscription_activation_source character varying(20) DEFAULT 'admin' NOT NULL,
    subscription_activated_by integer REFERENCES public.users(user_id) ON DELETE SET NULL,
    subscription_payment_ref character varying(100),
    subscription_status_reason character varying(500),
    subscription_created_at timestamp with time zone DEFAULT now() NOT NULL,
    subscription_updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vendor_marketing_subscriptions_status_check CHECK (
        subscription_status IN ('pending', 'active', 'expired', 'suspended', 'cancelled')),
    CONSTRAINT vendor_marketing_subscriptions_source_check CHECK (
        subscription_activation_source IN ('admin', 'sslcommerz')),
    CONSTRAINT vendor_marketing_subscriptions_dates_check CHECK (
        subscription_ends_at IS NULL OR subscription_starts_at IS NULL OR subscription_ends_at > subscription_starts_at),
    CONSTRAINT vendor_marketing_subscriptions_active_dates_check CHECK (
        subscription_status <> 'active' OR (subscription_starts_at IS NOT NULL AND subscription_ends_at IS NOT NULL))
);

CREATE INDEX idx_vendor_marketing_subscriptions_vendor
    ON public.vendor_marketing_subscriptions (vendor_id);
-- A business has at most one pass that is waiting or running.
CREATE UNIQUE INDEX uq_vendor_marketing_subscriptions_live
    ON public.vendor_marketing_subscriptions (vendor_id)
    WHERE subscription_status IN ('pending', 'active');

CREATE TABLE public.marketing_usage_events (
    usage_id bigserial PRIMARY KEY,
    -- Usage belongs to a business; the pass is empty for the free plan (migration 005).
    vendor_id integer NOT NULL REFERENCES public.vendors(vendor_id) ON DELETE CASCADE,
    subscription_id integer REFERENCES public.vendor_marketing_subscriptions(subscription_id) ON DELETE CASCADE,
    usage_type character varying(20) NOT NULL,
    usage_quantity integer DEFAULT 1 NOT NULL,
    usage_is_free boolean DEFAULT false NOT NULL,
    usage_reference character varying(100),
    usage_created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT marketing_usage_events_type_check CHECK (usage_type IN ('email_campaign', 'ai_action', 'sms')),
    CONSTRAINT marketing_usage_events_quantity_check CHECK (usage_quantity > 0)
);

CREATE INDEX idx_marketing_usage_events_subscription
    ON public.marketing_usage_events (subscription_id, usage_type);

CREATE INDEX idx_marketing_usage_events_vendor
    ON public.marketing_usage_events (vendor_id, usage_type, usage_created_at);


--
-- Marketing consent (KAN-284). Also in database/migrations/002_marketing_consents.sql.
-- A customer's permission for one business to send offers by email or SMS; separate from
-- saved_businesses. Withdrawn rows are kept as the record.
--

CREATE TABLE public.marketing_consents (
    consent_id serial PRIMARY KEY,
    user_id integer NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    vendor_id integer NOT NULL REFERENCES public.vendors(vendor_id) ON DELETE CASCADE,
    consent_channel character varying(10) NOT NULL,
    consent_source character varying(20) NOT NULL,
    consent_given_at timestamp with time zone DEFAULT now() NOT NULL,
    consent_withdrawn_at timestamp with time zone,
    consent_withdrawn_source character varying(20),
    CONSTRAINT marketing_consents_channel_check CHECK (consent_channel IN ('email', 'sms')),
    CONSTRAINT marketing_consents_source_check CHECK (consent_source IN ('save_prompt', 'account')),
    CONSTRAINT marketing_consents_withdrawn_source_check CHECK (
        consent_withdrawn_source IN ('account', 'unsubscribe_link', 'unsaved')),
    CONSTRAINT marketing_consents_withdrawn_check CHECK (
        (consent_withdrawn_at IS NULL) = (consent_withdrawn_source IS NULL))
);

-- At most one active consent per customer, business and channel.
CREATE UNIQUE INDEX uq_marketing_consents_active
    ON public.marketing_consents (user_id, vendor_id, consent_channel)
    WHERE consent_withdrawn_at IS NULL;
-- A business's audience for one channel.
CREATE INDEX idx_marketing_consents_audience
    ON public.marketing_consents (vendor_id, consent_channel)
    WHERE consent_withdrawn_at IS NULL;


--
-- Platform settings (KAN-293). Also in database/migrations/003_platform_settings.sql.
-- Settings an admin can change without a code release; see backend/lib/settings.js.
--

CREATE TABLE public.platform_settings (
    setting_key character varying(50) PRIMARY KEY,
    setting_value jsonb NOT NULL,
    setting_updated_at timestamp with time zone DEFAULT now() NOT NULL,
    setting_updated_by integer REFERENCES public.users(user_id) ON DELETE SET NULL
);


--
-- Reviews from deleted accounts (KAN-321). Also in database/migrations/014_hide_deactivated_reviews.sql.
-- Replaces v_business_cards above, now platform_settings exists: ratings leave out a deactivated
-- customer's reviews, and a removed account's if show_removed_account_reviews is off.
--

CREATE OR REPLACE VIEW public.v_business_cards AS
 SELECT v.vendor_id,
    v.vendor_slug,
    v.vendor_name,
    v.vendor_name_bn,
    v.vendor_description,
    v.vendor_logo_url,
    v.vendor_cover_url,
    v.vendor_phone,
    v.vendor_address,
    (v.vendor_is_featured AND v.vendor_featured_until IS NOT NULL AND v.vendor_featured_until > now()) AS vendor_is_featured,
    (v.vendor_verified_at IS NOT NULL) AS is_verified,
    loc.location_name AS area_name,
    loc.location_name_bn AS area_name_bn,
    cat.category_name AS primary_category,
    cat.category_name_bn AS primary_category_bn,
    cat.category_slug AS primary_category_slug,
    (COALESCE(r.avg_rating, (0)::numeric))::numeric(2,1) AS rating,
    COALESCE(r.review_count, (0)::bigint) AS review_count,
    h.open_state,
    h.close_time_today
   FROM ((((public.vendors v
     LEFT JOIN public.locations loc ON ((loc.location_id = v.location_id)))
     LEFT JOIN LATERAL ( SELECT c.category_name,
            c.category_name_bn,
            c.category_slug
           FROM (public.vendor_categories vc
             JOIN public.categories c ON ((c.category_id = vc.category_id)))
          WHERE (vc.vendor_id = v.vendor_id)
          ORDER BY c.category_sort_order, c.category_id
         LIMIT 1) cat ON (true))
     LEFT JOIN LATERAL ( SELECT avg(reviews.review_rating) AS avg_rating,
            count(*) AS review_count
           FROM (public.reviews
             JOIN public.users ru ON ((ru.user_id = reviews.user_id)))
          WHERE ((reviews.vendor_id = v.vendor_id) AND ((reviews.review_status)::text = 'published'::text)
            AND ((ru.user_status)::text <> 'deactivated'::text)
            AND (((ru.user_status)::text <> 'deleted'::text) OR COALESCE((SELECT (ps.setting_value)::boolean FROM public.platform_settings ps
                  WHERE ((ps.setting_key)::text = 'show_removed_account_reviews'::text)), true)))) r ON (true))
     LEFT JOIN LATERAL ( SELECT
                CASE
                    WHEN oh.hours_is_closed THEN 'closed'::text
                    WHEN oh.hours_is_24h THEN 'open'::text
                    WHEN ((LOCALTIME >= oh.hours_open_time) AND (LOCALTIME <= oh.hours_close_time)) THEN 'open'::text
                    ELSE 'closed'::text
                END AS open_state,
                CASE
                    WHEN oh.hours_is_24h THEN NULL::time without time zone
                    ELSE oh.hours_close_time
                END AS close_time_today
           FROM public.vendor_opening_hours oh
          WHERE ((oh.vendor_id = v.vendor_id) AND ((oh.hours_day_of_week)::numeric = EXTRACT(dow FROM CURRENT_DATE)))) h ON (true))
  WHERE ((v.vendor_status)::text = 'approved'::text);


--
-- Marketing campaigns (KAN-285). Also in database/migrations/004_marketing_campaigns.sql.
-- A business's campaign brief, the snapshot it was written from, and every saved wording.
--

CREATE TABLE public.marketing_campaigns (
    campaign_id serial PRIMARY KEY,
    vendor_id integer NOT NULL REFERENCES public.vendors(vendor_id) ON DELETE CASCADE,
    campaign_title character varying(120) NOT NULL,
    campaign_goal character varying(20) NOT NULL,
    campaign_language character varying(2) NOT NULL,
    campaign_offer character varying(200),
    campaign_starts_on date,
    campaign_ends_on date,
    campaign_call_to_action character varying(20) NOT NULL,
    campaign_listing_ids integer[] NOT NULL,
    campaign_coupon_code character varying(20),
    campaign_source_snapshot jsonb NOT NULL,
    campaign_status character varying(20) DEFAULT 'draft' NOT NULL,
    campaign_approved_version_id integer,
    campaign_approved_at timestamp with time zone,
    campaign_approved_by integer REFERENCES public.users(user_id) ON DELETE SET NULL,
    campaign_created_by integer REFERENCES public.users(user_id) ON DELETE SET NULL,
    campaign_created_at timestamp with time zone DEFAULT now() NOT NULL,
    campaign_updated_at timestamp with time zone DEFAULT now() NOT NULL,
    campaign_sent_at timestamp with time zone,
    campaign_sent_by integer REFERENCES public.users(user_id) ON DELETE SET NULL,
    CONSTRAINT marketing_campaigns_goal_check CHECK (campaign_goal IN ('new_stock', 'offer', 'event', 'reminder')),
    CONSTRAINT marketing_campaigns_language_check CHECK (campaign_language IN ('en', 'bn')),
    CONSTRAINT marketing_campaigns_cta_check CHECK (campaign_call_to_action IN ('visit', 'call', 'message', 'order')),
    CONSTRAINT marketing_campaigns_status_check CHECK (campaign_status IN ('draft', 'approved', 'sending', 'sent', 'failed')),
    CONSTRAINT marketing_campaigns_dates_check CHECK (
        campaign_ends_on IS NULL OR campaign_starts_on IS NULL OR campaign_ends_on >= campaign_starts_on),
    -- 0 for a campaign about one of the business's events (KAN-298, migration 009); the API asks for 1 otherwise.
    CONSTRAINT marketing_campaigns_listings_check CHECK (cardinality(campaign_listing_ids) BETWEEN 0 AND 3),
    -- An offer's coupon is valid for the offer's dates, so it needs a last day.
    CONSTRAINT marketing_campaigns_coupon_check CHECK (campaign_coupon_code IS NULL OR (
        campaign_goal = 'offer' AND campaign_ends_on IS NOT NULL AND campaign_coupon_code ~ '^[A-Z0-9-]{3,20}$'))
);

CREATE INDEX idx_marketing_campaigns_vendor
    ON public.marketing_campaigns (vendor_id, campaign_updated_at DESC);

-- Every saved wording of a campaign: email, Facebook and WhatsApp text together. Never updated.
CREATE TABLE public.marketing_campaign_versions (
    version_id serial PRIMARY KEY,
    campaign_id integer NOT NULL REFERENCES public.marketing_campaigns(campaign_id) ON DELETE CASCADE,
    version_number integer NOT NULL,
    version_content jsonb NOT NULL,
    version_method character varying(10) NOT NULL,
    version_created_by integer REFERENCES public.users(user_id) ON DELETE SET NULL,
    version_created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT marketing_campaign_versions_method_check CHECK (version_method IN ('template', 'manual', 'ai')),
    CONSTRAINT marketing_campaign_versions_number_key UNIQUE (campaign_id, version_number)
);

ALTER TABLE public.marketing_campaigns
    ADD CONSTRAINT marketing_campaigns_approved_version_fkey
    FOREIGN KEY (campaign_approved_version_id) REFERENCES public.marketing_campaign_versions(version_id) ON DELETE SET NULL;

--
-- Marketing email sends (KAN-286). Also in database/migrations/005_marketing_sends.sql.
-- One row per email a campaign sent. Kept when the customer's account is deleted (user_id empties).
--

CREATE TABLE public.marketing_sends (
    send_id bigserial PRIMARY KEY,
    campaign_id integer NOT NULL REFERENCES public.marketing_campaigns(campaign_id) ON DELETE CASCADE,
    vendor_id integer NOT NULL REFERENCES public.vendors(vendor_id) ON DELETE CASCADE,
    user_id integer REFERENCES public.users(user_id) ON DELETE SET NULL,
    send_channel character varying(10) DEFAULT 'email' NOT NULL,
    send_address character varying(255) NOT NULL,
    send_status character varying(20) NOT NULL,
    send_provider character varying(20) NOT NULL,
    send_provider_message_id character varying(255),
    send_error character varying(500),
    send_created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT marketing_sends_channel_check CHECK (send_channel IN ('email')),
    CONSTRAINT marketing_sends_status_check CHECK (send_status IN ('sent', 'failed'))
);

CREATE INDEX idx_marketing_sends_campaign ON public.marketing_sends (campaign_id);
CREATE INDEX idx_marketing_sends_vendor ON public.marketing_sends (vendor_id, send_created_at DESC);

--
-- Facebook and WhatsApp posts (KAN-287). Also in database/migrations/006_marketing_posts.sql.
-- The owner posts a campaign themselves and marks it as posted, with a link if they have one.
-- One row per campaign and channel, recording which version was posted.
--

CREATE TABLE public.marketing_campaign_posts (
    post_id serial PRIMARY KEY,
    campaign_id integer NOT NULL REFERENCES public.marketing_campaigns(campaign_id) ON DELETE CASCADE,
    vendor_id integer NOT NULL REFERENCES public.vendors(vendor_id) ON DELETE CASCADE,
    post_channel character varying(10) NOT NULL,
    post_url character varying(500),
    post_version_id integer REFERENCES public.marketing_campaign_versions(version_id) ON DELETE SET NULL,
    post_marked_by integer REFERENCES public.users(user_id) ON DELETE SET NULL,
    post_marked_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT marketing_campaign_posts_channel_check CHECK (post_channel IN ('facebook', 'whatsapp')),
    CONSTRAINT marketing_campaign_posts_url_check CHECK (post_url IS NULL OR post_url ~ '^https?://'),
    CONSTRAINT marketing_campaign_posts_channel_key UNIQUE (campaign_id, post_channel)
);

CREATE INDEX idx_marketing_campaign_posts_vendor
    ON public.marketing_campaign_posts (vendor_id, post_marked_at DESC);

--
-- Visits from marketing campaigns (KAN-287). Also in database/migrations/007_campaign_visits.sql.
-- Campaign links carry the channel (email, facebook, whatsapp) and the campaign.
--

ALTER TABLE public.vendor_profile_views
    ADD CONSTRAINT vendor_profile_views_view_campaign_id_fkey
    FOREIGN KEY (view_campaign_id) REFERENCES public.marketing_campaigns(campaign_id) ON DELETE SET NULL;

CREATE INDEX idx_vendor_profile_views_campaign
    ON public.vendor_profile_views (view_campaign_id) WHERE view_campaign_id IS NOT NULL;

--
-- Events businesses run themselves (KAN-298). Also in database/migrations/008_events.sql.
-- Cover photo and gallery (events.event_image_url holds the cover's path), and customers'
-- Interested / Going answers.
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_event_created_by_fkey FOREIGN KEY (event_created_by) REFERENCES public.users(user_id) ON DELETE SET NULL;

CREATE INDEX idx_events_vendor ON public.events (vendor_id, event_starts_at DESC);

CREATE TABLE public.event_photos (
    photo_id serial PRIMARY KEY,
    event_id integer NOT NULL REFERENCES public.events(event_id) ON DELETE CASCADE,
    photo_url text NOT NULL,
    photo_sort_order integer DEFAULT 0 NOT NULL,
    photo_is_cover boolean DEFAULT false NOT NULL,
    photo_created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX idx_event_photos_event ON public.event_photos (event_id, photo_sort_order);
CREATE UNIQUE INDEX idx_event_photos_one_cover ON public.event_photos (event_id) WHERE photo_is_cover;

CREATE TABLE public.event_responses (
    event_id integer NOT NULL REFERENCES public.events(event_id) ON DELETE CASCADE,
    user_id integer NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    response_type character varying(12) NOT NULL,
    response_created_at timestamp with time zone DEFAULT now() NOT NULL,
    response_updated_at timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (event_id, user_id),
    CONSTRAINT event_responses_type_check CHECK (response_type IN ('interested', 'going'))
);
CREATE INDEX idx_event_responses_user ON public.event_responses (user_id);

-- Messages about an event (cancelled, moved, or a note from the business) go in their own conversation.
ALTER TABLE public.conversations
    ADD COLUMN event_id integer REFERENCES public.events(event_id) ON DELETE SET NULL;

--
-- PostgreSQL database dump complete
--
