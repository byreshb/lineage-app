-- Shared Data Sources from SSRS ReportServer
-- Run on: ReportServer database
-- Export as: shared_datasources.csv (comma-delimited)
--
-- This extracts the actual connection strings for shared data sources,
-- so we can determine which database each data source connects to.
--
-- SSMS Settings: Tools → Options → Query Results → Results to Text → Comma Delimited
-- Export: Ctrl+Shift+F (Results to File) → save as shared_datasources.csv
--
-- QUICK COUNT:
--   SELECT COUNT(*) AS DataSourceCount FROM Catalog WHERE Type = 5;

USE [ReportServer];

SELECT
    c.Name AS DataSourceName,
    c.Path AS DataSourcePath,
    x.value('(/*:DataSourceDefinition/*:ConnectString)[1]', 'nvarchar(max)') AS ConnectionString,
    x.value('(/*:DataSourceDefinition/*:Extension)[1]', 'nvarchar(100)') AS Extension
FROM dbo.Catalog c
CROSS APPLY (SELECT CAST(CAST(c.Content AS VARBINARY(MAX)) AS XML) AS x) AS parsed
WHERE c.Type = 5  -- Type 5 = DataSource
ORDER BY c.Path, c.Name;
