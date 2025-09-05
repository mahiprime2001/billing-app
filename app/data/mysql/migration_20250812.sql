-- Migration to align BillItems table with the new data structure from bill.json
-- Adds tax, gstRate, and barcodes columns to the BillItems table.

ALTER TABLE `BillItems`
ADD COLUMN `tax` DECIMAL(10, 2) DEFAULT 0.00,
ADD COLUMN `gstRate` DECIMAL(10, 2) DEFAULT 0.00,
ADD COLUMN `barcodes` TEXT;
