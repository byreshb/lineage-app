-- All user tables with primary key status
-- Export to: data/tables_with_pks.csv
-- Columns: Server, Database, Schema, Table, HasPK

-- =============================================================================
-- STATIC QUERY (Recommended) - Specific databases for lineage tracking
-- =============================================================================

SELECT
    @@SERVERNAME AS [Server],
    'SysproReporting' COLLATE Latin1_General_CI_AS AS [Database],
    s.name COLLATE Latin1_General_CI_AS AS [Schema],
    t.name COLLATE Latin1_General_CI_AS AS [Table],
    CASE WHEN pk.parent_object_id IS NOT NULL THEN 1 ELSE 0 END AS HasPK
FROM SysproReporting.sys.tables t
JOIN SysproReporting.sys.schemas s ON t.schema_id = s.schema_id
LEFT JOIN SysproReporting.sys.key_constraints pk ON t.object_id = pk.parent_object_id AND pk.type = 'PK'
WHERE t.is_ms_shipped = 0

UNION ALL

SELECT @@SERVERNAME, 'DunnRite', s.name COLLATE Latin1_General_CI_AS, t.name COLLATE Latin1_General_CI_AS,
    CASE WHEN pk.parent_object_id IS NOT NULL THEN 1 ELSE 0 END
FROM DunnRite.sys.tables t
JOIN DunnRite.sys.schemas s ON t.schema_id = s.schema_id
LEFT JOIN DunnRite.sys.key_constraints pk ON t.object_id = pk.parent_object_id AND pk.type = 'PK'
WHERE t.is_ms_shipped = 0

UNION ALL

SELECT @@SERVERNAME, 'Q', s.name COLLATE Latin1_General_CI_AS, t.name COLLATE Latin1_General_CI_AS,
    CASE WHEN pk.parent_object_id IS NOT NULL THEN 1 ELSE 0 END
FROM Q.sys.tables t
JOIN Q.sys.schemas s ON t.schema_id = s.schema_id
LEFT JOIN Q.sys.key_constraints pk ON t.object_id = pk.parent_object_id AND pk.type = 'PK'
WHERE t.is_ms_shipped = 0

UNION ALL

SELECT @@SERVERNAME, 'SRUtil', s.name COLLATE Latin1_General_CI_AS, t.name COLLATE Latin1_General_CI_AS,
    CASE WHEN pk.parent_object_id IS NOT NULL THEN 1 ELSE 0 END
FROM SRUtil.sys.tables t
JOIN SRUtil.sys.schemas s ON t.schema_id = s.schema_id
LEFT JOIN SRUtil.sys.key_constraints pk ON t.object_id = pk.parent_object_id AND pk.type = 'PK'
WHERE t.is_ms_shipped = 0

UNION ALL

SELECT @@SERVERNAME, 'Sunwest', s.name COLLATE Latin1_General_CI_AS, t.name COLLATE Latin1_General_CI_AS,
    CASE WHEN pk.parent_object_id IS NOT NULL THEN 1 ELSE 0 END
FROM Sunwest.sys.tables t
JOIN Sunwest.sys.schemas s ON t.schema_id = s.schema_id
LEFT JOIN Sunwest.sys.key_constraints pk ON t.object_id = pk.parent_object_id AND pk.type = 'PK'
WHERE t.is_ms_shipped = 0

UNION ALL

SELECT @@SERVERNAME, 'Calgary', s.name COLLATE Latin1_General_CI_AS, t.name COLLATE Latin1_General_CI_AS,
    CASE WHEN pk.parent_object_id IS NOT NULL THEN 1 ELSE 0 END
FROM Calgary.sys.tables t
JOIN Calgary.sys.schemas s ON t.schema_id = s.schema_id
LEFT JOIN Calgary.sys.key_constraints pk ON t.object_id = pk.parent_object_id AND pk.type = 'PK'
WHERE t.is_ms_shipped = 0

UNION ALL

SELECT @@SERVERNAME, 'Lethbridge', s.name COLLATE Latin1_General_CI_AS, t.name COLLATE Latin1_General_CI_AS,
    CASE WHEN pk.parent_object_id IS NOT NULL THEN 1 ELSE 0 END
FROM Lethbridge.sys.tables t
JOIN Lethbridge.sys.schemas s ON t.schema_id = s.schema_id
LEFT JOIN Lethbridge.sys.key_constraints pk ON t.object_id = pk.parent_object_id AND pk.type = 'PK'
WHERE t.is_ms_shipped = 0

UNION ALL

SELECT @@SERVERNAME, 'Surrey', s.name COLLATE Latin1_General_CI_AS, t.name COLLATE Latin1_General_CI_AS,
    CASE WHEN pk.parent_object_id IS NOT NULL THEN 1 ELSE 0 END
FROM Surrey.sys.tables t
JOIN Surrey.sys.schemas s ON t.schema_id = s.schema_id
LEFT JOIN Surrey.sys.key_constraints pk ON t.object_id = pk.parent_object_id AND pk.type = 'PK'
WHERE t.is_ms_shipped = 0

UNION ALL

SELECT @@SERVERNAME, 'JnL', s.name COLLATE Latin1_General_CI_AS, t.name COLLATE Latin1_General_CI_AS,
    CASE WHEN pk.parent_object_id IS NOT NULL THEN 1 ELSE 0 END
FROM JnL.sys.tables t
JOIN JnL.sys.schemas s ON t.schema_id = s.schema_id
LEFT JOIN JnL.sys.key_constraints pk ON t.object_id = pk.parent_object_id AND pk.type = 'PK'
WHERE t.is_ms_shipped = 0

ORDER BY [Database], [Schema], [Table];
