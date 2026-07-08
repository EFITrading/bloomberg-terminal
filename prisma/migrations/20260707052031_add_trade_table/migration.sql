-- DropIndex
DROP INDEX "FlowBatch_tradingDate_key";

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "tradingDate" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "underlyingTicker" TEXT NOT NULL,
    "expiry" TEXT NOT NULL,
    "optionType" TEXT NOT NULL,
    "strike" DOUBLE PRECISION NOT NULL,
    "tradeSize" INTEGER NOT NULL,
    "premiumPerContract" DOUBLE PRECISION NOT NULL,
    "totalPremium" DOUBLE PRECISION NOT NULL,
    "spotPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exchangeId" INTEGER,
    "tradeType" TEXT NOT NULL,
    "tradeTimestamp" TIMESTAMP(3) NOT NULL,
    "daysToExpiry" INTEGER NOT NULL DEFAULT 0,
    "volume" INTEGER,
    "openInterest" INTEGER,
    "baseOpenInterest" INTEGER,
    "iv" DOUBLE PRECISION,
    "fillStyle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Trade_tradingDate_totalPremium_idx" ON "Trade"("tradingDate", "totalPremium");

-- CreateIndex
CREATE INDEX "Trade_tradingDate_tradeType_totalPremium_idx" ON "Trade"("tradingDate", "tradeType", "totalPremium");

-- CreateIndex
CREATE INDEX "Trade_tradingDate_underlyingTicker_idx" ON "Trade"("tradingDate", "underlyingTicker");

-- CreateIndex
CREATE INDEX "Trade_tradeTimestamp_idx" ON "Trade"("tradeTimestamp");

-- CreateIndex
CREATE INDEX "FlowBatch_batchTime_idx" ON "FlowBatch"("batchTime");
