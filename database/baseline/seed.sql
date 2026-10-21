--consolidatedSeed
-- Seed data (v2): sample merchants for silk, handicrafts, agro-supplies and light manufacturing.

-- The baseline schema dump clears the session search_path.
-- Restore the project schema before using unqualified table names.
SET search_path TO public, pg_catalog;

BEGIN;

-- Locations: country > division > district > city > area.
INSERT INTO locations (location_parent_id, location_name, location_name_bn, location_type, location_slug, location_path) VALUES
    (NULL, 'Bangladesh', 'বাংলাদেশ', 'country', 'bd', 'bd');

INSERT INTO locations (location_parent_id, location_name, location_name_bn, location_type, location_slug, location_path)
SELECT location_id, 'Rajshahi Division', 'রাজশাহী বিভাগ', 'division', 'rajshahi-division', location_path || '/rajshahi-division'
FROM locations WHERE location_slug = 'bd';

INSERT INTO locations (location_parent_id, location_name, location_name_bn, location_type, location_slug, location_path)
SELECT location_id, 'Sylhet Division', 'সিলেট বিভাগ', 'division', 'sylhet-division', location_path || '/sylhet-division'
FROM locations WHERE location_slug = 'bd';

INSERT INTO locations (location_parent_id, location_name, location_name_bn, location_type, location_slug, location_path)
SELECT location_id, 'Rajshahi District', 'রাজশাহী জেলা', 'district', 'rajshahi-district', location_path || '/rajshahi-district'
FROM locations WHERE location_slug = 'rajshahi-division';

INSERT INTO locations (location_parent_id, location_name, location_name_bn, location_type, location_slug, location_path)
SELECT location_id, 'Rajshahi City', 'রাজশাহী শহর', 'city', 'rajshahi-city', location_path || '/rajshahi-city'
FROM locations WHERE location_slug = 'rajshahi-district';

INSERT INTO locations (location_parent_id, location_name, location_name_bn, location_type, location_slug, location_path)
SELECT l.location_id, a.name, a.name_bn, 'area', a.slug, l.location_path || '/' || a.slug
FROM locations l
CROSS JOIN (VALUES
    ('Shaheb Bazar', 'সাহেব বাজার', 'shaheb-bazar'),
    ('Laxmipur',     'লক্ষ্মীপুর',   'laxmipur'),
    ('Kazla',        'কাজলা',       'kazla'),
    ('Talaimari',    'তালাইমারী',   'talaimari'),
    ('Binodpur',     'বিনোদপুর',    'binodpur'),
    ('Upashahar',    'উপশহর',       'upashahar'),
    ('Naodapara',    'নওদাপাড়া',    'naodapara')
) AS a(name, name_bn, slug)
WHERE l.location_slug = 'rajshahi-city';

-- Categories -- top level then children
INSERT INTO categories (category_parent_id, category_name, category_name_bn, category_slug, category_icon, category_sort_order) VALUES
    (NULL, 'Silk & Textiles',      'সিল্ক ও বস্ত্র',        'silk-textiles',      'shirt',    10),
    (NULL, 'Handicrafts',          'হস্তশিল্প',             'handicrafts',        'palette',  20),
    (NULL, 'Agro Supplies',        'কৃষি সরঞ্জাম',          'agro-supplies',      'sprout',   30),
    (NULL, 'Light Manufacturing',  'হালকা প্রকৌশল',         'light-manufacturing','factory',  40),
    (NULL, 'Health',               'স্বাস্থ্য',              'health',             'heart',    50),
    (NULL, 'Tourism & Hospitality','পর্যটন ও আতিথেয়তা',    'tourism',            'map-pin',  60);

INSERT INTO categories (category_parent_id, category_name, category_name_bn, category_slug, category_sort_order)
SELECT p.category_id, c.name, c.name_bn, c.slug, c.sort
FROM categories p
JOIN (VALUES
    ('silk-textiles',       'Silk Sarees',          'সিল্ক শাড়ি',        'silk-sarees',        1),
    ('silk-textiles',       'Raw Silk & Yarn',      'কাঁচা সিল্ক ও সুতা', 'raw-silk-yarn',      2),
    ('silk-textiles',       'Tailoring',            'দর্জি',              'tailoring',          3),
    ('handicrafts',         'Jute Products',        'পাটজাত পণ্য',       'jute-products',      1),
    ('handicrafts',         'Bamboo & Cane',        'বাঁশ ও বেত',        'bamboo-cane',        2),
    ('handicrafts',         'Pottery',              'মৃৎশিল্প',           'pottery',            3),
    ('agro-supplies',       'Seeds & Fertiliser',   'বীজ ও সার',         'seeds-fertiliser',   1),
    ('agro-supplies',       'Mango & Fruit Trade',  'আম ও ফল ব্যবসা',    'mango-fruit-trade',  2),
    ('agro-supplies',       'Farm Machinery',       'কৃষি যন্ত্রপাতি',    'farm-machinery',     3),
    ('light-manufacturing', 'Metal Fabrication',    'ধাতব নির্মাণ',       'metal-fabrication',  1),
    ('light-manufacturing', 'Plastic & Packaging',  'প্লাস্টিক ও প্যাকেজিং','plastic-packaging',2),
    ('health',              'Pharmacy',             'ফার্মেসি',           'pharmacy',           1),
    ('health',              'Diagnostic Centre',    'ডায়াগনস্টিক সেন্টার','diagnostic-centre',  2),
    ('health',              'Doctor Chamber',       'ডাক্তারের চেম্বার',  'doctor-chamber',     3),
    ('tourism',             'Hotels & Guest Houses','হোটেল ও গেস্ট হাউস','hotels',             1),
    ('tourism',             'Tour Operators',       'ট্যুর অপারেটর',      'tour-operators',     2)
) AS c(parent_slug, name, name_bn, slug, sort)
  ON p.category_slug = c.parent_slug;

-- Users: user_password_hash below is a DEV-ONLY bcrypt hash of "Password123!".
INSERT INTO users (user_phone, user_email, user_name, user_password_hash, user_role, user_phone_verified_at) VALUES
    ('+8801711000001', 'admin@shahebbazar.com', 'Platform Admin',
     '$2b$12$Xk9uJmQx0v0hFqUeR7bF9uYt3WcHfPjLmN2sQ8vZaD5eK1gT4rC6y', 'admin', NOW()),
    ('+8801711000002', NULL, 'Rafiqul Islam',  NULL, 'vendor', NOW()),
    ('+8801711000003', NULL, 'Nasrin Akter',   NULL, 'vendor', NOW()),
    ('+8801711000004', NULL, 'Abdul Karim',    NULL, 'vendor', NOW()),
    ('+8801711000005', NULL, 'Shahidul Haque', NULL, 'vendor', NOW()),
    ('+8801711000006', NULL, 'Momena Begum',   NULL, 'vendor', NOW()),
    ('+8801711000007', NULL, 'Jahangir Alam',  NULL, 'vendor', NOW()),
    ('+8801711000008', NULL, 'Tanvir Hossain', NULL, 'vendor', NOW()),
    ('+8801711000009', NULL, 'Selina Parvin',  NULL, 'vendor', NOW()),
    ('+8801722000001', 'imran.customer@example.com', 'Imran Chowdhury', NULL, 'customer', NOW()),
    ('+8801722000002', NULL, 'Farhana Yasmin',  NULL, 'customer', NOW());

-- Vendors: eight approved, one pending and one rejected, so the moderation queue is populated on first load.
INSERT INTO vendors (
    user_id, vendor_name, vendor_name_bn, vendor_slug, vendor_description,
    vendor_phone, vendor_whatsapp, vendor_address, location_id,
    vendor_lat, vendor_lng, vendor_business_type, vendor_status,
    vendor_verified_at, vendor_is_featured
)
SELECT u.user_id, v.name, v.name_bn, v.slug, v.descr,
       v.phone, v.phone, v.address, l.location_id,
       v.lat, v.lng, v.btype, v.status,
       CASE WHEN v.status = 'approved' THEN NOW() END,
       v.featured
FROM (VALUES
    ('+8801711000002', 'Shaheb Bazar Silk House', 'সাহেব বাজার সিল্ক হাউস', 'shaheb-bazar-silk-house',
     'Hand-loom and power-loom silk sarees woven in Rajshahi. Wholesale and retail, custom orders accepted.',
     '+8801711000002', 'Zero Point, Shaheb Bazar, Rajshahi', 'shaheb-bazar',
     24.371500, 88.601200, 'both', 'approved', TRUE),

    ('+8801711000003', 'Padma Handicrafts', 'পদ্মা হস্তশিল্প', 'padma-handicrafts',
     'Jute bags, bamboo baskets and cane furniture made by a women-led artisan group. Bulk export orders welcome.',
     '+8801711000003', 'Laxmipur More, Rajshahi', 'laxmipur',
     24.365400, 88.597800, 'both', 'approved', FALSE),

    ('+8801711000004', 'Barind Agro Supplies', 'বরেন্দ্র কৃষি সরঞ্জাম', 'barind-agro-supplies',
     'Certified seed, fertiliser and pesticide for the Barind tract. Supplies to farmer co-operatives across Rajshahi district.',
     '+8801711000004', 'Naodapara Bazar, Rajshahi', 'naodapara',
     24.400100, 88.632400, 'b2b', 'approved', FALSE),

    ('+8801711000005', 'Rajshahi Mango Traders', 'রাজশাহী আম ব্যবসায়ী', 'rajshahi-mango-traders',
     'Seasonal wholesale of Khirsapat, Langra and Fazli mango. Carbide-free, packed and shipped nationwide.',
     '+8801711000005', 'Shaheb Bazar Road, Rajshahi', 'shaheb-bazar',
     24.372800, 88.603500, 'b2b', 'approved', TRUE),

    ('+8801711000006', 'Uttara Light Engineering', 'উত্তরা লাইট ইঞ্জিনিয়ারিং', 'uttara-light-engineering',
     'Metal fabrication, grill work, water tank stands and small machine parts. Job work for local manufacturers.',
     '+8801711000006', 'Kazla, Rajshahi', 'kazla',
     24.363900, 88.638200, 'b2b', 'approved', FALSE),

    ('+8801711000007', 'Green Life Pharmacy', 'গ্রীন লাইফ ফার্মেসি', 'green-life-pharmacy',
     'Licensed pharmacy open until midnight. Prescription medicine, diabetic supplies and home delivery within the city.',
     '+8801711000007', 'Talaimari More, Rajshahi', 'talaimari',
     24.367200, 88.628900, 'b2c', 'approved', FALSE),

    ('+8801711000008', 'Padma Diagnostic Centre', 'পদ্মা ডায়াগনস্টিক সেন্টার', 'padma-diagnostic-centre',
     'Pathology, ultrasound and X-ray with on-site consultant chambers. Reports the same day.',
     '+8801711000008', 'Binodpur Bazar, Rajshahi', 'binodpur',
     24.369100, 88.641500, 'b2c', 'approved', FALSE),

    ('+8801711000009', 'Padma Garden Tours', 'পদ্মা গার্ডেন ট্যুরস', 'padma-garden-tours',
     'Day trips to Puthia temple complex, Varendra Museum and the Padma embankment. Guides in Bangla and English.',
     '+8801711000009', 'Upashahar, Rajshahi', 'upashahar',
     24.358700, 88.612300, 'b2c', 'approved', FALSE),

    -- Pending approval; appears in v_moderation_queue.
    ('+8801711000002', 'Shaheb Bazar Cloth Store', 'সাহেব বাজার কাপড় স্টোর', 'shaheb-bazar-cloth-store',
     'Second shop of the same owner, submitted and not yet reviewed.',
     '+8801711000002', 'Shaheb Bazar, Rajshahi', 'shaheb-bazar',
     24.371900, 88.602100, 'b2c', 'pending', FALSE),

    -- Rejected, exercising the rejection path.
    ('+8801711000003', 'Quick Cash Loans BD', 'কুইক ক্যাশ লোন বিডি', 'quick-cash-loans-bd',
     'Rejected sample: unlicensed lending, outside the platform categories.',
     '+8801711000003', 'Unknown', 'laxmipur',
     24.365000, 88.597000, 'b2c', 'rejected', FALSE)
) AS v(owner_phone, name, name_bn, slug, descr, phone, address, area_slug,
       lat, lng, btype, status, featured)
JOIN users     u ON u.user_phone   = v.owner_phone
JOIN locations l ON l.location_slug = v.area_slug;

UPDATE vendors SET vendor_rejection_reason = 'Financial services are out of scope for Phase 1.'
WHERE vendor_slug = 'quick-cash-loans-bd';

UPDATE vendors v SET vendor_verified_by = (SELECT user_id FROM users WHERE user_role = 'admin')
WHERE v.vendor_status = 'approved';

UPDATE vendors SET vendor_featured_until = NOW() + INTERVAL '30 days'
WHERE vendor_is_featured;

-- Vendor <-> category
INSERT INTO vendor_categories (vendor_id, category_id)
SELECT v.vendor_id, c.category_id
FROM (VALUES
    ('shaheb-bazar-silk-house',   'silk-sarees'),
    ('shaheb-bazar-silk-house',   'raw-silk-yarn'),
    ('padma-handicrafts',         'jute-products'),
    ('padma-handicrafts',         'bamboo-cane'),
    ('barind-agro-supplies',      'seeds-fertiliser'),
    ('barind-agro-supplies',      'farm-machinery'),
    ('rajshahi-mango-traders',    'mango-fruit-trade'),
    ('uttara-light-engineering',  'metal-fabrication'),
    ('green-life-pharmacy',       'pharmacy'),
    ('padma-diagnostic-centre',   'diagnostic-centre'),
    ('padma-diagnostic-centre',   'doctor-chamber'),
    ('padma-garden-tours',        'tour-operators'),
    ('shaheb-bazar-cloth-store',  'silk-sarees')
) AS m(vendor_slug, category_slug)
JOIN vendors    v ON v.vendor_slug   = m.vendor_slug
JOIN categories c ON c.category_slug = m.category_slug;

-- Listings
INSERT INTO vendor_listings (
    vendor_id, category_id, listing_title, listing_title_bn, listing_slug,
    listing_description, listing_price, listing_price_max, listing_price_unit,
    listing_min_order_qty, listing_is_negotiable, listing_status
)
SELECT v.vendor_id, c.category_id, x.title, x.title_bn, x.slug,
       x.descr, x.price, x.price_max, x.unit, x.moq, x.negotiable, x.status
FROM (VALUES
    ('shaheb-bazar-silk-house', 'silk-sarees', 'Katan Silk Saree', 'কাতান সিল্ক শাড়ি', 'katan-silk-saree',
     'Pure Rajshahi katan silk with zari border. Available in twelve colours, custom blouse piece included.',
     3500.00, 9000.00, 'piece', 1, TRUE, 'approved'),
    ('shaheb-bazar-silk-house', 'silk-sarees', 'Block Print Silk Saree', 'ব্লক প্রিন্ট সিল্ক শাড়ি', 'block-print-silk-saree',
     'Hand block printed on mulberry silk. Wholesale rate applies from twenty pieces.',
     1800.00, 2600.00, 'piece', 20, TRUE, 'approved'),
    ('shaheb-bazar-silk-house', 'raw-silk-yarn', 'Mulberry Raw Silk Yarn', 'তুঁত কাঁচা সিল্ক সুতা', 'mulberry-raw-silk-yarn',
     'Reeled mulberry yarn, 20/22 denier, sold by the kilogram to weavers.',
     4200.00, NULL, 'kg', 5, TRUE, 'approved'),

    ('padma-handicrafts', 'jute-products', 'Jute Shopping Bag', 'পাটের শপিং ব্যাগ', 'jute-shopping-bag',
     'Laminated jute bag with cotton handle. Screen printing available for bulk orders.',
     120.00, 260.00, 'piece', 100, TRUE, 'approved'),
    ('padma-handicrafts', 'bamboo-cane', 'Cane Storage Basket', 'বেতের ঝুড়ি', 'cane-storage-basket',
     'Woven cane basket in three sizes, natural or lacquered finish.',
     450.00, 1100.00, 'piece', 10, TRUE, 'approved'),

    ('barind-agro-supplies', 'seeds-fertiliser', 'BRRI Dhan-28 Certified Seed', 'ব্রি ধান-২৮ বীজ', 'brri-dhan-28-seed',
     'Government certified boro paddy seed, current season lot with germination certificate.',
     78.00, NULL, 'kg', 40, FALSE, 'approved'),
    ('barind-agro-supplies', 'farm-machinery', 'Power Tiller Blade Set', 'পাওয়ার টিলার ব্লেড সেট', 'power-tiller-blade-set',
     'Hardened blade set fitting common 12 HP tillers. Fits Dongfeng and Sifang units.',
     3200.00, 3900.00, 'set', 2, TRUE, 'approved'),

    ('rajshahi-mango-traders', 'mango-fruit-trade', 'Khirsapat Mango (Himsagar)', 'খিরসাপাত আম', 'khirsapat-mango',
     'Carbide-free Khirsapat picked to order in season. Packed in ventilated crates, courier arranged.',
     2800.00, 4200.00, 'maund', 1, TRUE, 'approved'),
    ('rajshahi-mango-traders', 'mango-fruit-trade', 'Fazli Mango Wholesale', 'ফজলি আম পাইকারি', 'fazli-mango-wholesale',
     'Late-season Fazli for wholesale buyers. Minimum five maund per consignment.',
     2200.00, 3000.00, 'maund', 5, TRUE, 'approved'),

    ('uttara-light-engineering', 'metal-fabrication', 'MS Grill Fabrication', 'এমএস গ্রিল তৈরি', 'ms-grill-fabrication',
     'Mild steel window and balcony grill, made to measure. Rate per square foot including paint.',
     280.00, 420.00, 'sq ft', 50, TRUE, 'approved'),
    ('uttara-light-engineering', 'metal-fabrication', 'Water Tank Stand', 'পানির ট্যাংক স্ট্যান্ড', 'water-tank-stand',
     'Angle iron stand for 500 to 1500 litre tanks, galvanised finish, installed on site.',
     9500.00, 18000.00, 'unit', 1, TRUE, 'approved'),

    ('green-life-pharmacy', 'pharmacy', 'Home Delivery of Prescription Medicine', 'ওষুধ হোম ডেলিভারি', 'medicine-home-delivery',
     'Send a prescription photo and receive delivery inside Rajshahi city within two hours. Free above 500 taka.',
     NULL, NULL, NULL, NULL, FALSE, 'approved'),
    ('green-life-pharmacy', 'pharmacy', 'Diabetic Care Supplies', 'ডায়াবেটিস সামগ্রী', 'diabetic-care-supplies',
     'Glucometers, test strips, lancets and insulin syringes kept in cold chain.',
     650.00, 4500.00, 'item', 1, FALSE, 'approved'),

    ('padma-diagnostic-centre', 'diagnostic-centre', 'Full Blood Count (CBC)', 'সিবিসি পরীক্ষা', 'full-blood-count',
     'Complete blood count with report the same day. No appointment needed.',
     400.00, NULL, 'test', 1, FALSE, 'approved'),
    ('padma-diagnostic-centre', 'diagnostic-centre', 'Ultrasonogram of Whole Abdomen', 'পেটের আল্ট্রাসনোগ্রাম', 'ultrasonogram-whole-abdomen',
     'Performed by a consultant radiologist. Morning and evening slots.',
     1200.00, NULL, 'scan', 1, FALSE, 'approved'),

    ('padma-garden-tours', 'tour-operators', 'Puthia Temple Day Tour', 'পুঠিয়া রাজবাড়ি ভ্রমণ', 'puthia-temple-day-tour',
     'Air-conditioned microbus, guide and lunch. Departs Shaheb Bazar at 8am, returns by 6pm.',
     1500.00, 2200.00, 'person', 4, TRUE, 'approved'),
    ('padma-garden-tours', 'tour-operators', 'Padma River Sunset Boat Trip', 'পদ্মা নদীতে নৌভ্রমণ', 'padma-sunset-boat-trip',
     'Two-hour engine boat trip with snacks and life jackets. Family and group rates.',
     800.00, 1200.00, 'person', 6, TRUE, 'approved'),

    -- Pending listing on an approved shop -- second row in the moderation queue.
    ('shaheb-bazar-silk-house', 'tailoring', 'Custom Blouse Stitching', 'ব্লাউজ সেলাই', 'custom-blouse-stitching',
     'Submitted for review, not yet approved by an admin.',
     350.00, 700.00, 'piece', 1, TRUE, 'pending')
) AS x(vendor_slug, category_slug, title, title_bn, slug, descr,
       price, price_max, unit, moq, negotiable, status)
JOIN vendors    v ON v.vendor_slug   = x.vendor_slug
JOIN categories c ON c.category_slug = x.category_slug;

-- Listing photos: see "Listing photos" at the end of this file (after every listing exists).

-- Quote requests in three states (open, quoted, accepted) so every status is represented.
INSERT INTO quote_requests (
    rfq_public_ref, user_id, rfq_contact_name, rfq_contact_phone,
    vendor_id, listing_id, category_id, rfq_title, rfq_details,
    rfq_quantity, rfq_unit, rfq_target_price, rfq_needed_by,
    rfq_delivery_location_id, rfq_status, rfq_expires_at
)
SELECT r.ref, u.user_id, u.user_name, u.user_phone,
       v.vendor_id, l.listing_id, c.category_id, r.title, r.details,
       r.qty, r.unit, r.target, r.needed_by::date,
       loc.location_id, r.status, NOW() + INTERVAL '14 days'
FROM (VALUES
    ('RFQ-8F3K2Q', '+8801722000001', 'shaheb-bazar-silk-house', 'katan-silk-saree', 'silk-sarees',
     'Bulk katan sarees for a boutique', 'Looking for 60 pieces across mixed colours for a Dhaka boutique. Need a proforma invoice.',
     60, 'piece', 3200.00, '2026-10-15', 'shaheb-bazar', 'quoted'),
    ('RFQ-2M7P4X', '+8801722000002', 'rajshahi-mango-traders', 'fazli-mango-wholesale', 'mango-fruit-trade',
     'Fazli mango, ten maund', 'Ten maund for a retail shop in Chattogram. Please quote including courier.',
     10, 'maund', 2400.00, '2026-09-25', 'shaheb-bazar', 'accepted'),
    ('RFQ-9T1V6B', '+8801722000001', 'uttara-light-engineering', 'ms-grill-fabrication', 'metal-fabrication',
     'Grill work for a three storey building', 'About 900 square feet of window grill. Site visit required before quoting.',
     900, 'sq ft', 300.00, '2026-11-01', 'kazla', 'open')
) AS r(ref, buyer_phone, vendor_slug, listing_slug, category_slug,
       title, details, qty, unit, target, needed_by, delivery_area, status)
JOIN users           u   ON u.user_phone      = r.buyer_phone
JOIN vendors         v   ON v.vendor_slug     = r.vendor_slug
JOIN vendor_listings l   ON l.listing_slug    = r.listing_slug
JOIN categories      c   ON c.category_slug   = r.category_slug
JOIN locations       loc ON loc.location_slug = r.delivery_area;

INSERT INTO quote_responses (
    rfq_id, vendor_id, quote_price, quote_lead_time_days,
    quote_payment_terms, quote_notes, quote_valid_until, quote_status
)
SELECT q.rfq_id, q.vendor_id, x.price, x.lead_days,
       x.terms, x.notes, (NOW() + INTERVAL '10 days')::date, x.status
FROM (VALUES
    ('RFQ-8F3K2Q', 3400.00, 12, 'partial_advance',
     'Rate held for 60 pieces. Thirty percent advance, balance on delivery. Proforma invoice attached by email.', 'sent'),
    ('RFQ-2M7P4X', 2650.00,  4, 'cash_on_delivery',
     'Includes crate and courier to Chattogram. Price moves with the daily market rate after this week.', 'accepted')
) AS x(ref, price, lead_days, terms, notes, status)
JOIN quote_requests q ON q.rfq_public_ref = x.ref;

-- Reviews covering the published, pending and reported states
INSERT INTO reviews (vendor_id, user_id, review_rating, review_body, review_status)
SELECT v.vendor_id, u.user_id, r.rating, r.body, r.status
FROM (VALUES
    ('shaheb-bazar-silk-house', '+8801722000001', 5,
     'Genuine Rajshahi silk and the owner explained the difference between katan and tangail properly. Delivered in a week.', 'published'),
    ('rajshahi-mango-traders',  '+8801722000002', 4,
     'Mangoes arrived ripe and undamaged. Courier was a day late but they called ahead.', 'published'),
    ('green-life-pharmacy',     '+8801722000001', 5,
     'Open late and delivered insulin at 11pm. Awaiting moderation.', 'pending'),
    ('padma-diagnostic-centre', '+8801722000002', 1,
     'Sample review flagged by the shop as a fake posting from a competitor.', 'published')
) AS r(vendor_slug, reviewer_phone, rating, body, status)
JOIN vendors v ON v.vendor_slug = r.vendor_slug
JOIN users   u ON u.user_phone  = r.reviewer_phone;

INSERT INTO reports (report_target_type, report_target_id, reporter_user_id,
                     report_reason, report_details, report_status)
SELECT 'review', rv.review_id, v.user_id, 'fake_review',
       'Shop owner reports this account has never been a customer.', 'open'
FROM reviews rv
JOIN vendors v ON v.vendor_id = rv.vendor_id
WHERE v.vendor_slug = 'padma-diagnostic-centre' AND rv.review_rating = 1;

-- Search logs.
INSERT INTO search_logs (search_query_raw, search_query_normalised, category_id,
                         search_result_count, search_session_hash, search_created_at)
SELECT q.raw, q.norm, c.category_id, q.results,
       encode(sha256((q.raw || g)::bytea), 'hex'),
       NOW() - (g || ' hours')::interval
FROM (VALUES
    ('Silk saree',   'silk saree',   'silk-sarees',       12),
    ('সিল্ক শাড়ি',    'সিল্ক শাড়ি',    'silk-sarees',       12),
    ('mango',        'mango',        'mango-fruit-trade',  8),
    ('আম',           'আম',           'mango-fruit-trade',  8),
    ('ডাক্তার',       'ডাক্তার',       'doctor-chamber',     3),
    ('pharmacy',     'pharmacy',     'pharmacy',           5),
    ('jute bag',     'jute bag',     'jute-products',      4),
    ('grill',        'grill',        'metal-fabrication',  2)
) AS q(raw, norm, category_slug, results)
JOIN categories c ON c.category_slug = q.category_slug
CROSS JOIN generate_series(1, 7) AS g;

INSERT INTO vendor_profile_views (vendor_id, view_source, view_session_hash, view_created_at)
SELECT v.vendor_id,
       (ARRAY['search','category','direct','share'])[1 + (g % 4)],
       encode(sha256((v.vendor_slug || g)::bytea), 'hex'),
       NOW() - (g || ' hours')::interval
FROM vendors v
CROSS JOIN generate_series(1, 9) AS g
WHERE v.vendor_status = 'approved';

COMMIT;

-- Verification query; run after loading.

-- Seed v2.1: consumer directory content for the finalised home page design.

BEGIN;

-- Top-level categories shown on the home page.
UPDATE categories
SET category_name = 'Medical', category_name_bn = 'চিকিৎসা',
    category_sort_order = 10, category_icon = 'medical'
WHERE category_slug = 'health';

UPDATE categories
SET category_name = 'Tourism', category_name_bn = 'পর্যটন',
    category_sort_order = 20, category_icon = 'palm'
WHERE category_slug = 'tourism';

-- The home page renders the first six categories by sort order.
UPDATE categories SET category_sort_order = 70  WHERE category_slug = 'silk-textiles';
UPDATE categories SET category_sort_order = 80  WHERE category_slug = 'handicrafts';
UPDATE categories SET category_sort_order = 90  WHERE category_slug = 'agro-supplies';
UPDATE categories SET category_sort_order = 100 WHERE category_slug = 'light-manufacturing';

INSERT INTO categories (category_parent_id, category_name, category_name_bn, category_slug, category_icon, category_sort_order) VALUES
    (NULL, 'Restaurants', 'রেস্তোরাঁ', 'restaurants', 'utensils', 30),
    (NULL, 'Shopping',    'কেনাকাটা',  'shopping',    'bag',      40),
    (NULL, 'Education',   'শিক্ষা',     'education',   'cap',      50),
    (NULL, 'Services',    'সেবা',       'services',    'wrench',   60);

INSERT INTO categories (category_parent_id, category_name, category_name_bn, category_slug, category_sort_order)
SELECT p.category_id, c.name, c.name_bn, c.slug, c.sort
FROM categories p
JOIN (VALUES
    ('health',      'Hospitals',   'হাসপাতাল',      'hospitals',    0),
    ('health',      'Clinics',     'ক্লিনিক',        'clinics',      1),
    ('tourism',     'Travel',      'ভ্রমণ',          'travel',       2),
    ('tourism',     'Attractions', 'দর্শনীয় স্থান',  'attractions',  3),
    ('restaurants', 'Food',        'খাবার',          'food',         0),
    ('restaurants', 'Cafes',       'ক্যাফে',         'cafes',        1),
    ('restaurants', 'Caterers',    'ক্যাটারার',      'caterers',     2),
    ('shopping',    'Malls',       'শপিং মল',       'malls',        0),
    ('shopping',    'Stores',      'দোকান',          'stores',       1),
    ('shopping',    'Boutiques',   'বুটিক',          'boutiques',    2),
    ('education',   'Schools',     'স্কুল',          'schools',      0),
    ('education',   'Coaching',    'কোচিং',          'coaching',     1),
    ('education',   'Colleges',    'কলেজ',           'colleges',     2),
    ('services',    'Salons',      'সেলুন',          'salons',       0),
    ('services',    'Plumbers',    'প্লাম্বার',       'plumbers',     1),
    ('services',    'Carpenters',  'কাঠমিস্ত্রি',     'carpenters',   2)
) AS c(parent_slug, name, name_bn, slug, sort)
  ON p.category_slug = c.parent_slug;

-- Existing medical subcategories are ordered after Hospitals and Clinics to match the approved design.
UPDATE categories SET category_name = 'Pharmacies', category_sort_order = 2
WHERE category_slug = 'pharmacy';
UPDATE categories SET category_sort_order = 4 WHERE category_slug = 'diagnostic-centre';
UPDATE categories SET category_sort_order = 5 WHERE category_slug = 'doctor-chamber';
-- Orders the tourism subcategories to match the approved design.
UPDATE categories SET category_sort_order = 4 WHERE category_slug = 'tour-operators';
-- Shortened to fit the derived tile subtitle.
UPDATE categories SET category_name = 'Hotels', category_sort_order = 0
WHERE category_slug = 'hotels';

-- Owners for the consumer-side businesses
INSERT INTO users (user_phone, user_email, user_name, user_role, user_phone_verified_at) VALUES
    ('+8801711000010', NULL, 'Arif Hossain',    'vendor', NOW()),
    ('+8801711000011', NULL, 'Sabina Yeasmin',  'vendor', NOW()),
    ('+8801711000012', NULL, 'Kamrul Hasan',    'vendor', NOW()),
    ('+8801711000013', NULL, 'Nusrat Jahan',    'vendor', NOW()),
    ('+8801711000014', NULL, 'Mahfuzur Rahman', 'vendor', NOW());

-- Featured businesses shown on the home page
INSERT INTO vendors (
    user_id, vendor_name, vendor_name_bn, vendor_slug, vendor_description,
    vendor_phone, vendor_whatsapp, vendor_address, location_id,
    vendor_lat, vendor_lng, vendor_business_type, vendor_status,
    vendor_verified_at, vendor_is_featured, vendor_featured_until
)
SELECT u.user_id, v.name, v.name_bn, v.slug, v.descr,
       v.phone, v.phone, v.address, l.location_id,
       v.lat, v.lng, 'b2c', 'approved', NOW(), TRUE, NOW() + INTERVAL '60 days'
FROM (VALUES
    ('+8801711000010', 'Rajshahi Medical Centre', 'রাজশাহী মেডিকেল সেন্টার', 'rajshahi-medical-centre',
     'Multi-specialty hospital providing compassionate care with modern facilities and experienced doctors. Diagnostic, treatment and emergency services 24/7.',
     '+8801712345678', '123, Station Road, Rajshahi 6000', 'shaheb-bazar', 24.372100, 88.604400),

    ('+8801711000011', 'Padma View Restaurant', 'পদ্মা ভিউ রেস্টুরেন্ট', 'padma-view-restaurant',
     'A family-friendly restaurant offering a blend of traditional Bangladeshi and continental cuisine with a scenic view of the Padma.',
     '+8801712345679', 'Talaimari, Rajshahi 6000', 'talaimari', 24.366800, 88.629700),

    ('+8801711000012', 'Grand River View Hotel', 'গ্র্যান্ড রিভার ভিউ হোটেল', 'grand-river-view-hotel',
     'Elegant rooms, modern amenities and exceptional service with a beautiful view of the Padma River.',
     '+8801712345680', 'Laxmipur, Rajshahi 6000', 'laxmipur', 24.365900, 88.598400),

    ('+8801711000013', 'Rajshahi Craft Outlet', 'রাজশাহী ক্রাফট আউটলেট', 'rajshahi-craft-outlet',
     'Handloom clothing, leather goods and home decor from artisans across the Rajshahi division.',
     '+8801712345681', 'Shaheb Bazar Zero Point, Rajshahi', 'shaheb-bazar', 24.371200, 88.601900),

    ('+8801711000014', 'Digitax Accounting', 'ডিজিট্যাক্স অ্যাকাউন্টিং', 'digitax-accounting',
     'Bookkeeping, VAT registration and annual return filing for small businesses and sole traders in Rajshahi.',
     '+8801712345682', 'Upashahar, Rajshahi 6000', 'upashahar', 24.359200, 88.613100)
) AS v(owner_phone, name, name_bn, slug, descr, phone, address, area_slug, lat, lng)
JOIN users     u ON u.user_phone    = v.owner_phone
JOIN locations l ON l.location_slug = v.area_slug;

UPDATE vendors v SET vendor_verified_by = (SELECT user_id FROM users WHERE user_role = 'admin')
WHERE v.vendor_verified_by IS NULL AND v.vendor_status = 'approved';

INSERT INTO vendor_categories (vendor_id, category_id)
SELECT v.vendor_id, c.category_id
FROM (VALUES
    ('rajshahi-medical-centre', 'hospitals'),
    ('rajshahi-medical-centre', 'diagnostic-centre'),
    ('padma-view-restaurant',   'food'),
    ('grand-river-view-hotel',  'hotels'),
    ('rajshahi-craft-outlet',   'stores'),
    ('rajshahi-craft-outlet',   'boutiques'),
    ('digitax-accounting',      'services')
) AS m(vendor_slug, category_slug)
JOIN vendors    v ON v.vendor_slug   = m.vendor_slug
JOIN categories c ON c.category_slug = m.category_slug;

-- Business photos: development placeholders in database/seed-assets/, copied into the upload folder
-- by db:load. Each is the business's first photo and therefore its cover (as syncCover does).
-- Businesses without one show the built-in placeholder.
INSERT INTO vendor_photos (vendor_id, vendor_photo_url, vendor_photo_alt, vendor_photo_sort)
SELECT v.vendor_id, 'uploads/seed-business-' || v.vendor_slug || '.jpg', v.vendor_name, 0
FROM vendors v
WHERE v.vendor_slug IN (
    'padma-diagnostic-centre', 'rajshahi-medical-centre', 'digitax-accounting', 'rajshahi-craft-outlet',
    'padma-view-restaurant', 'grand-river-view-hotel', 'green-life-pharmacy', 'padma-garden-tours',
    'rajshahi-mango-traders', 'shaheb-bazar-silk-house', 'padma-handicrafts', 'uttara-light-engineering',
    'barind-agro-supplies'
);

UPDATE vendors v
SET vendor_cover_url = p.vendor_photo_url
FROM vendor_photos p
WHERE p.vendor_id = v.vendor_id AND p.vendor_photo_url LIKE 'uploads/seed-business-%';

-- Opening hours: defaults for approved vendors, then overrides for 24-hour and late-closing businesses.
INSERT INTO vendor_opening_hours (vendor_id, hours_day_of_week, hours_open_time, hours_close_time)
SELECT v.vendor_id, d, TIME '09:00', TIME '22:00'
FROM vendors v
CROSS JOIN generate_series(0, 6) AS d
WHERE v.vendor_status = 'approved'
ON CONFLICT (vendor_id, hours_day_of_week) DO NOTHING;

UPDATE vendor_opening_hours
SET hours_is_24h = TRUE, hours_open_time = NULL, hours_close_time = NULL
WHERE vendor_id = (SELECT vendor_id FROM vendors WHERE vendor_slug = 'rajshahi-medical-centre');

UPDATE vendor_opening_hours SET hours_close_time = TIME '23:00'
WHERE vendor_id IN (SELECT vendor_id FROM vendors
                    WHERE vendor_slug IN ('padma-view-restaurant','grand-river-view-hotel'));

-- Reviews: rating rows that v_business_cards averages, since ratings are not stored.
INSERT INTO users (user_phone, user_name, user_role, user_phone_verified_at)
SELECT '+88019' || LPAD(g::text, 8, '0'), 'Sample Reviewer ' || g, 'customer', NOW()
FROM generate_series(1, 40) AS g;

INSERT INTO reviews (vendor_id, user_id, review_rating, review_body, review_status)
SELECT v.vendor_id,
       u.user_id,
       -- Deterministic distribution across ratings three to five.
       CASE WHEN (u.user_id + v.vendor_id) % 10 < 6 THEN 5
            WHEN (u.user_id + v.vendor_id) % 10 < 9 THEN 4
            ELSE 3 END,
       NULL,
       'published'
FROM vendors v
JOIN LATERAL (
    SELECT user_id FROM users
    WHERE user_name LIKE 'Sample Reviewer %'
    ORDER BY user_id
    -- A different slice per vendor, so review counts differ.
    LIMIT 14 + (v.vendor_id % 17) OFFSET (v.vendor_id % 6)
) u ON TRUE
WHERE v.vendor_status = 'approved'
ON CONFLICT (vendor_id, user_id) DO NOTHING;


-- Events, dated relative to NOW() so the upcoming list is never empty.
INSERT INTO events (event_title, event_title_bn, event_slug, event_description,
                    event_venue, location_id, event_starts_at, event_ends_at)
SELECT e.title, e.title_bn, e.slug, e.descr, e.venue, l.location_id,
       NOW() + (e.starts_in || ' days')::interval,
       NOW() + (e.ends_in   || ' days')::interval
FROM (VALUES
    ('Rajshahi Food Festival', 'রাজশাহী খাদ্য উৎসব', 'rajshahi-food-festival',
     'Three days of street food, regional sweets and live cooking from vendors across the division.',
     'Bagha, Rajshahi', 'shaheb-bazar', 12, 15),
    ('Padma River Festival', 'পদ্মা নদী উৎসব', 'padma-river-festival',
     'Boat races, folk music and a riverside craft market along the Padma embankment.',
     'Padma Garden', 'talaimari', 26, 26),
    ('Rajshahi Book Fair', 'রাজশাহী বইমেলা', 'rajshahi-book-fair',
     'Ten days of publishers, readings and children''s workshops at the Central Library ground.',
     'Central Library Ground', 'laxmipur', 40, 49),
    ('Silk City Trade Expo', 'সিল্ক সিটি বাণিজ্য মেলা', 'silk-city-trade-expo',
     'B2B expo for silk weavers, handicraft producers and agro-suppliers to meet wholesale buyers.',
     'Rajshahi Chamber of Commerce', 'shaheb-bazar', 55, 58)
) AS e(title, title_bn, slug, descr, venue, area_slug, starts_in, ends_in)
JOIN locations l ON l.location_slug = e.area_slug;

-- Popular searches: seeded often enough to pass the five-a-day threshold in v_search_trends_daily.
INSERT INTO search_logs (search_query_raw, search_query_normalised, category_id,
                         search_result_count, search_session_hash, search_created_at)
SELECT q.term, lower(q.term), c.category_id, q.results,
       encode(sha256((q.term || g)::bytea), 'hex'),
       NOW() - (g || ' hours')::interval
FROM (VALUES
    ('Physiotherapy',     'doctor-chamber',    14),
    ('Gyms',              'services',           9),
    ('Beauty Parlour',    'salons',            21),
    ('Car Workshop',      'services',          11),
    ('Diagnostic Center', 'diagnostic-centre', 24),
    ('Tuition',           'coaching',          31),
    ('Cafes',             'cafes',             17),
    ('Electronics',       'stores',            19)
) AS q(term, category_slug, results)
JOIN categories c ON c.category_slug = q.category_slug
CROSS JOIN generate_series(1, 9) AS g;

COMMIT;

-- Seed v2.2: website addresses and profile details for the featured businesses.

BEGIN;

UPDATE vendors v SET vendor_website = w.url
FROM (VALUES
    ('rajshahi-medical-centre', 'www.rajshahimedical.example'),
    ('padma-view-restaurant',   'www.padmaview.example'),
    ('grand-river-view-hotel',  'www.grandriverview.example'),
    ('rajshahi-craft-outlet',   'www.rajshahicraft.example'),
    ('digitax-accounting',      'www.digitax.example'),
    ('shaheb-bazar-silk-house', 'www.shahebbazarsilk.example')
) AS w(slug, url)
WHERE v.vendor_slug = w.slug;

-- Attributes rendered beside the business description
INSERT INTO vendor_facts (vendor_id, fact_group, fact_label, fact_value, fact_icon, fact_sort_order)
SELECT v.vendor_id, 'about', f.label, f.value, f.icon, f.sort
FROM (VALUES
    ('rajshahi-medical-centre', 'Established',   '2008',                'calendar',   0),
    ('rajshahi-medical-centre', 'License No.',   'DGHS-3421',           'badge',      1),
    ('rajshahi-medical-centre', 'Hospital Type', 'Multi-specialty',     'building',   2),
    ('rajshahi-medical-centre', 'Emergency',     '24/7 Available',      'siren',      3),

    ('padma-view-restaurant',   'Established',   '2016',                'calendar',   0),
    ('padma-view-restaurant',   'Cuisine',       'Bangladeshi, Continental', 'utensils', 1),
    ('padma-view-restaurant',   'Seating',       '80 covers',           'users',      2),
    ('padma-view-restaurant',   'Parking',       'On site',             'car',        3),

    ('grand-river-view-hotel',  'Established',   '2012',                'calendar',   0),
    ('grand-river-view-hotel',  'License No.',   'BTB-RJ-882',          'badge',      1),
    ('grand-river-view-hotel',  'Check-in',      '2:00 PM',             'clock',      2),
    ('grand-river-view-hotel',  'Check-out',     '12:00 PM',            'clock',      3),

    ('rajshahi-craft-outlet',   'Established',   '2019',                'calendar',   0),
    ('rajshahi-craft-outlet',   'Artisan Groups','14 across Rajshahi',  'users',      1),

    ('digitax-accounting',      'Established',   '2021',                'calendar',   0),
    ('digitax-accounting',      'Registration',  'ICAB-4417',           'badge',      1),

    ('shaheb-bazar-silk-house', 'Established',   '1994',                'calendar',   0),
    ('shaheb-bazar-silk-house', 'Looms',         '22 hand and power',   'factory',    1)
) AS f(slug, label, value, icon, sort)
JOIN vendors v ON v.vendor_slug = f.slug
ON CONFLICT (vendor_id, fact_group, fact_label) DO NOTHING;

-- Attributes rendered in the sidebar summary grid
INSERT INTO vendor_facts (vendor_id, fact_group, fact_label, fact_value, fact_icon, fact_sort_order)
SELECT v.vendor_id, 'quick', f.label, f.value, f.icon, f.sort
FROM (VALUES
    ('rajshahi-medical-centre', 'Beds',           '120+', 'bed',        0),
    ('rajshahi-medical-centre', 'Doctors',        '45+',  'stethoscope',1),
    ('rajshahi-medical-centre', 'Nurses',         '80+',  'users',      2),
    ('rajshahi-medical-centre', 'Daily Visitors', '300+', 'activity',   3),

    ('grand-river-view-hotel',  'Rooms',          '64',   'bed',        0),
    ('grand-river-view-hotel',  'Suites',         '8',    'building',   1),
    ('grand-river-view-hotel',  'Restaurants',    '2',    'utensils',   2),
    ('grand-river-view-hotel',  'Parking',        '30',   'car',        3),

    ('padma-view-restaurant',   'Covers',         '80',   'users',      0),
    ('padma-view-restaurant',   'Private Rooms',  '3',    'building',   1),

    ('shaheb-bazar-silk-house', 'Looms',          '22',   'factory',    0),
    ('shaheb-bazar-silk-house', 'Weavers',        '35',   'users',      1)
) AS f(slug, label, value, icon, sort)
JOIN vendors v ON v.vendor_slug = f.slug
ON CONFLICT (vendor_id, fact_group, fact_label) DO NOTHING;

-- Listings for the consumer businesses, populating the services section of the profile page.
INSERT INTO vendor_listings (
    vendor_id, category_id, listing_title, listing_title_bn, listing_slug,
    listing_description, listing_price, listing_price_unit, listing_status
)
SELECT v.vendor_id, c.category_id, x.title, x.title_bn, x.slug,
       x.descr, x.price, x.unit, 'approved'
FROM (VALUES
    -- Hospital departments
    ('rajshahi-medical-centre', 'hospitals', 'General Medicine', 'জেনারেল মেডিসিন', 'general-medicine', 'Indoor and outdoor consultation across general conditions.', NULL, NULL),
    ('rajshahi-medical-centre', 'hospitals', 'Cardiology', 'কার্ডিওলজি', 'cardiology', 'Heart care, ECG and echocardiography.', NULL, NULL),
    ('rajshahi-medical-centre', 'hospitals', 'Orthopedics', 'অর্থোপেডিক্স', 'orthopedics', 'Bone and joint treatment, fracture management.', NULL, NULL),
    ('rajshahi-medical-centre', 'hospitals', 'Pediatrics', 'শিশু বিভাগ', 'pediatrics', 'Child health, vaccination and growth monitoring.', NULL, NULL),
    ('rajshahi-medical-centre', 'hospitals', 'Gynecology', 'গাইনি', 'gynecology', 'Women''s health, antenatal and postnatal care.', NULL, NULL),
    ('rajshahi-medical-centre', 'hospitals', 'Radiology', 'রেডিওলজি', 'radiology', 'X-Ray, CT and MRI with consultant reporting.', NULL, NULL),
    ('rajshahi-medical-centre', 'hospitals', 'Pathology', 'প্যাথলজি', 'pathology', 'Laboratory tests with same-day reports.', 400.00, 'test'),
    ('rajshahi-medical-centre', 'hospitals', 'Emergency', 'জরুরি বিভাগ', 'emergency', '24/7 emergency admission and ambulance.', NULL, NULL),

    ('padma-view-restaurant', 'food', 'Kacchi Biryani', 'কাচ্চি বিরিয়ানি', 'kacchi-biryani', 'Mutton kacchi cooked to order, served with borhani.', 420.00, 'plate'),
    ('padma-view-restaurant', 'food', 'Padma River Fish Curry', 'পদ্মার মাছের ঝোল', 'padma-fish-curry', 'Seasonal river fish in a light mustard curry.', 380.00, 'plate'),
    ('padma-view-restaurant', 'food', 'Family Platter', 'ফ্যামিলি প্লেটার', 'family-platter', 'Rice, three curries, salad and dessert for four.', 1450.00, 'platter'),
    ('padma-view-restaurant', 'food', 'Riverside Terrace Booking', 'টেরেস বুকিং', 'terrace-booking', 'Reserved terrace table at sunset, minimum four guests.', 500.00, 'booking'),

    ('grand-river-view-hotel', 'hotels', 'Deluxe Room', 'ডিলাক্স রুম', 'deluxe-room', 'Air-conditioned double with river-facing window.', 4500.00, 'night'),
    ('grand-river-view-hotel', 'hotels', 'Executive Suite', 'এক্সিকিউটিভ স্যুট', 'executive-suite', 'Separate living area, work desk and breakfast included.', 8500.00, 'night'),
    ('grand-river-view-hotel', 'hotels', 'Conference Hall', 'কনফারেন্স হল', 'conference-hall', 'Seats 60, projector and catering available.', 12000.00, 'day'),
    ('grand-river-view-hotel', 'hotels', 'Airport Pickup', 'বিমানবন্দর পিকআপ', 'airport-pickup', 'Car and driver from Shah Makhdum Airport.', 1200.00, 'trip'),

    ('rajshahi-craft-outlet', 'stores', 'Handloom Cotton Kurta', 'হ্যান্ডলুম কুর্তা', 'handloom-kurta', 'Woven and stitched by artisan groups in Rajshahi district.', 1250.00, 'piece'),
    ('rajshahi-craft-outlet', 'stores', 'Leather Satchel', 'চামড়ার ব্যাগ', 'leather-satchel', 'Vegetable-tanned leather with brass fittings.', 3400.00, 'piece'),
    ('rajshahi-craft-outlet', 'stores', 'Nakshi Kantha Throw', 'নকশি কাঁথা', 'nakshi-kantha-throw', 'Hand-embroidered quilt, single bed size.', 2800.00, 'piece'),

    ('digitax-accounting', 'services', 'VAT Registration', 'ভ্যাট নিবন্ধন', 'vat-registration', 'BIN registration handled end to end, including filing.', 6000.00, 'service'),
    ('digitax-accounting', 'services', 'Monthly Bookkeeping', 'মাসিক হিসাবরক্ষণ', 'monthly-bookkeeping', 'Ledgers, reconciliation and a monthly summary.', 4500.00, 'month'),
    ('digitax-accounting', 'services', 'Annual Return Filing', 'বার্ষিক রিটার্ন', 'annual-return', 'Company and personal income tax return preparation.', 9000.00, 'return')
) AS x(vendor_slug, category_slug, title, title_bn, slug, descr, price, unit)
JOIN vendors    v ON v.vendor_slug   = x.vendor_slug
JOIN categories c ON c.category_slug = x.category_slug
ON CONFLICT (vendor_id, listing_slug) DO NOTHING;

-- Gallery photos for these listings: none until suitable development images are added to
-- database/seed-assets/ (see database/README.md).

-- Written review bodies. seed.v2.1 generates ratings without text so the averages are derived from real rows.
UPDATE reviews r SET review_body = t.body
FROM (VALUES
    ('rajshahi-medical-centre',
     'Excellent service. The doctors are very professional and the environment is clean and well maintained.'),
    ('padma-view-restaurant',
     'Went for dinner with family. The river view at sunset is the reason to come, and the kacchi was genuinely good.'),
    ('grand-river-view-hotel',
     'Clean rooms and helpful staff. Breakfast was limited but the location near the embankment made up for it.'),
    ('rajshahi-craft-outlet',
     'Bought jute bags and a cane basket. Honest pricing and they explained which artisan group made each piece.'),
    ('digitax-accounting',
     'Handled our VAT registration end to end and explained each step clearly.'),
    ('shaheb-bazar-silk-house',
     'Genuine Rajshahi silk. The owner explained the difference between katan and tangail properly. Delivered in a week.')
) AS t(slug, body)
WHERE r.review_id = (
    SELECT r2.review_id
    FROM reviews r2
    JOIN vendors v2 ON v2.vendor_id = r2.vendor_id
    WHERE v2.vendor_slug = t.slug
      AND r2.review_status = 'published'
      AND r2.review_rating >= 4
    ORDER BY r2.review_id DESC
    LIMIT 1
);

COMMIT;

-- Shahebbazar seed v2.3: sample payment methods. padma-garden-tours is left empty on purpose.

BEGIN;

INSERT INTO vendor_payment_methods (vendor_id, payment_method, payment_note, payment_sort_order)
SELECT v.vendor_id, p.method, p.note, p.sort
FROM (VALUES
    ('shaheb-bazar-silk-house',  'cash',             NULL,                                   0),
    ('shaheb-bazar-silk-house',  'bkash',            NULL,                                   1),
    ('shaheb-bazar-silk-house',  'bank_transfer',    'Wholesale orders',                     2),
    ('shaheb-bazar-silk-house',  'cash_on_delivery', 'Within Rajshahi city',                 3),

    ('padma-handicrafts',        'cash',             NULL,                                   0),
    ('padma-handicrafts',        'bkash',            NULL,                                   1),
    ('padma-handicrafts',        'bank_transfer',    'Export and bulk orders',               2),

    ('barind-agro-supplies',     'cash',             NULL,                                   0),
    ('barind-agro-supplies',     'bank_transfer',    'Co-operative accounts',                1),
    ('barind-agro-supplies',     'nagad',            NULL,                                   2),

    ('rajshahi-mango-traders',   'cash_on_delivery', 'Courier delivery nationwide',          0),
    ('rajshahi-mango-traders',   'bkash',            'Advance for orders outside Rajshahi',  1),
    ('rajshahi-mango-traders',   'bank_transfer',    NULL,                                   2),

    ('uttara-light-engineering', 'cash',             NULL,                                   0),
    ('uttara-light-engineering', 'bank_transfer',    'Job work above 20,000 BDT',            1),

    ('green-life-pharmacy',      'cash',             NULL,                                   0),
    ('green-life-pharmacy',      'bkash',            NULL,                                   1),
    ('green-life-pharmacy',      'nagad',            NULL,                                   2),
    ('green-life-pharmacy',      'cash_on_delivery', 'Home delivery within the city',        3),

    ('padma-diagnostic-centre',  'cash',             NULL,                                   0),
    ('padma-diagnostic-centre',  'card',             NULL,                                   1),
    ('padma-diagnostic-centre',  'bkash',            NULL,                                   2),

    ('rajshahi-medical-centre',  'cash',             NULL,                                   0),
    ('rajshahi-medical-centre',  'card',             'At the billing counter',               1),
    ('rajshahi-medical-centre',  'bkash',            NULL,                                   2),
    ('rajshahi-medical-centre',  'nagad',            NULL,                                   3),

    ('padma-view-restaurant',    'cash',             NULL,                                   0),
    ('padma-view-restaurant',    'card',             NULL,                                   1),
    ('padma-view-restaurant',    'bkash',            NULL,                                   2),

    ('grand-river-view-hotel',   'cash',             NULL,                                   0),
    ('grand-river-view-hotel',   'card',             NULL,                                   1),
    ('grand-river-view-hotel',   'bank_transfer',    'Group and corporate bookings',         2),

    ('rajshahi-craft-outlet',    'cash',             NULL,                                   0),
    ('rajshahi-craft-outlet',    'bkash',            NULL,                                   1),
    ('rajshahi-craft-outlet',    'rocket',           NULL,                                   2),

    ('digitax-accounting',       'bank_transfer',    NULL,                                   0),
    ('digitax-accounting',       'bkash',            NULL,                                   1)
) AS p(slug, method, note, sort)
JOIN vendors v ON v.vendor_slug = p.slug
ON CONFLICT (vendor_id, payment_method) DO NOTHING;

COMMIT;

-- Seed v2.4: sixty days of profile views and search appearances, so the dashboard chart has history.

BEGIN;

-- Between 4 and 15 views a day, rising gently towards the present.
INSERT INTO vendor_profile_views (vendor_id, view_source, view_session_hash, view_created_at)
SELECT v.vendor_id,
       (ARRAY['search','category','direct','share'])[1 + abs(hashtext(v.vendor_slug || ':src:' || d || ':' || k)) % 4],
       encode(sha256((v.vendor_slug || ':' || d || ':' || k)::bytea), 'hex'),
       (CURRENT_DATE - d) + make_interval(mins => 480 + abs(hashtext(v.vendor_slug || ':t:' || d || ':' || k)) % 720)
FROM vendors v
CROSS JOIN generate_series(1, 60) AS d
CROSS JOIN LATERAL generate_series(1, 4 + abs(hashtext(v.vendor_slug || ':n:' || d)) % 8 + (60 - d) / 15) AS k
WHERE v.vendor_status = 'approved';

-- Businesses in the Sponsored results get about one in five of their views from there (KAN-287 results).
UPDATE vendor_profile_views pv SET view_source = 'sponsored'
FROM vendors v
WHERE v.vendor_id = pv.vendor_id AND v.vendor_is_featured
  AND abs(hashtext(pv.view_session_hash)) % 5 = 0;

-- Between 15 and 74 appearances a day, rising the same way.
INSERT INTO vendor_search_impressions (vendor_id, impression_day, impression_count)
SELECT v.vendor_id,
       CURRENT_DATE - d,
       15 + abs(hashtext(v.vendor_slug || ':imp:' || d)) % 40 + (60 - d) / 3
FROM vendors v
CROSS JOIN generate_series(1, 60) AS d
WHERE v.vendor_status = 'approved'
ON CONFLICT (vendor_id, impression_day) DO NOTHING;

COMMIT;

--

-- Demo data for saved businesses, messaging, alerts and review replies.

INSERT INTO saved_businesses (user_id, vendor_id)
SELECT u.user_id, v.vendor_id
FROM users u
JOIN vendors v ON v.vendor_slug IN ('shaheb-bazar-silk-house', 'green-life-pharmacy')
WHERE u.user_phone = '+8801722000001';

INSERT INTO conversations (vendor_id, user_id, listing_id, conversation_last_message_at)
SELECT v.vendor_id, u.user_id, l.listing_id, NOW() - INTERVAL '1 hour'
FROM vendors v
JOIN users u ON u.user_phone = '+8801722000001'
JOIN vendor_listings l ON l.vendor_id = v.vendor_id AND l.listing_title = 'Katan Silk Saree'
WHERE v.vendor_slug = 'shaheb-bazar-silk-house';

INSERT INTO messages (conversation_id, sender_user_id, message_body, message_read_at, message_created_at)
SELECT c.conversation_id, m.sender, m.body, m.read_at, m.sent_at
FROM conversations c
JOIN vendors v ON v.vendor_id = c.vendor_id AND v.vendor_slug = 'shaheb-bazar-silk-house'
CROSS JOIN LATERAL (VALUES
    (c.user_id, 'Do you have the katan saree in maroon? I need two for a wedding next month.',
     NOW() - INTERVAL '2 hours', NOW() - INTERVAL '3 hours'),
    (v.user_id, 'Yes, we have maroon in stock. Two sarees can be ready in a week. Would you like to visit the shop?',
     NULL::timestamptz, NOW() - INTERVAL '1 hour')
) AS m(sender, body, read_at, sent_at);

INSERT INTO notifications (user_id, notification_type, notification_channel, notification_payload,
                           notification_status, notification_sent_at, notification_read_at)
SELECT c.user_id, 'message.new', 'in_app',
       jsonb_build_object('conversation_id', c.conversation_id, 'from', v.vendor_name,
                          'preview', 'Yes, we have maroon in stock.'),
       'sent', NOW() - INTERVAL '1 hour', NULL
FROM conversations c
JOIN vendors v ON v.vendor_id = c.vendor_id AND v.vendor_slug = 'shaheb-bazar-silk-house';

UPDATE reviews r
SET review_reply = 'Thank you for visiting! We are glad the katan saree was what you were looking for.',
    review_replied_at = NOW() - INTERVAL '2 days'
FROM vendors v, users u
WHERE v.vendor_id = r.vendor_id AND v.vendor_slug = 'shaheb-bazar-silk-house'
  AND u.user_id = r.user_id AND u.user_phone = '+8801722000001';


-- Baseline-only replacement for the historical schema.v2.5 data migration.
-- Run after all seed files so every populated vendor cover is represented once.
INSERT INTO vendor_photos (
    vendor_id,
    vendor_photo_url,
    vendor_photo_sort
)
SELECT
    v.vendor_id,
    v.vendor_cover_url,
    0
FROM vendors v
WHERE v.vendor_cover_url IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM vendor_photos vp
      WHERE vp.vendor_id = v.vendor_id
        AND vp.vendor_photo_url = v.vendor_cover_url
  );

-- A manager for Rajshahi Mango Traders, so one business is run by two people (KAN-250).
INSERT INTO users (user_phone, user_name, user_role, user_phone_verified_at)
VALUES ('+8801711000015', 'Rubel Ahmed', 'vendor', NOW());

INSERT INTO vendor_members (vendor_id, user_id, member_role, member_added_by)
SELECT v.vendor_id, u.user_id, 'manager', v.user_id
FROM vendors v
JOIN users u ON u.user_phone = '+8801711000015'
WHERE v.vendor_slug = 'rajshahi-mango-traders';

-- Marketing passes (KAN-283). Also in database/migrations/001_marketing_passes.sql.
-- Reference data: the three passes proposed in the feasibility summary (prices can be changed here).
INSERT INTO public.marketing_packages
    (package_name, package_duration_days, package_price_bdt, package_email_campaign_limit, package_ai_action_limit, package_sms_limit, package_sort_order)
VALUES
    ('Marketing pass: 7 days', 7, 299, 1, 10, 0, 1),
    ('Marketing pass: 30 days', 30, 999, 4, 40, 0, 2),
    ('Marketing pass: 90 days', 90, 2499, 12, 120, 0, 3)
ON CONFLICT (package_name) DO NOTHING;

-- Businesses that are already featured get a matching admin pass, so the admin page shows why
-- they are sponsored and when that ends.
INSERT INTO public.vendor_marketing_subscriptions (
    vendor_id, package_id, subscription_status, subscription_starts_at, subscription_ends_at,
    subscription_price_bdt, subscription_activation_source, subscription_activated_by, subscription_status_reason
)
SELECT v.vendor_id, p.package_id, 'active',
       v.vendor_featured_until - make_interval(days => p.package_duration_days), v.vendor_featured_until,
       p.package_price_bdt, 'admin',
       (SELECT min(user_id) FROM public.users WHERE user_role = 'admin'),
       'Existing featured business, given a pass when passes were introduced'
FROM public.vendors v
JOIN public.marketing_packages p
  ON p.package_name = CASE WHEN v.vendor_featured_until <= now() + INTERVAL '30 days'
                           THEN 'Marketing pass: 30 days' ELSE 'Marketing pass: 90 days' END
WHERE v.vendor_is_featured
  AND v.vendor_featured_until > now()
  AND NOT EXISTS (
      SELECT 1 FROM public.vendor_marketing_subscriptions s
      WHERE s.vendor_id = v.vendor_id AND s.subscription_status IN ('pending', 'active'));

-- Marketing consent (KAN-284). Also in database/migrations/002_marketing_consents.sql.
-- The demo customer saved Shaheb Bazar Silk House and agreed to offers by SMS; saving Green Life
-- Pharmacy gave no consent.
INSERT INTO public.marketing_consents (user_id, vendor_id, consent_channel, consent_source, consent_given_at)
SELECT u.user_id, v.vendor_id, 'sms', 'save_prompt', now() - INTERVAL '3 days'
FROM public.users u
JOIN public.vendors v ON v.vendor_slug = 'shaheb-bazar-silk-house'
WHERE u.user_phone = '+8801722000001';

-- Email subscribers for Rajshahi Mango Traders (KAN-286), so a campaign can be sent in development.
-- Three get its offers by email; Mahmud Hasan unsubscribed two days ago, so sends leave him out.
-- example.com addresses can never receive mail, so even a real email provider reaches no one.
INSERT INTO public.users (user_phone, user_email, user_name, user_role, user_phone_verified_at) VALUES
    ('+8801722000003', 'rumana.akter@example.com',  'Rumana Akter',  'customer', NOW()),
    ('+8801722000004', 'sajid.rahman@example.com',  'Sajid Rahman',  'customer', NOW()),
    ('+8801722000005', 'tania.sultana@example.com', 'Tania Sultana', 'customer', NOW()),
    ('+8801722000006', 'mahmud.hasan@example.com',  'Mahmud Hasan',  'customer', NOW());

INSERT INTO public.saved_businesses (user_id, vendor_id)
SELECT u.user_id, v.vendor_id
FROM public.users u
JOIN public.vendors v ON v.vendor_slug = 'rajshahi-mango-traders'
WHERE u.user_phone IN ('+8801722000003', '+8801722000004', '+8801722000005', '+8801722000006');

INSERT INTO public.marketing_consents (user_id, vendor_id, consent_channel, consent_source, consent_given_at,
                                       consent_withdrawn_at, consent_withdrawn_source)
SELECT u.user_id, v.vendor_id, 'email', 'save_prompt', now() - INTERVAL '10 days',
       CASE WHEN u.user_phone = '+8801722000006' THEN now() - INTERVAL '2 days' END,
       CASE WHEN u.user_phone = '+8801722000006' THEN 'unsubscribe_link' END
FROM public.users u
JOIN public.vendors v ON v.vendor_slug = 'rajshahi-mango-traders'
WHERE u.user_phone IN ('+8801722000003', '+8801722000004', '+8801722000005', '+8801722000006');

-- Platform settings (KAN-293). Also in database/migrations/003_platform_settings.sql.
-- Approval of new businesses and listings starts on, as the site has always worked.
INSERT INTO public.platform_settings (setting_key, setting_value) VALUES
    ('require_business_approval', 'true'),
    ('require_listing_approval', 'true')
ON CONFLICT (setting_key) DO NOTHING;

-- Listing photos: development placeholders in database/seed-assets/, copied into the upload folder
-- by db:load. Each is the listing's main photo; one file may serve several listings. Listings
-- without one show the built-in placeholder.
INSERT INTO public.listing_photos (listing_id, photo_url, photo_alt_text, photo_sort_order, photo_is_primary)
SELECT l.listing_id, 'uploads/' || x.file, l.listing_title, 0, TRUE
FROM (VALUES
    ('khirsapat-mango',        'seed-listing-khirsapat-mango.jpg'),
    ('fazli-mango-wholesale',  'seed-listing-fazli-mango-wholesale.jpg'),
    ('katan-silk-saree',       'seed-listing-katan-silk-saree.jpg'),
    ('block-print-silk-saree', 'seed-listing-block-print-silk-saree.jpg'),
    ('mulberry-raw-silk-yarn', 'seed-listing-mulberry-raw-silk-yarn.jpg'),
    ('annual-return',          'seed-listing-digitax-services.jpg'),
    ('monthly-bookkeeping',    'seed-listing-digitax-services.jpg'),
    ('vat-registration',       'seed-listing-digitax-services.jpg')
) AS x(listing_slug, file)
JOIN public.vendor_listings l ON l.listing_slug = x.listing_slug;
