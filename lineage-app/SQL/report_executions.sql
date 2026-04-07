-- Recent Report Executions with Parameters
-- Run on: ReportServer database
-- Export as: report_executions.csv (tab-delimited .txt recommended)
-- Gets latest 10 executions per report (regardless of age)

USE [ReportServer];

WITH RankedExecutions AS (
    SELECT
        c.Path AS ReportPath,
        e.TimeStart AS ExecutedAt,
        e.Status,
        e.RequestType,
        e.UserName,
        e.Parameters,
        ROW_NUMBER() OVER (PARTITION BY c.Path ORDER BY e.TimeStart DESC) AS RowNum
    FROM dbo.Catalog c
    INNER JOIN dbo.ExecutionLog3 e ON c.Path = e.ItemPath
    WHERE c.Type = 2
)
SELECT
    ReportPath,
    ExecutedAt,
    Status,
    RequestType,
    UserName,
    Parameters
FROM RankedExecutions
WHERE RowNum <= 10
ORDER BY ReportPath, ExecutedAt DESC;
