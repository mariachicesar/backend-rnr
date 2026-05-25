-- CreateTable
CREATE TABLE "AiEstimateSession" (
    "id" VARCHAR(255) NOT NULL,
    "userId" VARCHAR(255) NOT NULL,
    "step" VARCHAR(50) NOT NULL DEFAULT 'upload',
    "jobType" VARCHAR(50) NOT NULL DEFAULT 'adu',
    "rawExtraction" TEXT,
    "scope" TEXT,
    "lineItems" TEXT,
    "draft" TEXT,
    "savedEstimateId" VARCHAR(255),
    "rejectionReason" VARCHAR(255),
    "errorMessage" TEXT,
    "iterations" TEXT NOT NULL DEFAULT '{}',
    "fileName" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiEstimateSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" VARCHAR(255) NOT NULL,
    "clientId" VARCHAR(255) NOT NULL,
    "userId" VARCHAR(255) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "sourceType" VARCHAR(50) NOT NULL DEFAULT 'estimate',
    "sourceEstimateId" VARCHAR(255),
    "sourceContractId" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "B2BProspect" (
    "id" VARCHAR(255) NOT NULL,
    "companyName" VARCHAR(255) NOT NULL,
    "contactName" VARCHAR(255),
    "email" VARCHAR(255),
    "phone" VARCHAR(50),
    "website" VARCHAR(500),
    "address" TEXT,
    "city" VARCHAR(100),
    "state" VARCHAR(50),
    "zipCode" VARCHAR(20),
    "prospectType" VARCHAR(50) NOT NULL,
    "stage" VARCHAR(50) NOT NULL DEFAULT 'discovered',
    "priority" VARCHAR(20) NOT NULL DEFAULT 'medium',
    "cslbLicense" VARCHAR(50),
    "cslbClassification" VARCHAR(100),
    "cslbStatus" VARCHAR(50),
    "licenseIssuedDate" TIMESTAMP(3),
    "licenseExpireDate" TIMESTAMP(3),
    "source" VARCHAR(50) NOT NULL DEFAULT 'manual',
    "sourceUrl" VARCHAR(500),
    "linkedinUrl" VARCHAR(500),
    "enrichmentSummary" TEXT,
    "notes" TEXT,
    "lastContactedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "B2BProspect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProspectActivity" (
    "id" VARCHAR(255) NOT NULL,
    "prospectId" VARCHAR(255) NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProspectActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProspectAgentRun" (
    "id" VARCHAR(255) NOT NULL,
    "searchType" VARCHAR(50) NOT NULL,
    "tradeFilter" VARCHAR(100),
    "cityFilter" VARCHAR(100),
    "licenseAge" VARCHAR(50),
    "status" VARCHAR(50) NOT NULL DEFAULT 'running',
    "found" INTEGER NOT NULL DEFAULT 0,
    "imported" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "resultSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProspectAgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiEstimateSession_userId_idx" ON "AiEstimateSession"("userId");

-- CreateIndex
CREATE INDEX "AiEstimateSession_step_idx" ON "AiEstimateSession"("step");

-- CreateIndex
CREATE INDEX "AiEstimateSession_jobType_idx" ON "AiEstimateSession"("jobType");

-- CreateIndex
CREATE INDEX "AiEstimateSession_createdAt_idx" ON "AiEstimateSession"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Project_sourceEstimateId_key" ON "Project"("sourceEstimateId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_sourceContractId_key" ON "Project"("sourceContractId");

-- CreateIndex
CREATE INDEX "Project_clientId_idx" ON "Project"("clientId");

-- CreateIndex
CREATE INDEX "Project_userId_idx" ON "Project"("userId");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Project_sourceType_idx" ON "Project"("sourceType");

-- CreateIndex
CREATE UNIQUE INDEX "B2BProspect_cslbLicense_key" ON "B2BProspect"("cslbLicense");

-- CreateIndex
CREATE INDEX "B2BProspect_stage_idx" ON "B2BProspect"("stage");

-- CreateIndex
CREATE INDEX "B2BProspect_prospectType_idx" ON "B2BProspect"("prospectType");

-- CreateIndex
CREATE INDEX "B2BProspect_source_idx" ON "B2BProspect"("source");

-- CreateIndex
CREATE INDEX "B2BProspect_city_idx" ON "B2BProspect"("city");

-- CreateIndex
CREATE INDEX "B2BProspect_priority_idx" ON "B2BProspect"("priority");

-- CreateIndex
CREATE INDEX "ProspectActivity_prospectId_idx" ON "ProspectActivity"("prospectId");

-- CreateIndex
CREATE INDEX "ProspectActivity_type_idx" ON "ProspectActivity"("type");

-- CreateIndex
CREATE INDEX "ProspectActivity_createdAt_idx" ON "ProspectActivity"("createdAt");

-- CreateIndex
CREATE INDEX "ProspectAgentRun_status_idx" ON "ProspectAgentRun"("status");

-- CreateIndex
CREATE INDEX "ProspectAgentRun_searchType_idx" ON "ProspectAgentRun"("searchType");

-- CreateIndex
CREATE INDEX "ProspectAgentRun_createdAt_idx" ON "ProspectAgentRun"("createdAt");

-- AddForeignKey
ALTER TABLE "AiEstimateSession" ADD CONSTRAINT "AiEstimateSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectActivity" ADD CONSTRAINT "ProspectActivity_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "B2BProspect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

