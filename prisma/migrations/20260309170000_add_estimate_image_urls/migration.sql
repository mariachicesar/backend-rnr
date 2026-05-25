-- AlterTable: add imageUrls column to Estimate if it doesn't exist
ALTER TABLE "Estimate" ADD COLUMN IF NOT EXISTS "imageUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
