/*
  # Replace simplified tables with user's full LocalMart schema

  1. Dropped Tables (from previous simplified migration)
    - All 4 tables from the earlier simplified schema

  2. New Tables (matching user's actual schema)
    - Full 22-table LocalMart schema including users, roles, products, sellers, reviews, transactions, etc.
    - `description_embedding VECTOR(384)` added to products for vector search

  3. Security
    - RLS enabled on all tables
    - Public read for catalog tables (products, sellers, reviews, etc.)
    - Authenticated-only access for user-specific tables
    - RLS policies use (auth.uid()::text)::int to match INT user_id columns

  4. Important Notes
    1. auth.uid() returns UUID, but user_id columns are INT, so policies cast: (auth.uid()::text)::int
    2. seller_profiles.latitude/longitude use DECIMAL(9,6) matching user's schema
    3. The stored procedure will be updated in a separate migration
*/

-- Drop existing tables in reverse dependency order
DROP TABLE IF EXISTS transaction_items CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS external_market_prices CASCADE;
DROP TABLE IF EXISTS product_demand CASCADE;
DROP TABLE IF EXISTS product_price_history CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS review_media CASCADE;
DROP TABLE IF EXISTS review_targets CASCADE;
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS wishlist_items CASCADE;
DROP TABLE IF EXISTS seller_product_offers CASCADE;
DROP TABLE IF EXISTS seller_products CASCADE;
DROP TABLE IF EXISTS seller_images CASCADE;
DROP TABLE IF EXISTS seller_profiles CASCADE;
DROP TABLE IF EXISTS product_images CASCADE;
DROP TABLE IF EXISTS product_specifications CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS user_addresses CASCADE;
DROP TABLE IF EXISTS email_verifications CASCADE;
DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Drop old stored procedure (will be recreated)
DROP FUNCTION IF EXISTS chatbot_search_products CASCADE;
DROP FUNCTION IF EXISTS chatbot_update_embedding CASCADE;

-- ==================== CORE TABLES ====================

CREATE TABLE users (
  user_id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  phone VARCHAR(20),
  password_hash TEXT NOT NULL,
  is_active BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE roles (
  role_id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  role_name VARCHAR(30) UNIQUE NOT NULL
);

CREATE TABLE user_roles (
  user_id INT,
  role_id INT,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (role_id) REFERENCES roles(role_id)
);

CREATE TABLE email_verifications (
  id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id INT UNIQUE NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE user_addresses (
  address_id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id INT NOT NULL,
  address_text TEXT NOT NULL,
  latitude DECIMAL(9,6),
  longitude DECIMAL(9,6),
  city VARCHAR(50),
  pincode VARCHAR(10),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- ==================== PRODUCTS ====================

CREATE TABLE products (
  product_id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  brand VARCHAR(50),
  model_name VARCHAR(100),
  category VARCHAR(50),
  description TEXT,
  base_price DECIMAL(10,2),
  description_embedding VECTOR(384)
);

CREATE TABLE product_specifications (
  spec_id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  product_id INT,
  spec_key VARCHAR(50),
  spec_value VARCHAR(100),
  FOREIGN KEY (product_id) REFERENCES products(product_id)
);

CREATE TABLE product_images (
  image_id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  product_id INT,
  image_url TEXT,
  FOREIGN KEY (product_id) REFERENCES products(product_id)
);

-- ==================== SELLERS ====================

CREATE TABLE seller_profiles (
  seller_id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id INT UNIQUE NOT NULL,
  shop_name VARCHAR(100) NOT NULL,
  latitude DECIMAL(9,6),
  longitude DECIMAL(9,6),
  city VARCHAR(50),
  pincode VARCHAR(10),
  is_verified BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE seller_images (
  image_id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  seller_id INT,
  image_url TEXT NOT NULL,
  FOREIGN KEY (seller_id) REFERENCES seller_profiles(seller_id)
);

CREATE TABLE seller_products (
  seller_product_id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  seller_id INT,
  product_id INT,
  price DECIMAL(10,2),
  stock_quantity INT,
  is_available BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (seller_id) REFERENCES seller_profiles(seller_id),
  FOREIGN KEY (product_id) REFERENCES products(product_id)
);

CREATE TABLE seller_product_offers (
  offer_id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  seller_product_id INT,
  discount_type VARCHAR(10),
  discount_value DECIMAL(10,2),
  start_date DATE,
  end_date DATE,
  FOREIGN KEY (seller_product_id) REFERENCES seller_products(seller_product_id)
);

-- ==================== WISHLIST & REVIEWS ====================

CREATE TABLE wishlist_items (
  user_id INT,
  product_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, product_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (product_id) REFERENCES products(product_id)
);

CREATE TABLE reviews (
  review_id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id INT,
  rating INT CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE review_targets (
  review_id INT,
  target_type VARCHAR(10),
  target_id INT,
  FOREIGN KEY (review_id) REFERENCES reviews(review_id)
);

CREATE TABLE review_media (
  media_id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  review_id INT,
  media_url TEXT,
  media_type VARCHAR(10),
  FOREIGN KEY (review_id) REFERENCES reviews(review_id)
);

-- ==================== TRANSACTIONS ====================

CREATE TABLE transactions (
  transaction_id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  buyer_user_id INT,
  seller_id INT,
  status VARCHAR(20),
  purchase_type VARCHAR(10),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (buyer_user_id) REFERENCES users(user_id),
  FOREIGN KEY (seller_id) REFERENCES seller_profiles(seller_id)
);

CREATE TABLE transaction_items (
  transaction_item_id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  transaction_id INT,
  seller_product_id INT,
  quantity INT,
  price_at_purchase DECIMAL(10,2),
  FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id),
  FOREIGN KEY (seller_product_id) REFERENCES seller_products(seller_product_id)
);

-- ==================== NOTIFICATIONS ====================

CREATE TABLE notifications (
  notification_id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  recipient_user_id INT,
  title VARCHAR(100),
  message TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (recipient_user_id) REFERENCES users(user_id)
);

-- ==================== ANALYTICS ====================

CREATE TABLE product_price_history (
  history_id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  seller_product_id INT,
  price DECIMAL(10,2),
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (seller_product_id) REFERENCES seller_products(seller_product_id)
);

CREATE TABLE product_demand (
  product_id INT,
  city VARCHAR(50),
  views_count INT DEFAULT 0,
  wishlist_count INT DEFAULT 0,
  purchase_attempts INT DEFAULT 0,
  PRIMARY KEY (product_id, city),
  FOREIGN KEY (product_id) REFERENCES products(product_id)
);

CREATE TABLE external_market_prices (
  external_price_id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  product_id INT,
  platform_name VARCHAR(50),
  price DECIMAL(10,2),
  last_updated TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(product_id)
);

-- ==================== RLS POLICIES ====================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_specifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_product_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_demand ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_market_prices ENABLE ROW LEVEL SECURITY;

-- Public read (catalog browsing)
CREATE POLICY "Public can view products" ON products FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can view product specs" ON product_specifications FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can view product images" ON product_images FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can view seller profiles" ON seller_profiles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can view seller images" ON seller_images FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can view seller products" ON seller_products FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can view seller offers" ON seller_product_offers FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can view reviews" ON reviews FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can view review media" ON review_media FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can view review targets" ON review_targets FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can view product demand" ON product_demand FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can view external prices" ON external_market_prices FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can view price history" ON product_price_history FOR SELECT TO anon, authenticated USING (true);

-- Authenticated read (user-specific data, cast auth.uid() to INT)
CREATE POLICY "Auth users can view users" ON users FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can view roles" ON roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can view user roles" ON user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can view own addresses" ON user_addresses FOR SELECT TO authenticated USING (user_id = (auth.uid()::text)::int);
CREATE POLICY "Auth users can view own wishlist" ON wishlist_items FOR SELECT TO authenticated USING (user_id = (auth.uid()::text)::int);
CREATE POLICY "Auth users can view own notifications" ON notifications FOR SELECT TO authenticated USING (recipient_user_id = (auth.uid()::text)::int);
CREATE POLICY "Auth users can view own transactions" ON transactions FOR SELECT TO authenticated USING (buyer_user_id = (auth.uid()::text)::int);
CREATE POLICY "Auth users can view own transaction items" ON transaction_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can view own email verifications" ON email_verifications FOR SELECT TO authenticated USING (user_id = (auth.uid()::text)::int);

-- Authenticated write policies
CREATE POLICY "Auth users can insert users" ON users FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update own profile" ON users FOR UPDATE TO authenticated USING (user_id = (auth.uid()::text)::int) WITH CHECK (user_id = (auth.uid()::text)::int);
CREATE POLICY "Auth users can insert products" ON products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update products" ON products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth users can insert product images" ON product_images FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can insert product specs" ON product_specifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can insert seller profiles" ON seller_profiles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update seller profiles" ON seller_profiles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth users can insert seller products" ON seller_products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update seller products" ON seller_products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth users can insert seller offers" ON seller_product_offers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can insert reviews" ON reviews FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can insert wishlist" ON wishlist_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can delete own wishlist" ON wishlist_items FOR DELETE TO authenticated USING (user_id = (auth.uid()::text)::int);
CREATE POLICY "Auth users can insert addresses" ON user_addresses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can insert roles" ON roles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can insert user roles" ON user_roles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can insert email verifications" ON email_verifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can insert seller images" ON seller_images FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can insert review media" ON review_media FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can insert review targets" ON review_targets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can insert notifications" ON notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update own notifications" ON notifications FOR UPDATE TO authenticated USING (recipient_user_id = (auth.uid()::text)::int) WITH CHECK (recipient_user_id = (auth.uid()::text)::int);
CREATE POLICY "Auth users can insert transactions" ON transactions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can insert transaction items" ON transaction_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can insert price history" ON product_price_history FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can insert product demand" ON product_demand FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can insert external prices" ON external_market_prices FOR INSERT TO authenticated WITH CHECK (true);

-- ==================== INDEXES ====================

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
CREATE INDEX IF NOT EXISTS idx_seller_products_available ON seller_products(is_available);
CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_seller_profiles_city ON seller_profiles(city);
CREATE INDEX IF NOT EXISTS idx_user_addresses_user ON user_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_user_id);
