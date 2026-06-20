/*
  # Enable pgvector and create e-commerce tables

  1. New Extensions
    - `vector` — enables the VECTOR data type for pgvector similarity search

  2. New Tables
    - `products`
      - `product_id` (int, primary key, auto-increment)
      - `brand` (varchar(50))
      - `model_name` (varchar(100))
      - `category` (varchar(50))
      - `description` (text)
      - `description_embedding` (vector(384)) — for semantic search
      - `created_at` (timestamptz)
    - `seller_profiles`
      - `seller_id` (int, primary key, auto-increment)
      - `shop_name` (varchar(100))
      - `latitude` (double precision)
      - `longitude` (double precision)
      - `created_at` (timestamptz)
    - `seller_products`
      - `seller_product_id` (int, primary key, auto-increment)
      - `seller_id` (int, foreign key → seller_profiles)
      - `product_id` (int, foreign key → products)
      - `price` (decimal(10,2))
      - `is_available` (boolean, default true)
      - `created_at` (timestamptz)
    - `product_images`
      - `image_id` (int, primary key, auto-increment)
      - `product_id` (int, foreign key → products)
      - `image_url` (text)
      - `created_at` (timestamptz)

  3. Security
    - RLS enabled on all tables
    - Public read access for all tables (e-commerce catalog is browsable)
    - Only authenticated users can insert/update/delete

  4. Important Notes
    1. The vector extension is required for the description_embedding column
    2. Foreign keys enforce referential integrity between products, sellers, and images
    3. The stored procedure for hybrid search will be created in a separate migration
*/

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Products table
CREATE TABLE IF NOT EXISTS products (
  product_id SERIAL PRIMARY KEY,
  brand VARCHAR(50) NOT NULL DEFAULT '',
  model_name VARCHAR(100) NOT NULL DEFAULT '',
  category VARCHAR(50) NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  description_embedding VECTOR(384),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seller profiles table
CREATE TABLE IF NOT EXISTS seller_profiles (
  seller_id SERIAL PRIMARY KEY,
  shop_name VARCHAR(100) NOT NULL DEFAULT '',
  latitude DOUBLE PRECISION NOT NULL DEFAULT 0,
  longitude DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seller products (inventory) table
CREATE TABLE IF NOT EXISTS seller_products (
  seller_product_id SERIAL PRIMARY KEY,
  seller_id INT NOT NULL REFERENCES seller_profiles(seller_id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Product images table
CREATE TABLE IF NOT EXISTS product_images (
  image_id SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  image_url TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;

-- Public read policies (catalog is browsable by everyone)
CREATE POLICY "Anyone can view products"
  ON products FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can view seller profiles"
  ON seller_profiles FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can view seller products"
  ON seller_products FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can view product images"
  ON product_images FOR SELECT
  TO anon, authenticated
  USING (true);

-- Authenticated write policies
CREATE POLICY "Authenticated users can insert products"
  ON products FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update products"
  ON products FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can insert seller profiles"
  ON seller_profiles FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update seller profiles"
  ON seller_profiles FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can insert seller products"
  ON seller_products FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update seller products"
  ON seller_products FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can insert product images"
  ON product_images FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update product images"
  ON product_images FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Indexes for search performance
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
CREATE INDEX IF NOT EXISTS idx_seller_products_available ON seller_products(is_available);
CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id);
