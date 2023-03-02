/*
  Warnings:

  - Made the column `elev` on table `Marker` required. This step will fail if there are existing NULL values in that column.
  - Changed the type of `icons` on the `Marker` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "Marker" ALTER COLUMN "elev" SET NOT NULL,
DROP COLUMN "icons",
ADD COLUMN     "icons" TEXT NOT NULL;

-- DropEnum
DROP TYPE "Icon";
