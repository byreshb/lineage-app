-- Shared dataset definitions from ReportServer
-- These are the actual SQL queries behind SharedDataSet references in RDL files
-- Export to: shared_datasets.csv

USE [ReportServer];
SELECT
    c.Name AS dataset_name,
    c.Path AS dataset_path,
    xmlData.value('(//rd:CommandType)[1]', 'nvarchar(50)') AS command_type,
    xmlData.value('(//rd:CommandText)[1]', 'nvarchar(max)') AS command_text
FROM dbo.Catalog c
CROSS APPLY (
    SELECT CAST(CAST(c.Content AS varbinary(max)) AS xml) AS xmlData
) AS parsed
WHERE c.Type = 8  -- Type 8 = SharedDataset
ORDER BY c.Path, c.Name;
