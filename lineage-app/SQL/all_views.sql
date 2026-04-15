-- All view definitions from ALL databases on SQL2 (D300SQLDW01)
-- Export to: data/all_views.csv
-- Columns: Database, SchemaName, ViewName, ViewDefinition
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
        's.name COLLATE Latin1_General_CI_AS AS SchemaName, ' +
        'o.name COLLATE Latin1_General_CI_AS AS ViewName, ' +
        'CAST(m.definition AS NVARCHAR(MAX)) COLLATE Latin1_General_CI_AS AS ViewDefinition ' +
        'FROM [' + @dbName + '].sys.sql_modules m ' +
        'INNER JOIN [' + @dbName + '].sys.objects o ON m.object_id = o.object_id ' +
        'INNER JOIN [' + @dbName + '].sys.schemas s ON o.schema_id = s.schema_id ' +
        'WHERE o.type_desc = ''VIEW''';

    FETCH NEXT FROM db_cursor INTO @dbName;
END

CLOSE db_cursor;
DEALLOCATE db_cursor;

SET @sql = @sql + ' ORDER BY [Database], SchemaName, ViewName';

EXEC sp_executesql @sql;
