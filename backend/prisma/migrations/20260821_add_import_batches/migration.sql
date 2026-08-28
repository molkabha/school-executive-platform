-- Import batches: tracks each import run and its row-level outcomes.
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourceType" TEXT NOT NULL,
    "datasetType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileId" TEXT,
    "fileMimeType" TEXT,
    "fileSize" INTEGER,
    "fileChecksum" TEXT,
    "schoolId" TEXT,
    "triggeredById" TEXT NOT NULL,
    "mapping" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "errors" TEXT,
    "summary" TEXT,
    "preview" TEXT,
    "rolledBackAt" TIMESTAMP(3),
    "rolledBackById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImportBatchItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "naturalKey" TEXT,
    "action" TEXT NOT NULL,
    "schoolId" TEXT,
    "beforeState" TEXT,
    "afterState" TEXT,
    "rawRow" TEXT,
    "errors" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatchItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImportBatch_sourceId_idx" ON "ImportBatch"("sourceId");
CREATE INDEX "ImportBatch_sourceType_idx" ON "ImportBatch"("sourceType");
CREATE INDEX "ImportBatch_datasetType_idx" ON "ImportBatch"("datasetType");
CREATE INDEX "ImportBatch_schoolId_idx" ON "ImportBatch"("schoolId");
CREATE INDEX "ImportBatch_triggeredById_idx" ON "ImportBatch"("triggeredById");
CREATE INDEX "ImportBatch_status_idx" ON "ImportBatch"("status");
CREATE INDEX "ImportBatch_createdAt_idx" ON "ImportBatch"("createdAt");

CREATE INDEX "ImportBatchItem_batchId_idx" ON "ImportBatchItem"("batchId");
CREATE INDEX "ImportBatchItem_entityType_entityId_idx" ON "ImportBatchItem"("entityType", "entityId");
CREATE INDEX "ImportBatchItem_schoolId_idx" ON "ImportBatchItem"("schoolId");
CREATE INDEX "ImportBatchItem_action_idx" ON "ImportBatchItem"("action");
CREATE INDEX "ImportBatchItem_rowNumber_idx" ON "ImportBatchItem"("rowNumber");

ALTER TABLE "ImportBatch"
ADD CONSTRAINT "ImportBatch_sourceId_fkey"
FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ImportBatch"
ADD CONSTRAINT "ImportBatch_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ImportBatch"
ADD CONSTRAINT "ImportBatch_triggeredById_fkey"
FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ImportBatch"
ADD CONSTRAINT "ImportBatch_rolledBackById_fkey"
FOREIGN KEY ("rolledBackById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ImportBatchItem"
ADD CONSTRAINT "ImportBatchItem_batchId_fkey"
FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
