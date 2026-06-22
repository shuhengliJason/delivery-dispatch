ALTER TABLE "User" ADD COLUMN "updatedById" TEXT;

CREATE INDEX "User_updatedById_idx" ON "User"("updatedById");

ALTER TABLE "User" ADD CONSTRAINT "User_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
