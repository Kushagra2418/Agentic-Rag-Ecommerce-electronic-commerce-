-- =============================================================
-- Chatbot Stored Procedure for LocalMart
-- =============================================================
-- This file contains the stored procedure for hybrid product
-- search (vector similarity + SQL text matching) used by the
-- chatbot service.
--
-- PREREQUISITES:
--   1. pgvector extension must be enabled:
--      CREATE EXTENSION IF NOT EXISTS vector;
--
--   2. The products table must have a description_embedding column:
--      ALTER TABLE products ADD COLUMN IF NOT EXISTS description_embedding VECTOR(384);
--
--   3. Tables required: products, seller_products, seller_profiles, product_images
--      (These are part of the full LocalMart schema)
--
-- SCHEMA NOTES:
--   - seller_profiles.latitude/longitude are DECIMAL(9,6)
--   - seller_products.price is DECIMAL(10,2) (actual selling price)
--   - products.base_price is DECIMAL(10,2) (MSRP)
--   - seller_profiles has user_id (INT) linking to users table
--
-- USAGE:
--   SELECT * FROM chatbot_search_products(
--     'laptop',                    -- p_query: text search term
--     '[0.1, 0.2, ...]'::vector,  -- p_embedding: 384-dim embedding vector
--     28.6139,                     -- p_lat: user latitude
--     77.2090,                     -- p_lng: user longitude
--     10                           -- p_radius_km: search radius in km (default 10)
--   );
-- =============================================================

-- Add description_embedding column if it doesn't exist
ALTER TABLE products ADD COLUMN IF NOT EXISTS description_embedding VECTOR(384);

-- Create or replace the hybrid search function
CREATE OR REPLACE FUNCTION chatbot_search_products(
  p_query TEXT,
  p_embedding VECTOR(384),
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_radius_km DOUBLE PRECISION DEFAULT 10
)
RETURNS TABLE (
  seller_product_id INT,
  product_id INT,
  brand VARCHAR(50),
  model_name VARCHAR(100),
  category VARCHAR(50),
  description TEXT,
  seller_price DECIMAL(10,2),
  distance_km DOUBLE PRECISION,
  shop_name VARCHAR(100),
  image_url TEXT,
  similarity_score DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sp.seller_product_id::INT,
    p.product_id::INT,
    p.brand::VARCHAR(50),
    p.model_name::VARCHAR(100),
    p.category::VARCHAR(50),
    p.description::TEXT,
    sp.price::DECIMAL(10,2),
    (6371 * acos(
      cos(radians(p_lat)) * cos(radians(sl.latitude::DOUBLE PRECISION)) *
      cos(radians(sl.longitude::DOUBLE PRECISION) - radians(p_lng)) +
      sin(radians(p_lat)) * sin(radians(sl.latitude::DOUBLE PRECISION))
    ))::DOUBLE PRECISION AS distance_km,
    sl.shop_name::VARCHAR(100),
    (SELECT pi.image_url FROM product_images pi WHERE pi.product_id = p.product_id LIMIT 1)::TEXT,
    (1 - (p.description_embedding <=> p_embedding))::DOUBLE PRECISION AS similarity_score
  FROM products p
  JOIN seller_products sp ON sp.product_id = p.product_id
  JOIN seller_profiles sl ON sl.seller_id = sp.seller_id
  WHERE
    sp.is_available = true
    AND (
      p.brand ILIKE '%' || p_query || '%'
      OR p.model_name ILIKE '%' || p_query || '%'
      OR p.category ILIKE '%' || p_query || '%'
      OR p.description ILIKE '%' || p_query || '%'
    )
    AND (6371 * acos(
      cos(radians(p_lat)) * cos(radians(sl.latitude::DOUBLE PRECISION)) *
      cos(radians(sl.longitude::DOUBLE PRECISION) - radians(p_lng)) +
      sin(radians(p_lat)) * sin(radians(sl.latitude::DOUBLE PRECISION))
    )) <= p_radius_km
  ORDER BY distance_km ASC
  LIMIT 5;
END;
$$ LANGUAGE plpgsql;

-- Helper function to update product embeddings (used by edge function)
CREATE OR REPLACE FUNCTION chatbot_update_embedding(p_product_id INT, p_embedding TEXT)
RETURNS VOID
AS $$
BEGIN
  UPDATE products
  SET description_embedding = p_embedding::vector(384)
  WHERE product_id = p_product_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
