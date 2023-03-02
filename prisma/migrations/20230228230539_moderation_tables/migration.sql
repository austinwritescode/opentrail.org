-- CreateTable
CREATE TABLE "FlaggedImage" (
    "id" SERIAL NOT NULL,
    "image" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "user" TEXT,

    CONSTRAINT "FlaggedImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlaggedComment" (
    "id" SERIAL NOT NULL,
    "commentId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "user" TEXT,

    CONSTRAINT "FlaggedComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlaggedMarker" (
    "id" SERIAL NOT NULL,
    "markerId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "user" TEXT,

    CONSTRAINT "FlaggedMarker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Moderation" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "request" JSONB NOT NULL,
    "dbquery" JSONB NOT NULL,
    "ip" TEXT NOT NULL,
    "user" TEXT,

    CONSTRAINT "Moderation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentIP" (
    "id" SERIAL NOT NULL,
    "commentId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "ip" TEXT NOT NULL,
    "user" TEXT,

    CONSTRAINT "CommentIP_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "FlaggedComment" ADD CONSTRAINT "FlaggedComment_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlaggedMarker" ADD CONSTRAINT "FlaggedMarker_markerId_fkey" FOREIGN KEY ("markerId") REFERENCES "Marker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentIP" ADD CONSTRAINT "CommentIP_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
