-- CreateTable
CREATE TABLE "UserLayout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserLayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioData" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveOICache" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "tradingDate" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveOICache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompositeHistory" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'main',
    "data" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompositeHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EtfFlowHistory" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'main',
    "data" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EtfFlowHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserLayout_userId_key" ON "UserLayout"("userId");

-- CreateIndex
CREATE INDEX "UserLayout_userId_idx" ON "UserLayout"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioData_userId_key" ON "PortfolioData"("userId");

-- CreateIndex
CREATE INDEX "PortfolioData_userId_idx" ON "PortfolioData"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveOICache_ticker_tradingDate_key" ON "LiveOICache"("ticker", "tradingDate");

-- CreateIndex
CREATE INDEX "LiveOICache_ticker_tradingDate_idx" ON "LiveOICache"("ticker", "tradingDate");

-- CreateIndex
CREATE UNIQUE INDEX "CompositeHistory_key_key" ON "CompositeHistory"("key");

-- CreateIndex
CREATE INDEX "CompositeHistory_key_idx" ON "CompositeHistory"("key");

-- CreateIndex
CREATE UNIQUE INDEX "EtfFlowHistory_key_key" ON "EtfFlowHistory"("key");

-- CreateIndex
CREATE INDEX "EtfFlowHistory_key_idx" ON "EtfFlowHistory"("key");
