/*
  # Create chatbot hybrid search stored procedure

  1. New Functions
    - `chatbot_search_products(p_query, p_embedding, p_lat, p_lng, p_radius_km)`
      - Performs hybrid search combining vector similarity and SQL text matching
      - Filters by geographic radius (Haversine formula)
      - Returns top 5 products sorted by distance
      - Returns: seller_product_id, product_id, brand, model_name, category, description, seller_price, distance_km, shop_name, image_url, similarity_score

  2. Important Notes
    1. Uses pgvector cosine distance operator (<=>) for similarity scoring
    2. Uses ILIKE for text matching across brand, model_name, category, and description
    3. Haversine formula calculates great-circle distance in kilometers
    4. Default radius is 10km
    5. Results are limited to 5 and ordered by distance ascending
*/

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
