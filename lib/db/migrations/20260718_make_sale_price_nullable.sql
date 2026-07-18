-- Migration: remove fixed product sale price requirement
-- Sale price now varies per customer per sale (set at time of sale),
-- so the product-level sale_price column is no longer required.

ALTER TABLE products ALTER COLUMN sale_price DROP NOT NULL;
