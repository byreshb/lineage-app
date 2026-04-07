-- Report Execution History from SSRS
-- Run on: ReportServer database (D300SQLDW01)
-- Export as: report_execution_history.csv

USE [ReportServer];

SELECT
    c.Name AS ReportName,
    c.Path AS ReportPath,
    COUNT(e.TimeStart) AS ExecutionCount,
    MAX(e.TimeStart) AS LastExecutedAt,
    MIN(e.TimeStart) AS FirstExecutedAt,
    DATEDIFF(DAY, MAX(e.TimeStart), GETDATE()) AS DaysSinceLastRun,
    SUM(CASE WHEN e.Status = 'rsSuccess' THEN 1 ELSE 0 END) AS SuccessCount,
    SUM(CASE WHEN e.Status <> 'rsSuccess' AND e.Status IS NOT NULL THEN 1 ELSE 0 END) AS ErrorCount,
    SUM(CASE WHEN e.RequestType = 'Interactive' THEN 1 ELSE 0 END) AS InteractiveCount,
    SUM(CASE WHEN e.RequestType = 'Subscription' THEN 1 ELSE 0 END) AS SubscriptionCount
FROM dbo.Catalog c
LEFT JOIN dbo.ExecutionLog3 e ON c.Path = e.ItemPath
WHERE c.Type = 2
GROUP BY c.Name, c.Path
ORDER BY c.Path;
