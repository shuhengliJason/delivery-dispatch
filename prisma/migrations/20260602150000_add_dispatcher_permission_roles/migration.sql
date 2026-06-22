CREATE TYPE "DispatcherRole" AS ENUM ('ORDER_OPERATOR', 'USER_MANAGER', 'DISPATCHER_ADMIN');

CREATE TABLE "DispatcherProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "DispatcherRole" NOT NULL DEFAULT 'ORDER_OPERATOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DispatcherProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DispatcherProfile_userId_key" ON "DispatcherProfile"("userId");

CREATE INDEX "DispatcherProfile_role_idx" ON "DispatcherProfile"("role");

ALTER TABLE "DispatcherProfile"
ADD CONSTRAINT "DispatcherProfile_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "DispatcherProfile" ("id", "userId", "role", "createdAt", "updatedAt")
SELECT
    concat('dispatcher_profile_', "id"),
    "id",
    'DISPATCHER_ADMIN'::"DispatcherRole",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "User"
WHERE "role" = 'DISPATCHER'
ON CONFLICT ("userId") DO NOTHING;
