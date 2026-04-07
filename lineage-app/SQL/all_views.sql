-- All view definitions across databases
-- Export to: data/all_views.csv
-- Columns: Database, SchemaName, ViewName, ViewDefinition

-- =============================================================================
-- STATIC QUERY - Specific databases for lineage tracking
-- =============================================================================

SELECT
    'SysproReporting' COLLATE Latin1_General_CI_AS AS [Database],
    s.name COLLATE Latin1_General_CI_AS AS SchemaName,
    o.name COLLATE Latin1_General_CI_AS AS ViewName,
    CAST(m.definition AS NVARCHAR(MAX)) COLLATE Latin1_General_CI_AS AS ViewDefinition
FROM SysproReporting.sys.sql_modules m
INNER JOIN SysproReporting.sys.objects o ON m.object_id = o.object_id
INNER JOIN SysproReporting.sys.schemas s ON o.schema_id = s.schema_id
WHERE o.type_desc = 'VIEW'

UNION ALL

SELECT
    'DunnRite' COLLATE Latin1_General_CI_AS,
    s.name COLLATE Latin1_General_CI_AS,
    o.name COLLATE Latin1_General_CI_AS,
    CAST(m.definition AS NVARCHAR(MAX)) COLLATE Latin1_General_CI_AS
FROM DunnRite.sys.sql_modules m
INNER JOIN DunnRite.sys.objects o ON m.object_id = o.object_id
INNER JOIN DunnRite.sys.schemas s ON o.schema_id = s.schema_id
WHERE o.type_desc = 'VIEW'

UNION ALL

SELECT
    'Q' COLLATE Latin1_General_CI_AS,
    s.name COLLATE Latin1_General_CI_AS,
    o.name COLLATE Latin1_General_CI_AS,
    CAST(m.definition AS NVARCHAR(MAX)) COLLATE Latin1_General_CI_AS
FROM Q.sys.sql_modules m
INNER JOIN Q.sys.objects o ON m.object_id = o.object_id
INNER JOIN Q.sys.schemas s ON o.schema_id = s.schema_id
WHERE o.type_desc = 'VIEW'

UNION ALL

SELECT
    'SRUtil' COLLATE Latin1_General_CI_AS,
    s.name COLLATE Latin1_General_CI_AS,
    o.name COLLATE Latin1_General_CI_AS,
    CAST(m.definition AS NVARCHAR(MAX)) COLLATE Latin1_General_CI_AS
FROM SRUtil.sys.sql_modules m
INNER JOIN SRUtil.sys.objects o ON m.object_id = o.object_id
INNER JOIN SRUtil.sys.schemas s ON o.schema_id = s.schema_id
WHERE o.type_desc = 'VIEW'

UNION ALL

SELECT
    'Sunwest' COLLATE Latin1_General_CI_AS,
    s.name COLLATE Latin1_General_CI_AS,
    o.name COLLATE Latin1_General_CI_AS,
    CAST(m.definition AS NVARCHAR(MAX)) COLLATE Latin1_General_CI_AS
FROM Sunwest.sys.sql_modules m
INNER JOIN Sunwest.sys.objects o ON m.object_id = o.object_id
INNER JOIN Sunwest.sys.schemas s ON o.schema_id = s.schema_id
WHERE o.type_desc = 'VIEW'

UNION ALL

SELECT
    'Calgary' COLLATE Latin1_General_CI_AS,
    s.name COLLATE Latin1_General_CI_AS,
    o.name COLLATE Latin1_General_CI_AS,
    CAST(m.definition AS NVARCHAR(MAX)) COLLATE Latin1_General_CI_AS
FROM Calgary.sys.sql_modules m
INNER JOIN Calgary.sys.objects o ON m.object_id = o.object_id
INNER JOIN Calgary.sys.schemas s ON o.schema_id = s.schema_id
WHERE o.type_desc = 'VIEW'

UNION ALL

SELECT
    'Lethbridge' COLLATE Latin1_General_CI_AS,
    s.name COLLATE Latin1_General_CI_AS,
    o.name COLLATE Latin1_General_CI_AS,
    CAST(m.definition AS NVARCHAR(MAX)) COLLATE Latin1_General_CI_AS
FROM Lethbridge.sys.sql_modules m
INNER JOIN Lethbridge.sys.objects o ON m.object_id = o.object_id
INNER JOIN Lethbridge.sys.schemas s ON o.schema_id = s.schema_id
WHERE o.type_desc = 'VIEW'

UNION ALL

SELECT
    'Surrey' COLLATE Latin1_General_CI_AS,
    s.name COLLATE Latin1_General_CI_AS,
    o.name COLLATE Latin1_General_CI_AS,
    CAST(m.definition AS NVARCHAR(MAX)) COLLATE Latin1_General_CI_AS
FROM Surrey.sys.sql_modules m
INNER JOIN Surrey.sys.objects o ON m.object_id = o.object_id
INNER JOIN Surrey.sys.schemas s ON o.schema_id = s.schema_id
WHERE o.type_desc = 'VIEW'

UNION ALL

SELECT
    'JnL' COLLATE Latin1_General_CI_AS,
    s.name COLLATE Latin1_General_CI_AS,
    o.name COLLATE Latin1_General_CI_AS,
    CAST(m.definition AS NVARCHAR(MAX)) COLLATE Latin1_General_CI_AS
FROM JnL.sys.sql_modules m
INNER JOIN JnL.sys.objects o ON m.object_id = o.object_id
INNER JOIN JnL.sys.schemas s ON o.schema_id = s.schema_id
WHERE o.type_desc = 'VIEW'

ORDER BY [Database], SchemaName, ViewName;
