-- New Syspro Schema Export
-- Run this on the new Syspro server (TRN1) to export all tables and views
-- Output: new_syspro_schema.csv
--
-- Database: SysproCompanyTRN1 (or whichever Syspro database you need)
--
-- Export Instructions:
-- 1. In SSMS: Tools -> Options -> Query Results -> SQL Server -> Results to Text
-- 2. Set "Output format" to "Tab Delimited"
-- 3. Press Ctrl+Shift+F (Results to File) before running
-- 4. Save as: data/new_syspro_schema.csv
--
-- Or use SQLCMD:
-- sqlcmd -S YOUR_SERVER -d SysproCompanyTRN1 -i new_syspro_schema.sql -s"," -W -o "new_syspro_schema.csv"

USE SysproCompanyTRN1;

SELECT
    @@SERVERNAME AS ServerName,
    DB_NAME() AS DatabaseName,
    s.name AS SchemaName,
    o.name AS ObjectName,
    o.type_desc AS ObjectType
FROM sys.objects o
INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
WHERE o.type IN ('U', 'V')  -- U = User Table, V = View
  AND s.name NOT IN ('sys', 'INFORMATION_SCHEMA')
ORDER BY s.name, o.name;
