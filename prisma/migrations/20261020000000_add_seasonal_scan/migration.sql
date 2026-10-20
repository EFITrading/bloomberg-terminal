-- CreateTable
CREATE TABLE "SeasonalScan" (
    "key" TEXT NOT NULL,
    "scanDate" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeasonalScan_pkey" PRIMARY KEY ("key")
);
