UPDATE "RestaurantStaff"
SET "role" = 'VIEWER'
WHERE "role" = 'MENU_EDITOR';

CREATE TYPE "RestaurantStaffRole_new" AS ENUM ('OWNER', 'MANAGER', 'ORDER_STAFF', 'VIEWER');

ALTER TABLE "RestaurantStaff"
ALTER COLUMN "role" TYPE "RestaurantStaffRole_new"
USING ("role"::text::"RestaurantStaffRole_new");

DROP TYPE "RestaurantStaffRole";

ALTER TYPE "RestaurantStaffRole_new" RENAME TO "RestaurantStaffRole";
