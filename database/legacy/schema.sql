-- Categories (master): many-to-many between vendors and categories. Superseded by schema.v2.sql.
CREATE TABLE categories (
    category_id SERIAL PRIMARY KEY,
    category_name varchar(255) NOT NULL UNIQUE 
);

-- VENDORS PROFILE
CREATE TABLE vendors (
    vendor_id SERIAL PRIMARY KEY,
    vendor_name VARCHAR(255) NOT NULL,
    vendor_email VARCHAR(255) NOT NULL UNIQUE,
    vendor_password VARCHAR(255) NOT NULL,
    vendor_phone VARCHAR(20),
    vendor_address TEXT,
    vendor_city VARCHAR(255),
    vendor_created_at TIMESTAMP DEFAULT NOW()
);

-- vendor <---> category many to many relationship
CREATE TABLE vendor_categories (
    vendor_id INT REFERENCES vendors(vendor_id) ON DELETE CASCADE,
    category_id INT REFERENCES categories(category_id) ON DELETE CASCADE,
    PRIMARY KEY (vendor_id, category_id)
);

-- standard end users: 
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    user_name VARCHAR(255) NOT NULL,
    user_email VARCHAR(255) NOT NULL UNIQUE,
    user_password_hash VARCHAR(255) NOT NULL,
    user_created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE vendor_listings (
  listing_id SERIAL PRIMARY KEY,
  vendor_id INTEGER REFERENCES vendors(vendor_id),
  title TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2),
  category TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE listing_photos (
  photo_id SERIAL PRIMARY KEY,
  listing_id INTEGER REFERENCES vendor_listings(listing_id),
  photo_url TEXT NOT NULL
);
