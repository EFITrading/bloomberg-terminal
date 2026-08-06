-- CreateTable
CREATE TABLE "DiscordAlertedFlow" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "tradingDate" TEXT NOT NULL,
    "alertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordAlertedFlow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscordAlertedFlow_flowId_tradingDate_key" ON "DiscordAlertedFlow"("flowId", "tradingDate");

-- CreateIndex
CREATE INDEX "DiscordAlertedFlow_tradingDate_idx" ON "DiscordAlertedFlow"("tradingDate");
