/*
  Warnings:

  - Made the column `user` on table `FlaggedComment` required. This step will fail if there are existing NULL values in that column.
  - Made the column `user` on table `FlaggedImage` required. This step will fail if there are existing NULL values in that column.
  - Made the column `user` on table `FlaggedMarker` required. This step will fail if there are existing NULL values in that column.
  - Made the column `user` on table `Moderation` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "FlaggedComment" ALTER COLUMN "user" SET NOT NULL;

-- AlterTable
ALTER TABLE "FlaggedImage" ALTER COLUMN "user" SET NOT NULL;

-- AlterTable
ALTER TABLE "FlaggedMarker" ALTER COLUMN "user" SET NOT NULL;

-- AlterTable
ALTER TABLE "Moderation" ALTER COLUMN "user" SET NOT NULL;
