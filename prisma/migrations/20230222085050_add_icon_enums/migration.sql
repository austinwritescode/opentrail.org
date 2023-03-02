-- CreateEnum
CREATE TYPE "Icon" AS ENUM ('alert', 'camp', 'other', 'road', 'swater', 'town', 'trail', 'water');

-- CreateTable
CREATE TABLE "Trail" (
    "id" SMALLINT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Trail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Marker" (
    "id" SERIAL NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "elev" SMALLINT,
    "title" TEXT NOT NULL,
    "desc" TEXT NOT NULL,
    "images" TEXT[],
    "icons" "Icon"[],

    CONSTRAINT "Marker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" SERIAL NOT NULL,
    "text" TEXT NOT NULL,
    "user" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "markerId" INTEGER NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarkersOnTrails" (
    "markerId" INTEGER NOT NULL,
    "trailId" SMALLINT NOT NULL,
    "milex10" SMALLINT,

    CONSTRAINT "MarkersOnTrails_pkey" PRIMARY KEY ("markerId","trailId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Trail_name_key" ON "Trail"("name");

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_markerId_fkey" FOREIGN KEY ("markerId") REFERENCES "Marker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkersOnTrails" ADD CONSTRAINT "MarkersOnTrails_markerId_fkey" FOREIGN KEY ("markerId") REFERENCES "Marker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkersOnTrails" ADD CONSTRAINT "MarkersOnTrails_trailId_fkey" FOREIGN KEY ("trailId") REFERENCES "Trail"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
