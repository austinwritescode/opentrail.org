/*
  Warnings:

  - You are about to drop the column `dbquery` on the `Moderation` table. All the data in the column will be lost.
  - Added the required column `route` to the `Moderation` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Moderation" DROP COLUMN "dbquery",
ADD COLUMN     "image" BYTEA,
ADD COLUMN     "route" TEXT NOT NULL;
