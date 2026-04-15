-- All user tables with primary key status from ALL databases on SQL2 (D300SQLDW01)
-- Export to: data/tables_with_pks.csv
-- Columns: Server, Database, Schema, Table, HasPK
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
        'SELECT ''SQL2(D300SQLDW01)'' AS [Server], ''' + @dbName + ''' AS [Database], ' +
        's.name COLLATE Latin1_General_CI_AS AS [Schema], ' +
        't.name COLLATE Latin1_General_CI_AS AS [Table], ' +
        'CASE WHEN pk.parent_object_id IS NOT NULL THEN 1 ELSE 0 END AS HasPK ' +
        'FROM [' + @dbName + '].sys.tables t ' +
        'JOIN [' + @dbName + '].sys.schemas s ON t.schema_id = s.schema_id ' +
        'LEFT JOIN [' + @dbName + '].sys.key_constraints pk ON t.object_id = pk.parent_object_id AND pk.type = ''PK'' ' +
        'WHERE t.is_ms_shipped = 0';

    FETCH NEXT FROM db_cursor INTO @dbName;
END

CLOSE db_cursor;
DEALLOCATE db_cursor;

SET @sql = @sql + ' ORDER BY [Database], [Schema], [Table]';

EXEC sp_executesql @sql;
