-- CreateTable
CREATE TABLE "SweepSenseSnapshot" (
    "id" TEXT NOT NULL,
    "tradingDate" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "tradeCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SweepSenseSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SweepSenseSnapshot_tradingDate_key" ON "SweepSenseSnapshot"("tradingDate");

-- CreateIndex
CREATE INDEX "SweepSenseSnapshot_tradingDate_idx" ON "SweepSenseSnapshot"("tradingDate");
