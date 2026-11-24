CREATE DATABASE IF NOT EXISTS shop CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE shop;


CREATE TABLE IF NOT EXISTS products (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(150)  NOT NULL,
  description TEXT          NULL,
  price       DECIMAL(10,2) NOT NULL,
  discount    DECIMAL(10,2) NULL,
  sizes       JSON          NULL,
  image_url   VARCHAR(500)  NULL,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO products (name, description, price, discount, sizes, image_url) VALUES
('Nike shoes', 'Comfortable and stylish athletic shoes.', 120.00, 10.00, '[40, 42, 44]', NULL),
('bata shoes', 'Comfortable and stylish athletic shoes.', 150.00, NULL, '[39, 41, 43]', NULL);
