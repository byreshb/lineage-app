-- Table columns from SysproReporting database on SQL2 (D300SQLDW01)                                                                            
 -- Export to: data/table_columns_sql2.csv                                                                                                       
 -- Run on: D300SQLDW01                                                                                                                          
                                                                                                                                                 
 USE SysproReporting;                                                                                                                            
                                                                                                                                                 
 SELECT                                                                                                                                          
     'SysproReporting' AS [Database],                                                                                                            
     s.name AS [Schema],                                                                                                                         
     t.name AS [Table],                                                                                                                          
     c.name AS [Column],                                                                                                                         
     ty.name AS [DataType],                                                                                                                      
     c.max_length AS [MaxLength],                                                                                                                
     c.precision AS [Precision],                                                                                                                 
     c.scale AS [Scale],                                                                                                                         
     c.is_nullable AS [IsNullable],                                                                                                              
     CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END AS [IsPrimaryKey]                                                                      
 FROM sys.tables t                                                                                                                               
 JOIN sys.schemas s ON t.schema_id = s.schema_id                                                                                                 
 JOIN sys.columns c ON t.object_id = c.object_id                                                                                                 
 JOIN sys.types ty ON c.user_type_id = ty.user_type_id                                                                                           
 LEFT JOIN (                                                                                                                                     
     SELECT ic.object_id, ic.column_id                                                                                                           
     FROM sys.index_columns ic                                                                                                                   
     JOIN sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id                                                               
     WHERE i.is_primary_key = 1                                                                                                                  
 ) pk ON c.object_id = pk.object_id AND c.column_id = pk.column_id                                                                               
 WHERE t.is_ms_shipped = 0                                                                                                                       
 ORDER BY s.name, t.name, c.column_id
 