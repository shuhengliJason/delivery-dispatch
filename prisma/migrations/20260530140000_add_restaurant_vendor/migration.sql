ALTER TABLE "Restaurant" ADD COLUMN "vendorId" TEXT;

ALTER TABLE "Restaurant"
    ADD CONSTRAINT "Restaurant_vendorId_fkey"
    FOREIGN KEY ("vendorId") REFERENCES "User"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;

CREATE INDEX "Restaurant_vendorId_idx" ON "Restaurant"("vendorId");
