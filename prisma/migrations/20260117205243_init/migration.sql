-- CreateTable
CREATE TABLE "Flow" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "data" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Flow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Flow_date_key" ON "Flow"("date");

-- CreateIndex
CREATE INDEX "Flow_date_idx" ON "Flow"("date");

-- CreateIndex
CREATE INDEX "Flow_createdAt_idx" ON "Flow"("createdAt");
