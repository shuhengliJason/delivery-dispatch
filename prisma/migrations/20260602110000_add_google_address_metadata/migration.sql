-- AlterTable
ALTER TABLE "Address"
ADD COLUMN "formattedAddress" TEXT,
ADD COLUMN "googlePlaceId" TEXT,
ADD COLUMN "googleMapsUri" TEXT,
ADD COLUMN "addressComponents" JSONB;

-- CreateIndex
CREATE INDEX "Address_googlePlaceId_idx" ON "Address"("googlePlaceId");
