-- CreateTable
CREATE TABLE "FlowBatch" (
    "id" TEXT NOT NULL,
    "tradingDate" TEXT NOT NULL,
    "batchTime" TIMESTAMP(3) NOT NULL,
    "data" TEXT NOT NULL,
    "tradeCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlowBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FlowBatch_tradingDate_key" ON "FlowBatch"("tradingDate");

-- CreateIndex
CREATE INDEX "FlowBatch_tradingDate_idx" ON "FlowBatch"("tradingDate");
