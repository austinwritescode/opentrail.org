-- DropForeignKey
ALTER TABLE "Comment" DROP CONSTRAINT "Comment_markerId_fkey";

-- DropForeignKey
ALTER TABLE "CommentIP" DROP CONSTRAINT "CommentIP_commentId_fkey";

-- DropForeignKey
ALTER TABLE "FlaggedComment" DROP CONSTRAINT "FlaggedComment_commentId_fkey";

-- DropForeignKey
ALTER TABLE "FlaggedImage" DROP CONSTRAINT "FlaggedImage_markerId_fkey";

-- DropForeignKey
ALTER TABLE "FlaggedMarker" DROP CONSTRAINT "FlaggedMarker_markerId_fkey";

-- DropForeignKey
ALTER TABLE "MarkersOnTrails" DROP CONSTRAINT "MarkersOnTrails_markerId_fkey";

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_markerId_fkey" FOREIGN KEY ("markerId") REFERENCES "Marker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkersOnTrails" ADD CONSTRAINT "MarkersOnTrails_markerId_fkey" FOREIGN KEY ("markerId") REFERENCES "Marker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlaggedImage" ADD CONSTRAINT "FlaggedImage_markerId_fkey" FOREIGN KEY ("markerId") REFERENCES "Marker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlaggedComment" ADD CONSTRAINT "FlaggedComment_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlaggedMarker" ADD CONSTRAINT "FlaggedMarker_markerId_fkey" FOREIGN KEY ("markerId") REFERENCES "Marker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentIP" ADD CONSTRAINT "CommentIP_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
