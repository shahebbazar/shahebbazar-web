-- Reference data for the live site (KAN-279): what an empty production database needs and nothing
-- else. Loaded after schema.sql instead of seed.sql when DB_SEED=reference (backend/lib/setupDatabase.js);
-- the admin account is added from ADMIN_PHONE, so no account is created here.
--
-- Locations, categories, marketing passes and approval settings are the same as in seed.sql, in their
-- final form (seed.sql builds categories in steps; test/referenceSeed.test.js checks the two agree).
-- A new category or location goes in both files, and in a migration for databases already loaded.

-- The baseline schema dump clears the session search_path.
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

-- Categories: top level in home page order (the home page shows the first six), then children.
INSERT INTO categories (category_parent_id, category_name, category_name_bn, category_slug, category_icon, category_sort_order) VALUES
    (NULL, 'Medical',             'চিকিৎসা',          'health',              'medical',  10),
    (NULL, 'Tourism',             'পর্যটন',           'tourism',             'palm',     20),
    (NULL, 'Restaurants',         'রেস্তোরাঁ',         'restaurants',         'utensils', 30),
    (NULL, 'Shopping',            'কেনাকাটা',         'shopping',            'bag',      40),
    (NULL, 'Education',           'শিক্ষা',            'education',           'cap',      50),
    (NULL, 'Services',            'সেবা',              'services',            'wrench',   60),
    (NULL, 'Silk & Textiles',     'সিল্ক ও বস্ত্র',     'silk-textiles',       'shirt',    70),
    (NULL, 'Handicrafts',         'হস্তশিল্প',          'handicrafts',         'palette',  80),
    (NULL, 'Agro Supplies',       'কৃষি সরঞ্জাম',       'agro-supplies',       'sprout',   90),
    (NULL, 'Light Manufacturing', 'হালকা প্রকৌশল',      'light-manufacturing', 'factory', 100);

INSERT INTO categories (category_parent_id, category_name, category_name_bn, category_slug, category_sort_order)
SELECT p.category_id, c.name, c.name_bn, c.slug, c.sort
FROM categories p
JOIN (VALUES
    ('health',              'Hospitals',           'হাসপাতাল',              'hospitals',          0),
    ('health',              'Clinics',             'ক্লিনিক',                'clinics',            1),
    ('health',              'Pharmacies',          'ফার্মেসি',               'pharmacy',           2),
    ('health',              'Diagnostic Centre',   'ডায়াগনস্টিক সেন্টার',    'diagnostic-centre',  4),
    ('health',              'Doctor Chamber',      'ডাক্তারের চেম্বার',      'doctor-chamber',     5),
    ('tourism',             'Hotels',              'হোটেল ও গেস্ট হাউস',    'hotels',             0),
    ('tourism',             'Travel',              'ভ্রমণ',                  'travel',             2),
    ('tourism',             'Attractions',         'দর্শনীয় স্থান',          'attractions',        3),
    ('tourism',             'Tour Operators',      'ট্যুর অপারেটর',          'tour-operators',     4),
    ('restaurants',         'Food',                'খাবার',                  'food',               0),
    ('restaurants',         'Cafes',               'ক্যাফে',                 'cafes',              1),
    ('restaurants',         'Caterers',            'ক্যাটারার',              'caterers',           2),
    ('shopping',            'Malls',               'শপিং মল',               'malls',              0),
    ('shopping',            'Stores',              'দোকান',                  'stores',             1),
    ('shopping',            'Boutiques',           'বুটিক',                  'boutiques',          2),
    ('education',           'Schools',             'স্কুল',                  'schools',            0),
    ('education',           'Coaching',            'কোচিং',                  'coaching',           1),
    ('education',           'Colleges',            'কলেজ',                   'colleges',           2),
    ('services',            'Salons',              'সেলুন',                  'salons',             0),
    ('services',            'Plumbers',            'প্লাম্বার',               'plumbers',           1),
    ('services',            'Carpenters',          'কাঠমিস্ত্রি',             'carpenters',         2),
    ('silk-textiles',       'Silk Sarees',         'সিল্ক শাড়ি',            'silk-sarees',        1),
    ('silk-textiles',       'Raw Silk & Yarn',     'কাঁচা সিল্ক ও সুতা',     'raw-silk-yarn',      2),
    ('silk-textiles',       'Tailoring',           'দর্জি',                  'tailoring',          3),
    ('handicrafts',         'Jute Products',       'পাটজাত পণ্য',           'jute-products',      1),
    ('handicrafts',         'Bamboo & Cane',       'বাঁশ ও বেত',            'bamboo-cane',        2),
    ('handicrafts',         'Pottery',             'মৃৎশিল্প',               'pottery',            3),
    ('agro-supplies',       'Seeds & Fertiliser',  'বীজ ও সার',             'seeds-fertiliser',   1),
    ('agro-supplies',       'Mango & Fruit Trade', 'আম ও ফল ব্যবসা',        'mango-fruit-trade',  2),
    ('agro-supplies',       'Farm Machinery',      'কৃষি যন্ত্রপাতি',        'farm-machinery',     3),
    ('light-manufacturing', 'Metal Fabrication',   'ধাতব নির্মাণ',           'metal-fabrication',  1),
    ('light-manufacturing', 'Plastic & Packaging', 'প্লাস্টিক ও প্যাকেজিং',  'plastic-packaging',  2)
) AS c(parent_slug, name, name_bn, slug, sort)
  ON p.category_slug = c.parent_slug;

-- Marketing passes (KAN-283): the three passes proposed in the feasibility summary.
INSERT INTO marketing_packages
    (package_name, package_duration_days, package_price_bdt, package_email_campaign_limit, package_ai_action_limit, package_sms_limit, package_sort_order)
VALUES
    ('Marketing pass: 7 days', 7, 299, 1, 10, 0, 1),
    ('Marketing pass: 30 days', 30, 999, 4, 40, 0, 2),
    ('Marketing pass: 90 days', 90, 2499, 12, 120, 0, 3);

-- Approval (KAN-293, KAN-335): a new business, listing or event is public at once. An admin can switch
-- any of them on in Settings. Off is also the default without a row (backend/lib/settings.js).
INSERT INTO platform_settings (setting_key, setting_value) VALUES
    ('require_business_approval', 'false'),
    ('require_listing_approval', 'false'),
    ('require_event_approval', 'false');

COMMIT;
