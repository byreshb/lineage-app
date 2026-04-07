-- linked_reports.sql
-- Export Linked Reports (Type 4) mapped to their Template/Source Reports (Type 2)
-- This allows users to search by Linked Report name and trace lineage to the template
--
-- Usage:
--   1. Run this query on your SSRS ReportServer database
--   2. Export results to data/linked_reports.csv (comma-delimited)
--   3. Click "Load Metadata" in the UI to import

SELECT
    linked.Name AS LinkedReportName,
    linked.Path AS LinkedReportPath,
    template.Path AS TemplatePath
FROM ReportServer.dbo.Catalog linked
INNER JOIN ReportServer.dbo.Catalog template
    ON linked.LinkSourceID = template.ItemID
WHERE linked.Type = 4  -- Linked Reports only
ORDER BY linked.Path