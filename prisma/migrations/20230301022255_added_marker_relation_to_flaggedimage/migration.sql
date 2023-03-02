/*
  Warnings:

  - Added the required column `markerId` to the `FlaggedImage` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "FlaggedImage" ADD COLUMN     "markerId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "FlaggedImage" ADD CONSTRAINT "FlaggedImage_markerId_fkey" FOREIGN KEY ("markerId") REFERENCES "Marker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
