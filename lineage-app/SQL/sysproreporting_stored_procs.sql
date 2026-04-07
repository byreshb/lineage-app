-- All stored procedures in SysproReporting database (all schemas)
-- Export to: sysproreporting_stored_procs.csv

USE [SysproReporting];
SELECT s.name AS SchemaName, o.name AS ProcName, m.definition AS ProcDefinition
FROM sys.sql_modules m
INNER JOIN sys.objects o ON m.object_id = o.object_id
INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
WHERE o.type = 'P'
ORDER BY s.name, o.name;
