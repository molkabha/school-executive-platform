-- CreateIndex
CREATE UNIQUE INDEX "StaffModuleEntry_schoolId_moduleName_title_key" ON "StaffModuleEntry"("schoolId", "moduleName", "title");

-- CreateIndex
CREATE UNIQUE INDEX "KpiSnapshot_schoolId_metricName_date_key" ON "KpiSnapshot"("schoolId", "metricName", "date");
