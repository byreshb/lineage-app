-- Object-level dependency mapping from SQL Server's internal tracking
-- Shows what each stored procedure/view references
-- Note: NULL values in DependsOnSchema/DependsOnName indicate unresolved references (dynamic SQL, cross-database, linked servers)
-- Export to: dependencies.csv

USE [SysproReporting];
SELECT s.name AS ObjectSchema, o.name AS ObjectName, o.type_desc AS ObjectType,
    dep_s.name AS DependsOnSchema, dep_o.name AS DependsOnName, dep_o.type_desc AS DependsOnType
FROM sys.sql_expression_dependencies d
INNER JOIN sys.objects o ON d.referencing_id = o.object_id
INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
LEFT JOIN sys.objects dep_o ON d.referenced_id = dep_o.object_id
LEFT JOIN sys.schemas dep_s ON dep_o.schema_id = dep_s.schema_id
ORDER BY s.name, o.name;
