-- CreateTable
CREATE TABLE "AiSuiteScript" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSuiteScript_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiSuiteScript_userId_idx" ON "AiSuiteScript"("userId");

-- CreateIndex
CREATE INDEX "AiSuiteScript_visibility_idx" ON "AiSuiteScript"("visibility");
