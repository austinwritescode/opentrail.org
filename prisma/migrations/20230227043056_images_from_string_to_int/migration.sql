/*
  Warnings:

  - The `images` column on the `Marker` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Marker" DROP COLUMN "images",
ADD COLUMN     "images" INTEGER[];
