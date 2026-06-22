-- CreateEnum
CREATE TYPE "CircuitBreakerState" AS ENUM ('CLOSED', 'OPEN', 'HALF_OPEN');

-- CreateTable
CREATE TABLE "CircuitBreaker" (
    "serviceKey" TEXT NOT NULL,
    "state" "CircuitBreakerState" NOT NULL DEFAULT 'CLOSED',
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "openedUntil" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "halfOpenProbeAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CircuitBreaker_pkey" PRIMARY KEY ("serviceKey")
);

-- CreateIndex
CREATE INDEX "CircuitBreaker_state_idx" ON "CircuitBreaker"("state");

-- CreateIndex
CREATE INDEX "CircuitBreaker_openedUntil_idx" ON "CircuitBreaker"("openedUntil");
