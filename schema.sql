CREATE DATABASE IF NOT EXISTS shop CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE shop;

-- For an existing database, run this once before deploying the updated API.
-- Skip the ADD COLUMN statement if images was already added by the previous migration.
-- ALTER TABLE products ADD COLUMN images JSON NULL;
-- UPDATE products
-- SET images = CASE
--   WHEN image_url IS NULL OR image_url = '' THEN JSON_ARRAY()
--   ELSE JSON_ARRAY(image_url)
-- END
-- WHERE images IS NULL;
-- ALTER TABLE products MODIFY images JSON NOT NULL;
-- ALTER TABLE products DROP COLUMN image_url;

CREATE TABLE IF NOT EXISTS products (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(150)  NOT NULL,
  description TEXT          NULL,
  price       DECIMAL(10,2) NOT NULL,
  discount    DECIMAL(10,2) NULL,
  sizes       JSON          NULL,
  images      JSON          NOT NULL,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orders (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id       INT UNSIGNED NOT NULL,
  quantity         INT UNSIGNED NOT NULL,
  total_price      DECIMAL(10,2) NOT NULL,
  name             VARCHAR(150) NOT NULL,
  email            VARCHAR(254) NOT NULL,
  phone            VARCHAR(30) NOT NULL,
  delivery_address TEXT NOT NULL,
  status           ENUM('pending', 'declined', 'confirmed') NOT NULL DEFAULT 'pending',
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_product
    FOREIGN KEY (product_id) REFERENCES products (id)
    ON UPDATE CASCADE
) ENGINE=InnoDB;

-- For an existing orders table, run this migration once:
-- ALTER TABLE orders
--   ADD COLUMN quantity INT UNSIGNED NOT NULL DEFAULT 1,
--   ADD COLUMN total_price DECIMAL(10,2) NOT NULL DEFAULT 0.00;
-- UPDATE orders
-- JOIN products ON products.id = orders.product_id
-- SET orders.total_price = ROUND(products.price * orders.quantity, 2);

INSERT INTO products (name, description, price, discount, sizes, images) VALUES
('Nike shoes', 'Comfortable and stylish athletic shoes.', 120.00, 10.00, '[40, 42, 44]', '[]'),
('bata shoes', 'Comfortable and stylish athletic shoes.', 150.00, NULL, '[39, 41, 43]', '[]');
