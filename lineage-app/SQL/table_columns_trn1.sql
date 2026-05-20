USE SysproCompanyTRN1;                                                                                                                          
 SELECT                                                                                                                                          
     @@SERVERNAME as Server,                                                                                                                     
     DB_NAME() as DatabaseName,                                                                                                                  
     s.name as SchemaName,                                                                                                                       
     o.name as ObjectName,                                                                                                                       
     c.name as ColumnName,                                                                                                                       
     ty.name as DataType,                                                                                                                        
     c.max_length as MaxLength,                                                                                                                  
     c.precision as Precision,                                                                                                                   
     c.scale as Scale,                                                                                                                           
     c.is_nullable as IsNullable                                                                                                                 
 FROM sys.objects o                                                                                                                              
 JOIN sys.schemas s ON o.schema_id = s.schema_id                                                                                                 
 JOIN sys.columns c ON o.object_id = c.object_id                                                                                                 
 JOIN sys.types ty ON c.user_type_id = ty.user_type_id                                                                                           
 WHERE o.type IN ('U', 'V')                                                                                                                      
 ORDER BY s.name, o.name, c.column_id 
 