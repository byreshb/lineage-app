-- Object-level dependency mapping from ALL databases on SQL2 (D300SQLDW01)
-- Shows what each stored procedure/view references
-- Note: NULL values in DependsOnSchema/DependsOnName indicate unresolved references
--       (dynamic SQL, cross-database, linked servers)
-- Export to: data/all_dependencies.csv
-- Columns: Database, ObjectSchema, ObjectName, ObjectType, DependsOnSchema, DependsOnName, DependsOnType
-- Run on: D300SQLDW01

-- =============================================================================
-- DYNAMIC QUERY - Uses WHILE loop to build UNION ALL query
-- Excludes: master, tempdb, msdb, model, ReportServer, ReportServerTempDB
-- =============================================================================

SET NOCOUNT ON;

DECLARE @sql NVARCHAR(MAX) = '';
DECLARE @dbName NVARCHAR(128);
DECLARE @first BIT = 1;

DECLARE db_cursor CURSOR LOCAL FAST_FORWARD FOR
    SELECT name FROM sys.databases
    WHERE state_desc = 'ONLINE'
      AND name NOT IN ('master', 'tempdb', 'msdb', 'model', 'ReportServer', 'ReportServerTempDB')
      AND is_read_only = 0
      AND HAS_DBACCESS(name) = 1  -- Only databases user can access
    ORDER BY name;

OPEN db_cursor;
FETCH NEXT FROM db_cursor INTO @dbName;

WHILE @@FETCH_STATUS = 0
BEGIN
    IF @first = 0
        SET @sql = @sql + ' UNION ALL ';
    SET @first = 0;

    SET @sql = @sql +
        'SELECT ''' + @dbName + ''' AS [Database], ' +
        's.name COLLATE Latin1_General_CI_AS AS ObjectSchema, ' +
        'o.name COLLATE Latin1_General_CI_AS AS ObjectName, ' +
        'o.type_desc COLLATE Latin1_General_CI_AS AS ObjectType, ' +
        'dep_s.name COLLATE Latin1_General_CI_AS AS DependsOnSchema, ' +
        'dep_o.name COLLATE Latin1_General_CI_AS AS DependsOnName, ' +
        'dep_o.type_desc COLLATE Latin1_General_CI_AS AS DependsOnType ' +
        'FROM [' + @dbName + '].sys.sql_expression_dependencies d ' +
        'INNER JOIN [' + @dbName + '].sys.objects o ON d.referencing_id = o.object_id ' +
        'INNER JOIN [' + @dbName + '].sys.schemas s ON o.schema_id = s.schema_id ' +
        'LEFT JOIN [' + @dbName + '].sys.objects dep_o ON d.referenced_id = dep_o.object_id ' +
        'LEFT JOIN [' + @dbName + '].sys.schemas dep_s ON dep_o.schema_id = dep_s.schema_id';

    FETCH NEXT FROM db_cursor INTO @dbName;
END

CLOSE db_cursor;
DEALLOCATE db_cursor;

SET @sql = @sql + ' ORDER BY [Database], ObjectSchema, ObjectName';

EXEC sp_executesql @sql;
