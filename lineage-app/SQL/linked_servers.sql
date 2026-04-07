-- Linked server configuration on D300SQLDW01
-- Export to: linked_servers.csv

SELECT name AS LinkedServerName, data_source AS ServerAddress, provider
FROM sys.servers
WHERE is_linked = 1;
