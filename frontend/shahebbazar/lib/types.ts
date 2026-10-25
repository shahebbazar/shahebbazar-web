// API response contract.

export type OpenState = "open" | "closed" | null;

export interface CategoryTile {
    category_id: number;
    category_name: string;
    category_name_bn: string | null;
    category_slug: string;
    category_icon: string | null;
    /** Derived from the first three child categories. */
    subtitle: string | null;
    subtitle_bn: string | null;
    business_count: string | number;
}

/** A row of the category taxonomy. */
export interface CategoryNode {
    category_id: number;
    category_parent_id: number | null;
    category_name: string;
    category_name_bn: string | null;
    category_slug: string;
    category_icon: string | null;
    /** Approved businesses here and in child categories. */
    business_count: string | number;
}

export interface BusinessCard {
    vendor_id: number;
    vendor_slug: string;
    vendor_name: string;
    vendor_name_bn: string | null;
    vendor_description: string | null;
    vendor_address: string | null;
    vendor_cover_url: string | null;
    vendor_logo_url: string | null;
    vendor_is_featured: boolean;
    is_verified: boolean;
    area_name: string | null;
    area_name_bn: string | null;
    primary_category: string | null;
    primary_category_bn: string | null;
    primary_category_slug: string | null;
    /** NUMERIC is returned by `pg` as a string; convert before comparison. */
    rating: string | number;
    review_count: string | number;
    open_state: OpenState;
    close_time_today: string | null;
}

export interface EventItem {
    event_id: number;
    event_title: string;
    event_title_bn: string | null;
    event_slug: string;
    event_venue: string | null;
    event_starts_at: string;
    event_ends_at: string | null;
}

/** KAN-298. Keys match the CHECK constraint on events.event_type. */
export type EventType = "market" | "festival" | "sale" | "workshop" | "launch" | "trade" | "community" | "other";
export type EventStatus = "draft" | "pending" | "published" | "rejected" | "cancelled";
export type EventResponse = "interested" | "going";

export interface EventPhoto {
    photo_id: number;
    photo_url: string;
    photo_is_cover: boolean;
}

export interface HomePayload {
    categories: CategoryTile[];
    featured: BusinessCard[];
    events: EventItem[];
    popularSearches: string[];
}

export interface BusinessSearchPayload {
    results: BusinessCard[];
    /** Paid placement, returned separately so it is always rendered labelled. */
    sponsored: BusinessCard[];
    total: number;
    limit: number;
    offset: number;
    sort: string;
    facets: { areas: Facet[]; categories: Facet[] };
}

/** Facet count used by the search sidebar filters. */
export interface Facet {
    name: string;
    name_bn: string | null;
    slug: string;
    count: number;
}

export interface OpeningHoursRow {
    /** 0 = Sunday to 6 = Saturday, matching PostgreSQL EXTRACT(DOW). */
    day: number;
    open_time: string | null;
    close_time: string | null;
    is_closed: boolean;
    is_24h: boolean;
}

export interface Photo {
    url: string;
    alt: string | null;
}

export interface Offering {
    listing_id: number;
    title: string;
    title_bn: string | null;
    slug: string;
    description: string | null;
    price: string | number | null;
    price_max: string | number | null;
    unit: string | null;
    min_order_qty: number | null;
    photo_url: string | null;
}

export interface Fact {
    /** Placement group: 'about' for the description panel, 'quick' for the sidebar. */
    group: "about" | "quick";
    label: string;
    value: string;
    icon: string | null;
}

export interface Review {
    review_id: number;
    rating: number;
    body: string | null;
    created_at: string;
    author: string;
    author_verified: boolean;
    reply?: string | null;
    replied_at?: string | null;
}

/** Business card with the distance from the business being viewed. */
export interface SimilarBusiness extends BusinessCard {
    distance_km: string | number | null;
}

// Must match vendor_payment_methods_payment_method_check in database/baseline/schema.sql.
export type PaymentMethodKey =
    | "cash"
    | "cash_on_delivery"
    | "bank_transfer"
    | "bkash"
    | "nagad"
    | "rocket"
    | "card";

export interface PaymentMethod {
    payment_method: PaymentMethodKey;
    payment_note: string | null;
}

export interface VendorPaymentMethods {
    vendor: {
        vendor_id: number;
        vendor_name: string;
        vendor_slug: string;
        vendor_status: string;
    };
    methods: PaymentMethod[];
}

export interface BusinessDetail {
    business: BusinessCard & {
        vendor_phone: string;
        vendor_whatsapp: string | null;
        vendor_email: string | null;
        vendor_website: string | null;
        vendor_lat: string | null;
        vendor_lng: string | null;
        vendor_created_at: string;
    };
    categories: { name: string; name_bn: string | null; slug: string }[];
    hours: OpeningHoursRow[];
    photos: Photo[];
    listings: Offering[];
    facts: Fact[];
    reviews: Review[];
    ratingDistribution: { rating: number; count: number }[];
    similar: SimilarBusiness[];
    /** Owner's social pages, full https URLs. */
    social: SocialLink[];
}

export type SocialPlatform = "facebook" | "instagram" | "youtube" | "tiktok";

export interface SocialLink {
    platform: SocialPlatform;
    url: string;
}

// Provider dashboard (GET /api/vendors/:id/dashboard)

export type DashboardPeriod = 7 | 30 | 90;

export type VendorStatus = "draft" | "pending" | "approved" | "rejected" | "suspended";

export type ListingStatus = "draft" | "pending" | "approved" | "rejected" | "archived";

/** A count for the current period and the one before it. */
export interface PeriodCount {
    current: number;
    previous: number;
}

export interface VendorDashboard {
    vendor: {
        vendor_id: number;
        vendor_slug: string;
        vendor_name: string;
        vendor_description: string | null;
        vendor_phone: string;
        vendor_email: string | null;
        vendor_address: string | null;
        vendor_logo_url: string | null;
        vendor_cover_url: string | null;
        vendor_status: VendorStatus;
        vendor_rejection_reason: string | null;
        is_verified: boolean;
        vendor_created_at: string;
        area_name: string | null;
        primary_category: string | null;
        /** Null until the business is approved, or when hours are unknown. */
        open_state: OpenState;
        close_time_today: string | null;
    };
    days: DashboardPeriod;
    stats: {
        profileViews: PeriodCount;
        searchAppearances: PeriodCount;
        listings: { active: number; addedInPeriod: number; pending: number; total: number };
        rating: { average: number | null; count: number };
    };
    /** One row per day, oldest first, zero-filled. `day` is YYYY-MM-DD. */
    series: { day: string; views: number; appearances: number }[];
    listings: {
        listing_id: number;
        listing_title: string;
        /** NUMERIC, so a string. */
        listing_price: string | null;
        listing_price_max: string | null;
        listing_price_unit: string | null;
        listing_status: ListingStatus;
        category_name: string | null;
        photo_url: string | null;
    }[];
}

export type MemberRole = "owner" | "manager";

/** GET /api/vendor-account/businesses: every business the signed-in vendor runs. */
export interface VendorPickerRow {
    vendor_id: number;
    vendor_name: string;
    vendor_slug: string;
    vendor_status: VendorStatus;
    member_role: MemberRole;
}

/** GET /api/vendors/:id/members */
export interface BusinessMember {
    user_id: number;
    user_name: string;
    user_phone: string;
    member_role: MemberRole;
    added_at: string;
}

/** GET /api/vendors/:id/summary */
export interface VendorSummary {
    vendor_id: number;
    vendor_name: string;
    vendor_slug: string;
    vendor_status: VendorStatus;
}

// Add / Edit Business (GET and PUT /api/vendors/:id/profile)

export type HoursMode = "open" | "closed" | "24h";

/** One day's hours. `day` is 0 = Sunday to 6 = Saturday; times are HH:MM. */
export interface HoursEntry {
    day: number;
    mode: HoursMode;
    open: string | null;
    close: string | null;
}

export interface FactEntry {
    label: string;
    value: string;
    /** "about" beside the description, "quick" in the sidebar summary. */
    group: "about" | "quick";
}

export interface VendorProfile {
    vendor: {
        vendor_id: number;
        vendor_slug: string;
        vendor_name: string;
        vendor_name_bn: string | null;
        vendor_description: string | null;
        vendor_phone: string;
        vendor_whatsapp: string | null;
        vendor_email: string | null;
        vendor_website: string | null;
        vendor_address: string | null;
        location_id: number | null;
        vendor_logo_url: string | null;
        vendor_cover_url: string | null;
        vendor_status: VendorStatus;
        vendor_rejection_reason: string | null;
    };
    category_ids: number[];
    /** Days without an entry have no hours recorded. */
    hours: HoursEntry[];
    /** In display order; the first is the cover. */
    photos: { id: number; url: string }[];
    facts: FactEntry[];
    social: Partial<Record<SocialPlatform, string>>;
    listings: { total: number; live: number };
}

export interface ProfileLimits {
    nameMin: number;
    nameMax: number;
    addressMax: number;
    descriptionMin: number;
    descriptionMax: number;
    categoriesMax: number;
    factsMax: number;
    factLabelMax: number;
    factValueMax: number;
    emailMax: number;
    websiteMax: number;
    photosMax: number;
}

export interface VendorProfileWithOptions extends VendorProfile {
    options: {
        categories: { id: number; name: string; parent: string }[];
        areas: { id: number; name: string; city: string }[];
    };
    limits: ProfileLimits;
}

/** Body of PUT /api/vendors/:id/profile. */
export interface VendorProfileInput {
    name: string;
    name_bn: string;
    category_ids: number[];
    location_id: number | null;
    address: string;
    phone: string;
    whatsapp: string;
    description: string;
    email: string;
    website: string;
    facts: FactEntry[];
    social: Partial<Record<SocialPlatform, string>>;
    hours: HoursEntry[];
    photo_order: number[];
    /** Send a draft or rejected business for approval. */
    submit: boolean;
}

export type SaveProfileResult =
    | { ok: true; profile: VendorProfile }
    | { ok: false; error: string; errors?: Record<string, string> };

// Admin approvals (GET /api/admin/queue)

export interface PendingBusiness {
    vendor_id: number;
    vendor_slug: string;
    vendor_name: string;
    vendor_name_bn: string | null;
    vendor_description: string | null;
    vendor_phone: string;
    vendor_whatsapp: string | null;
    vendor_email: string | null;
    vendor_website: string | null;
    vendor_address: string | null;
    vendor_cover_url: string | null;
    vendor_logo_url: string | null;
    vendor_created_at: string;
    vendor_updated_at: string;
    area_name: string | null;
    owner_name: string;
    owner_phone: string;
    owner_phone_verified: boolean;
    categories: string | null;
    listing_count: number;
    photo_count: number;
    hours_days: number;
    owner_other_businesses: number;
    /** Rejected before and sent back by the owner. */
    resubmitted: boolean;
}

export interface PendingListing {
    listing_id: number;
    listing_title: string;
    listing_title_bn: string | null;
    listing_description: string | null;
    listing_price: string | null;
    listing_price_max: string | null;
    listing_price_unit: string | null;
    listing_min_order_qty: number | null;
    listing_created_at: string;
    category_name: string | null;
    vendor_id: number;
    vendor_name: string;
    vendor_slug: string;
    vendor_status: VendorStatus;
    photo_url: string | null;
}

export interface AdminDecisionLog {
    /** BIGSERIAL, which node-pg returns as a string. */
    audit_id: string;
    audit_action: `${"vendor" | "listing" | "event"}.${"approve" | "reject"}`;
    audit_target_type: "vendor" | "listing" | "event";
    audit_target_id: number;
    reason: string | null;
    audit_created_at: string;
    actor_name: string | null;
    target_label: string | null;
}

export interface AdminQueue {
    vendors: PendingBusiness[];
    listings: PendingListing[];
    events: PendingEvent[];
    recent: AdminDecisionLog[];
}

export type AdminDecision = "approve" | "reject";

export type AdminDecisionResult = { ok: true } | { ok: false; error: string };

export interface Customer {
    user_id: number;
    user_name: string;
    user_phone: string;
    user_email: string | null;
    saved_count: number;
    review_count: number;
    unread_messages: number;
    offers_count: number;
}

// Admin settings (KAN-293).
export interface AdminSetting {
    key: string;
    // "boolean" settings are switches; "integer" ones are numbers between min and max.
    type: "boolean" | "integer";
    group: "approval" | "marketing";
    min?: number;
    max?: number;
    label: string;
    help: string;
    value: boolean | number;
    updated_at: string | null;
    updated_by: string | null;
}

export interface AdminSettings {
    settings: AdminSetting[];
    waiting: { businesses: number; listings: number; events?: number };
}

export interface PublicSettings {
    require_business_approval: boolean;
    require_listing_approval: boolean;
    require_event_approval: boolean;
}

export type OfferChannel = "email" | "sms";

export interface SavedBusiness extends BusinessCard {
    saved_at: string;
    // Channels the customer gets offers on from this business (KAN-284).
    offer_channels: OfferChannel[];
}

export interface UnsubscribeLink {
    business: { vendor_name: string; vendor_name_bn: string | null; vendor_slug: string };
    channel: OfferChannel;
    subscribed: boolean;
}

export interface ViewerState {
    vendor_id: number;
    saved: boolean;
    review: { rating: number; body: string | null; status: string } | null;
}

export interface MyReview {
    review_id: number;
    rating: number;
    body: string | null;
    status: string;
    created_at: string;
    reply: string | null;
    replied_at: string | null;
    vendor_id: number;
    vendor_name: string;
    vendor_slug: string;
}

export interface OwnerReview {
    review_id: number;
    rating: number;
    body: string | null;
    status: string;
    created_at: string;
    reply: string | null;
    replied_at: string | null;
    author: string;
}

export interface ConversationSummary {
    conversation_id: number;
    status: string;
    last_message_at: string | null;
    vendor_id: number;
    vendor_name: string;
    vendor_slug: string;
    customer_name: string;
    listing_id: number | null;
    listing_title: string | null;
    /** Set when the business wrote about one of its events (KAN-298). */
    event_id: number | null;
    event_title: string | null;
    event_slug: string | null;
    last_message: string | null;
    unread: number;
}

export interface Message {
    message_id: number;
    body: string;
    created_at: string;
    read_at: string | null;
    mine: boolean;
}

export interface ConversationThread {
    conversation: {
        conversation_id: number;
        status: string;
        vendor_id: number;
        vendor_name: string;
        vendor_slug: string;
        customer_name: string;
        listing_id: number | null;
        listing_title: string | null;
        event_id: number | null;
        event_title: string | null;
        event_slug: string | null;
    };
    messages: Message[];
}

export interface Alert {
    id: number;
    type: string;
    payload: { conversation_id?: number; from?: string; preview?: string };
    read_at: string | null;
    created_at: string;
}

export interface AlertList {
    alerts: Alert[];
    unread: number;
}

export interface OwnerDetails {
    user_id: number;
    user_name: string;
    user_phone: string;
    user_email: string | null;
    member_role: MemberRole;
}

export type ReportTargetType = "vendor" | "listing" | "review" | "message";

export interface AdminReport {
    report_id: number;
    target_type: ReportTargetType;
    target_id: number;
    reason: string;
    details: string | null;
    status: "open" | "actioned" | "dismissed";
    created_at: string;
    resolved_at: string | null;
    reporter_name: string | null;
    resolver_name: string | null;
    target_label: string | null;
    business_slug: string | null;
}

export interface AdminReview {
    review_id: number;
    rating: number;
    body: string | null;
    status: string;
    created_at: string;
    author: string;
    vendor_name: string;
    vendor_slug: string;
    open_reports: number;
}

export interface AdminTrends {
    days: number;
    totals: { searches: number; profile_views: number; new_businesses: number; new_reviews: number };
    daily: { day: string; active_users: number; searches: number }[];
    top: { query: string; searches: number; avg_results: string }[];
    noResults: { query: string; searches: number }[];
}

/** An event as the public pages show it (GET /events and /events/:slug). */
export interface EventDetail extends EventItem {
    event_description: string | null;
    event_image_url: string | null;
    event_status: EventStatus;
    event_type: EventType;
    event_is_online: boolean;
    event_online_url: string | null;
    event_price_type: "free" | "paid";
    /** NUMERIC, returned by `pg` as a string. */
    event_price_bdt: string | null;
    event_ticket_url: string | null;
    area_name: string | null;
    area_slug: string | null;
    vendor_name: string | null;
    vendor_slug: string | null;
    vendor_logo_url: string | null;
    going_count: number;
    interested_count: number;
    /** It has finished (or started, without an end time), by the database's clock. */
    ended: boolean;
    /** Only on GET /events/:slug. */
    photos?: EventPhoto[];
}

/** The signed-in customer's answer (GET/PUT /events/:id/response). */
export interface EventResponseState {
    response: EventResponse | null;
    going_count: number;
    interested_count: number;
}

/** GET /me/events */
export interface MyEvent extends EventDetail {
    response_type: EventResponse;
}

/** An event as its business manages it (GET /vendors/:id/events, /events/:id/manage). */
export interface VendorEvent {
    event_id: number;
    vendor_id: number | null;
    event_title: string;
    event_title_bn: string | null;
    event_slug: string;
    event_description: string | null;
    event_type: EventType;
    event_venue: string | null;
    location_id: number | null;
    area_name: string | null;
    event_starts_at: string;
    event_ends_at: string | null;
    event_is_online: boolean;
    event_online_url: string | null;
    event_price_type: "free" | "paid";
    event_price_bdt: string | null;
    event_ticket_url: string | null;
    event_image_url: string | null;
    event_status: EventStatus;
    event_rejection_reason: string | null;
    going_count: number;
    interested_count: number;
    ended: boolean;
    photo_count: number;
    /** Only on /events/:id/manage. */
    photos?: EventPhoto[];
}

/** GET /admin/queue events. */
export interface PendingEvent {
    event_id: number;
    event_title: string;
    event_title_bn: string | null;
    event_slug: string;
    event_description: string | null;
    event_type: EventType;
    event_venue: string | null;
    event_is_online: boolean;
    event_online_url: string | null;
    event_starts_at: string;
    event_ends_at: string | null;
    event_price_type: "free" | "paid";
    event_price_bdt: string | null;
    event_ticket_url: string | null;
    event_image_url: string | null;
    event_created_at: string;
    area_name: string | null;
    vendor_id: number | null;
    vendor_name: string | null;
    vendor_slug: string | null;
    vendor_status: string | null;
    photo_count: number;
    resubmitted: boolean;
}

export interface AdminCategory {
    id: number;
    parent_id: number | null;
    name: string;
    name_bn: string | null;
    slug: string;
    icon: string | null;
    sort_order: number;
    is_active: boolean;
    business_count: number;
}

export interface CategoryInput {
    name: string;
    name_bn: string;
    icon: string;
    sort_order: number;
}

// ---------- Marketing passes (GET /api/admin/marketing) ----------

export type MarketingPassStatus = "pending" | "active" | "expired" | "suspended" | "cancelled";

export interface MarketingPackage {
    package_id: number;
    package_name: string;
    package_duration_days: number;
    /** NUMERIC, returned as a string. */
    package_price_bdt: string;
    package_email_campaign_limit: number;
    package_ai_action_limit: number;
    package_sms_limit: number;
    package_is_active: boolean;
}

export interface MarketingPassRow {
    subscription_id: number;
    vendor_id: number;
    vendor_name: string;
    vendor_slug: string;
    package_name: string;
    /** The stored status, except a running pass past its end date shows as "expired". */
    effective_status: MarketingPassStatus;
    subscription_starts_at: string | null;
    subscription_ends_at: string | null;
    subscription_price_bdt: string;
    subscription_status_reason: string | null;
    activated_by_name: string | null;
}

export interface AdminMarketing {
    packages: MarketingPackage[];
    passes: MarketingPassRow[];
    businesses: { vendor_id: number; vendor_name: string; has_active_pass: boolean }[];
}

// Marketing workspace (KAN-285): GET /api/vendors/:id/marketing/workspace and the campaign routes.

export interface PassAllowance {
    limit: number;
    used: number;
    left: number;
}

export interface MarketingPassSummary {
    subscription_id: number;
    status: "pending" | "active" | "expired" | "suspended" | "cancelled";
    package: { package_id: number; name: string; duration_days: number };
    starts_at: string | null;
    ends_at: string | null;
    days_left: number;
    reason: string | null;
    allowances: { email_campaign: PassAllowance; ai_action: PassAllowance; sms: PassAllowance };
}

export interface ReadinessCheck {
    key: string;
    label: string;
    done: boolean;
    fix: "dashboard" | "listings" | "business";
}

export type CampaignGoal = "new_stock" | "offer" | "event" | "reminder";
export type CampaignCta = "visit" | "call" | "message" | "order";
export type CampaignStatus = "draft" | "approved" | "sending" | "sent" | "failed";

// An offer's coupon code. Valid for the offer's dates (from when the campaign was made if there is
// no start day) and expired after the last day; the API works out the status from today in Bangladesh.
export type CampaignCoupon = { code: string; starts_on: string | null; ends_on: string; status: "upcoming" | "active" | "expired" };

export interface PromotableListing {
    listing_id: number;
    listing_title: string;
    listing_title_bn: string | null;
    listing_price: string | null;
    listing_price_max: string | null;
    listing_price_unit: string | null;
    photo_url: string | null;
}

export interface CampaignListRow {
    campaign_id: number;
    campaign_title: string;
    campaign_goal: CampaignGoal;
    campaign_language: "en" | "bn";
    campaign_status: CampaignStatus;
    campaign_updated_at: string;
    versions: number;
    coupon: CampaignCoupon | null;
    posted_on: PostChannel[];
}

// Facebook and WhatsApp aren't connected: the owner posts the text and marks it as posted (KAN-287).
export type PostChannel = "facebook" | "whatsapp";
export type CampaignPost = { url: string | null; posted_at: string; marked_by: string | null; version_number: number | null };

// What the business's marketing did over the last `days`, against the period before (KAN-287).
export type MarketingSource = "sponsored" | "email" | "facebook" | "whatsapp" | "share";
export interface MarketingResults {
    days: number;
    // Every visit marketing brought to the page, and where each came from.
    marketing_visits: { current: number; previous: number };
    visits_by_source: Record<MarketingSource, { current: number; previous: number }>;
    sponsored_views: { current: number; previous: number };
    shared_link_views: { current: number; previous: number };
    search_appearances: { current: number; previous: number };
    email: { campaigns_sent: number; emails_sent: number; emails_failed: number; subscribed: number; unsubscribed: number };
    posts: Record<PostChannel, number>;
    recent: {
        campaign_id: number;
        campaign_title: string;
        campaign_sent_at: string | null;
        emails_sent: number;
        visits: number;
        posted_on: PostChannel[];
        last_activity: string;
    }[];
}

export interface MarketingWorkspace {
    pass: MarketingPassSummary | null;
    // free: never paid (or cancelled); ended: the pass ran out; suspended: blocked by an admin.
    plan: "pass" | "free" | "ended" | "suspended";
    free_emails_per_month: number;
    // The free plan's emails this calendar month (Bangladesh time).
    free_emails: { limit: number; used: number; left: number };
    ended_emails_per_week: number;
    // Customers who chose to get this business's offers by email.
    email_subscribers: number;
    readiness: { checks: ReadinessCheck[]; can_start: boolean; approved_listings: number };
    can_create: boolean;
    cannot_create_reason: string | null;
    max_listings: number;
    listings: PromotableListing[];
    campaigns: CampaignListRow[];
}

// photos: whether the channel goes out with photos. Missing (versions saved before the switch) means on.
// Sending by email (KAN-286): before sending, who it goes to and whether the allowance covers it;
// after, when it went and how many emails the provider accepted.
export type CampaignSendInfo =
    | {
          audience: number;
          // Which allowance it uses: the pass, the free plan's monthly email, or the ended pass's weekly email.
          plan: "active" | "free" | "expired" | null;
          left_after: number | null;
          can_send: boolean;
          reason: string | null;
      }
    | { sent_at: string; results: { sent: number; failed: number } | null };

export interface CampaignContent {
    email: { subject: string; body: string; photos?: boolean };
    facebook: { text: string; photos?: boolean };
    whatsapp: { text: string; photos?: boolean };
}

export interface CampaignVersion {
    version_id: number;
    version_number: number;
    version_content: CampaignContent;
    version_method: "template" | "manual" | "ai";
    version_created_at: string;
    created_by: string | null;
}

export interface CampaignSnapshot {
    taken_at: string;
    business: {
        name: string;
        name_bn: string | null;
        slug: string;
        phone: string | null;
        address: string | null;
        area: string | null;
        area_bn: string | null;
        logo_url: string | null;
        cover_url: string | null;
        page_url: string;
    };
    listings: {
        listing_id: number;
        title: string;
        title_bn: string | null;
        price: number | null;
        price_max?: number | null;
        price_unit?: string | null;
        photo_url: string | null;
    }[];
}

export interface CampaignDetail {
    campaign_id: number;
    title: string;
    status: CampaignStatus;
    brief: {
        goal: CampaignGoal;
        language: "en" | "bn";
        call_to_action: CampaignCta;
        offer: string | null;
        coupon_code: string | null;
        starts_on: string | null;
        ends_on: string | null;
        listing_ids: number[];
    };
    snapshot: CampaignSnapshot;
    approved_version_id: number | null;
    approved_at: string | null;
    created_at: string;
    updated_at: string;
    versions: CampaignVersion[];
    latest_version_id: number;
    warnings: string[];
    placeholders: string[];
    send: CampaignSendInfo;
    coupon: CampaignCoupon | null;
    posts: Record<PostChannel, CampaignPost | null>;
    // Visits to the business page from this campaign's links, by channel.
    visits: { email: number; facebook: number; whatsapp: number };
}
