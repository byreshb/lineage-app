import React, { useState } from 'react'

function HowItWorks() {
  const [expandedSection, setExpandedSection] = useState(null)

  const toggleSection = (section) => {
    setExpandedSection(expandedSection === section ? null : section)
  }

  return (
    <div className="how-it-works">
      <h1>How Lineage Tracking Works</h1>
      <p className="intro">
        This system analyzes <strong>SSRS</strong> (SQL Server Reporting Services) and <strong>Power BI</strong> reports
        to trace data flow from <strong>Reports</strong> down to <strong>Source Tables</strong>.
        This helps understand data dependencies before migrating to Snowflake.
      </p>

      {/* Two Report Systems */}
      <section className="doc-section">
        <h2>Supported Report Systems</h2>
        <div className="two-column">
          <div className="column">
            <h3>SSRS Reports</h3>
            <ul>
              <li>Parsed from RDL (XML) files</li>
              <li>Contains datasets with SQL queries or stored procedures</li>
              <li>Template (Type 2) and Linked (Type 4) reports</li>
              <li>Automatic lineage through proc/view analysis</li>
            </ul>
          </div>
          <div className="column">
            <h3>Power BI Reports</h3>
            <ul>
              <li>Loaded from Excel mapping file</li>
              <li>Maps PBI tables to source views/tables</li>
              <li>Nested view detection (recursive)</li>
              <li>Manual mapping maintained in Excel</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Report Types */}
      <section className="doc-section">
        <h2>SSRS Report Types</h2>
        <table className="info-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Name</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Type 2</strong></td>
              <td>Template Report</td>
              <td>Contains RDL definition with actual queries - this is what we analyze for lineage</td>
            </tr>
            <tr>
              <td><strong>Type 4</strong></td>
              <td>Linked Report</td>
              <td>A shortcut/alias pointing to a Template. Has different name but uses Template's RDL. Search by Linked Report name to find the Template.</td>
            </tr>
          </tbody>
        </table>
        <p className="note">
          <strong>Example:</strong> "AP EFT Remittance Advice Review - Head Office" (Type 4 Linked Report)
          → points to → "AP EFT Remittance Advice Review (Template)" (Type 2 Template)
        </p>
      </section>

      {/* Overview Diagram */}
      <section className="doc-section">
        <h2>Overview: The Big Picture</h2>
        <div className="flow-diagram">
          <div className="flow-step">
            <div className="step-number">1</div>
            <div className="step-content">
              <h4>RDL File</h4>
              <p>SSRS report definition (XML)</p>
            </div>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">
            <div className="step-number">2</div>
            <div className="step-content">
              <h4>Datasets</h4>
              <p>Queries inside the report</p>
            </div>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">
            <div className="step-number">3</div>
            <div className="step-content">
              <h4>Stored Procs / Views</h4>
              <p>SQL code that runs</p>
            </div>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">
            <div className="step-number">4</div>
            <div className="step-content">
              <h4>Tables</h4>
              <p>Where data comes from</p>
            </div>
          </div>
        </div>
      </section>

      {/* Step by Step Process */}
      <section className="doc-section">
        <h2>Step-by-Step Process</h2>

        <div className="process-step">
          <h3>Step 1: Load RDL Reports from Database Export</h3>
          <p>RDL reports are exported from ReportServer database as <code>rdl_reports.txt</code> (tab-delimited).
             File-based RDL loading is disabled by default (can be enabled in <code>data/app-config.json</code>).</p>
        </div>

        <div className="process-step">
          <h3>Step 2: Parse the RDL (Template) File</h3>
          <p>Each RDL file is an XML document. We extract:</p>
          <ul>
            <li><strong>Report Name</strong> - from the file name</li>
            <li><strong>DataSources</strong> - database connection info</li>
            <li><strong>DataSets</strong> - the queries that fetch data</li>
          </ul>
          <div className="code-example">
            <pre>{`<DataSet Name="ApPayRun">
  <Query>
    <CommandType>StoredProcedure</CommandType>
    <CommandText>dbo.spr_ApEftRemittance</CommandText>
  </Query>
</DataSet>`}</pre>
          </div>
        </div>

        <div className="process-step">
          <h3>Step 3: Identify Dataset Type</h3>
          <p>Each dataset can be one of three types:</p>
          <table className="info-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>What It Contains</th>
                <th>How We Process It</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>StoredProcedure</code></td>
                <td>Name of a stored procedure</td>
                <td>Look up proc in metadata, parse its SQL definition</td>
              </tr>
              <tr>
                <td><code>Text</code></td>
                <td>Direct SQL query</td>
                <td>Parse the SQL directly for table names</td>
              </tr>
              <tr>
                <td><code>SharedDataSet</code></td>
                <td>Reference to a shared dataset</td>
                <td>Look up in shared_datasets table, parse its SQL</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="process-step">
          <h3>Step 4: Extract Table Names from SQL</h3>
          <p>We use two methods to find table references:</p>
          <div className="two-column">
            <div className="column">
              <h4>Method 1: SQL Parser (JSqlParser)</h4>
              <p>Parses SQL syntax to find table names accurately.</p>
              <p><em>Good for:</em> Standard SQL queries</p>
              <p><em>Limited for:</em> 4-part names, T-SQL specific syntax</p>
            </div>
            <div className="column">
              <h4>Method 2: Regex Pattern Matching</h4>
              <p>Uses patterns to find table references the parser misses.</p>
              <p><em>Good for:</em> Linked server tables (4-part names)</p>
              <p><em>Example:</em> <code>SYSPRO.Database.dbo.Table</code></p>
            </div>
          </div>
        </div>

        <div className="process-step">
          <h3>Step 5: Recursive View Analysis</h3>
          <p>If a stored procedure references a <strong>view</strong>, we also analyze the view's SQL to find its underlying tables:</p>
          <div className="flow-diagram small">
            <div className="flow-step small">
              <span>Stored Proc</span>
            </div>
            <div className="flow-arrow">→</div>
            <div className="flow-step small">
              <span>View</span>
            </div>
            <div className="flow-arrow">→</div>
            <div className="flow-step small">
              <span>Another View</span>
            </div>
            <div className="flow-arrow">→</div>
            <div className="flow-step small">
              <span>Base Table</span>
            </div>
          </div>
          <p className="note">We track visited views to prevent infinite loops when views reference each other.</p>
        </div>

        <div className="process-step">
          <h3>Step 6: Build Lineage Graph</h3>
          <p>All relationships are saved as <strong>edges</strong> in the database:</p>
          <table className="info-table">
            <thead>
              <tr>
                <th>From (Source)</th>
                <th>To (Target)</th>
                <th>Relationship</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>REPORT</td>
                <td>DATASET</td>
                <td>CONTAINS</td>
              </tr>
              <tr>
                <td>DATASET</td>
                <td>PROC</td>
                <td>CALLS</td>
              </tr>
              <tr>
                <td>DATASET</td>
                <td>SHARED_DATASET</td>
                <td>USES</td>
              </tr>
              <tr>
                <td>PROC</td>
                <td>VIEW</td>
                <td>READS_FROM</td>
              </tr>
              <tr>
                <td>PROC</td>
                <td>TABLE</td>
                <td>READS_FROM</td>
              </tr>
              <tr>
                <td>VIEW</td>
                <td>TABLE</td>
                <td>READS_FROM</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Metadata Tables */}
      <section className="doc-section">
        <h2>Metadata Tables (SQLite Database)</h2>
        <p>The system uses a local SQLite database (<code>lineage.db</code>) with these tables:</p>

        <div className="table-card" onClick={() => toggleSection('reports')}>
          <h3>
            <span className="expand-icon">{expandedSection === 'reports' ? '▼' : '▶'}</span>
            reports
          </h3>
          <p className="table-desc">Stores analyzed RDL reports</p>
          {expandedSection === 'reports' && (
            <div className="table-details">
              <table className="schema-table">
                <thead><tr><th>Column</th><th>Type</th><th>Description</th></tr></thead>
                <tbody>
                  <tr><td>id</td><td>INTEGER</td><td>Primary key</td></tr>
                  <tr><td>file_name</td><td>TEXT</td><td>RDL file name</td></tr>
                  <tr><td>report_name</td><td>TEXT</td><td>Display name</td></tr>
                  <tr><td>status</td><td>TEXT</td><td>PENDING, COMPLETED, ERROR</td></tr>
                  <tr><td>last_run_at</td><td>DATETIME</td><td>When last analyzed</td></tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="table-card" onClick={() => toggleSection('datasets')}>
          <h3>
            <span className="expand-icon">{expandedSection === 'datasets' ? '▼' : '▶'}</span>
            datasets
          </h3>
          <p className="table-desc">Queries extracted from RDL files</p>
          {expandedSection === 'datasets' && (
            <div className="table-details">
              <table className="schema-table">
                <thead><tr><th>Column</th><th>Type</th><th>Description</th></tr></thead>
                <tbody>
                  <tr><td>id</td><td>INTEGER</td><td>Primary key</td></tr>
                  <tr><td>report_id</td><td>INTEGER</td><td>FK to reports</td></tr>
                  <tr><td>dataset_name</td><td>TEXT</td><td>Name in RDL</td></tr>
                  <tr><td>command_type</td><td>TEXT</td><td>StoredProcedure, Text, SharedDataSet</td></tr>
                  <tr><td>command_text</td><td>TEXT</td><td>SQL or proc name</td></tr>
                  <tr><td>data_source_name</td><td>TEXT</td><td>Which connection to use</td></tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="table-card" onClick={() => toggleSection('stored_procedures')}>
          <h3>
            <span className="expand-icon">{expandedSection === 'stored_procedures' ? '▼' : '▶'}</span>
            stored_procedures
          </h3>
          <p className="table-desc">Loaded from sysproreporting_stored_procs.csv</p>
          {expandedSection === 'stored_procedures' && (
            <div className="table-details">
              <table className="schema-table">
                <thead><tr><th>Column</th><th>Type</th><th>Description</th></tr></thead>
                <tbody>
                  <tr><td>id</td><td>INTEGER</td><td>Primary key</td></tr>
                  <tr><td>schema_name</td><td>TEXT</td><td>Schema (usually 'ssrs')</td></tr>
                  <tr><td>proc_name</td><td>TEXT</td><td>Procedure name</td></tr>
                  <tr><td>definition</td><td>TEXT</td><td>Full SQL code</td></tr>
                </tbody>
              </table>
              <p className="usage">Used to find what tables/views a stored procedure reads from.</p>
            </div>
          )}
        </div>

        <div className="table-card" onClick={() => toggleSection('views')}>
          <h3>
            <span className="expand-icon">{expandedSection === 'views' ? '▼' : '▶'}</span>
            views
          </h3>
          <p className="table-desc">Loaded from all_views.csv</p>
          {expandedSection === 'views' && (
            <div className="table-details">
              <table className="schema-table">
                <thead><tr><th>Column</th><th>Type</th><th>Description</th></tr></thead>
                <tbody>
                  <tr><td>id</td><td>INTEGER</td><td>Primary key</td></tr>
                  <tr><td>schema_name</td><td>TEXT</td><td>Schema name</td></tr>
                  <tr><td>view_name</td><td>TEXT</td><td>View name</td></tr>
                  <tr><td>definition</td><td>TEXT</td><td>Full SQL code</td></tr>
                </tbody>
              </table>
              <p className="usage">Used to recursively trace views to their underlying tables.</p>
            </div>
          )}
        </div>

        <div className="table-card" onClick={() => toggleSection('source_tables')}>
          <h3>
            <span className="expand-icon">{expandedSection === 'source_tables' ? '▼' : '▶'}</span>
            source_tables
          </h3>
          <p className="table-desc">Loaded from tables_with_pks.csv (SysproReporting only)</p>
          {expandedSection === 'source_tables' && (
            <div className="table-details">
              <table className="schema-table">
                <thead><tr><th>Column</th><th>Type</th><th>Description</th></tr></thead>
                <tbody>
                  <tr><td>id</td><td>INTEGER</td><td>Primary key</td></tr>
                  <tr><td>database_name</td><td>TEXT</td><td>Database name</td></tr>
                  <tr><td>schema_name</td><td>TEXT</td><td>Schema name</td></tr>
                  <tr><td>table_name</td><td>TEXT</td><td>Table name</td></tr>
                  <tr><td>has_pk</td><td>TEXT</td><td>Yes/No - has primary key</td></tr>
                </tbody>
              </table>
              <p className="usage">Used to verify tables exist and show metadata in lineage.</p>
            </div>
          )}
        </div>

        <div className="table-card" onClick={() => toggleSection('shared_datasets')}>
          <h3>
            <span className="expand-icon">{expandedSection === 'shared_datasets' ? '▼' : '▶'}</span>
            shared_datasets
          </h3>
          <p className="table-desc">Loaded from shared_datasets.csv</p>
          {expandedSection === 'shared_datasets' && (
            <div className="table-details">
              <table className="schema-table">
                <thead><tr><th>Column</th><th>Type</th><th>Description</th></tr></thead>
                <tbody>
                  <tr><td>id</td><td>INTEGER</td><td>Primary key</td></tr>
                  <tr><td>dataset_name</td><td>TEXT</td><td>Dataset name</td></tr>
                  <tr><td>dataset_path</td><td>TEXT</td><td>Path in ReportServer</td></tr>
                  <tr><td>command_type</td><td>TEXT</td><td>Usually NULL or Text</td></tr>
                  <tr><td>command_text</td><td>TEXT</td><td>The actual SQL query</td></tr>
                </tbody>
              </table>
              <p className="usage">When RDL references a SharedDataSet, we look up the actual SQL here.</p>
            </div>
          )}
        </div>

        <div className="table-card" onClick={() => toggleSection('shared_data_sources')}>
          <h3>
            <span className="expand-icon">{expandedSection === 'shared_data_sources' ? '▼' : '▶'}</span>
            shared_data_sources
          </h3>
          <p className="table-desc">Loaded from shared_datasources.csv - actual connection info</p>
          {expandedSection === 'shared_data_sources' && (
            <div className="table-details">
              <table className="schema-table">
                <thead><tr><th>Column</th><th>Type</th><th>Description</th></tr></thead>
                <tbody>
                  <tr><td>id</td><td>INTEGER</td><td>Primary key</td></tr>
                  <tr><td>data_source_name</td><td>TEXT</td><td>Data source name</td></tr>
                  <tr><td>data_source_path</td><td>TEXT</td><td>Path in ReportServer (e.g., /Datasource/Sun100SQL2)</td></tr>
                  <tr><td>connection_string</td><td>TEXT</td><td>Full connection string</td></tr>
                  <tr><td>server</td><td>TEXT</td><td>Actual server name (from Initial Catalog)</td></tr>
                  <tr><td>database_name</td><td>TEXT</td><td>Actual database name</td></tr>
                </tbody>
              </table>
              <p className="usage">Maps RDL data source references to actual server/database. Used in CSV export to show where data really comes from.</p>
            </div>
          )}
        </div>

        <div className="table-card" onClick={() => toggleSection('linked_servers')}>
          <h3>
            <span className="expand-icon">{expandedSection === 'linked_servers' ? '▼' : '▶'}</span>
            linked_servers
          </h3>
          <p className="table-desc">Loaded from linked_servers.csv</p>
          {expandedSection === 'linked_servers' && (
            <div className="table-details">
              <table className="schema-table">
                <thead><tr><th>Column</th><th>Type</th><th>Description</th></tr></thead>
                <tbody>
                  <tr><td>id</td><td>INTEGER</td><td>Primary key</td></tr>
                  <tr><td>alias</td><td>TEXT</td><td>Short name (e.g., SYSPRO)</td></tr>
                  <tr><td>actual_server</td><td>TEXT</td><td>Real server name</td></tr>
                  <tr><td>provider</td><td>TEXT</td><td>SQL provider</td></tr>
                </tbody>
              </table>
              <p className="usage">Maps aliases like SYSPRO to actual server names like SUN300DSYSSQL01.</p>
            </div>
          )}
        </div>

        <div className="table-card" onClick={() => toggleSection('proc_dependencies')}>
          <h3>
            <span className="expand-icon">{expandedSection === 'proc_dependencies' ? '▼' : '▶'}</span>
            proc_dependencies
          </h3>
          <p className="table-desc">Loaded from dependencies.csv - SQL Server's dependency tracking</p>
          {expandedSection === 'proc_dependencies' && (
            <div className="table-details">
              <table className="schema-table">
                <thead><tr><th>Column</th><th>Type</th><th>Description</th></tr></thead>
                <tbody>
                  <tr><td>id</td><td>INTEGER</td><td>Primary key</td></tr>
                  <tr><td>object_schema</td><td>TEXT</td><td>Schema of the proc/view</td></tr>
                  <tr><td>object_name</td><td>TEXT</td><td>Name of the proc/view</td></tr>
                  <tr><td>object_type</td><td>TEXT</td><td>SQL_STORED_PROCEDURE, VIEW</td></tr>
                  <tr><td>depends_on_schema</td><td>TEXT</td><td>Referenced object's schema</td></tr>
                  <tr><td>depends_on_name</td><td>TEXT</td><td>Referenced object's name</td></tr>
                  <tr><td>depends_on_type</td><td>TEXT</td><td>USER_TABLE, VIEW, etc.</td></tr>
                </tbody>
              </table>
              <p className="usage">SQL Server automatically tracks what each proc/view references. We use this alongside regex parsing to find more dependencies.</p>
            </div>
          )}
        </div>

        <div className="table-card" onClick={() => toggleSection('linked_reports')}>
          <h3>
            <span className="expand-icon">{expandedSection === 'linked_reports' ? '▼' : '▶'}</span>
            linked_reports
          </h3>
          <p className="table-desc">Loaded from linked_reports.csv - Type 4 to Template mapping</p>
          {expandedSection === 'linked_reports' && (
            <div className="table-details">
              <table className="schema-table">
                <thead><tr><th>Column</th><th>Type</th><th>Description</th></tr></thead>
                <tbody>
                  <tr><td>id</td><td>INTEGER</td><td>Primary key</td></tr>
                  <tr><td>linked_report_name</td><td>TEXT</td><td>Name of the Linked Report (Type 4)</td></tr>
                  <tr><td>linked_report_path</td><td>TEXT</td><td>Full path in ReportServer</td></tr>
                  <tr><td>template_path</td><td>TEXT</td><td>Path to the Template Report (Type 2)</td></tr>
                </tbody>
              </table>
              <p className="usage">Maps Linked Reports to their Templates. Search by Linked Report name to find which Template to analyze.</p>
            </div>
          )}
        </div>

        <div className="table-card" onClick={() => toggleSection('lineage')}>
          <h3>
            <span className="expand-icon">{expandedSection === 'lineage' ? '▼' : '▶'}</span>
            lineage
          </h3>
          <p className="table-desc">The actual lineage graph edges</p>
          {expandedSection === 'lineage' && (
            <div className="table-details">
              <table className="schema-table">
                <thead><tr><th>Column</th><th>Type</th><th>Description</th></tr></thead>
                <tbody>
                  <tr><td>id</td><td>INTEGER</td><td>Primary key</td></tr>
                  <tr><td>report_id</td><td>INTEGER</td><td>Which report this belongs to</td></tr>
                  <tr><td>source_type</td><td>TEXT</td><td>REPORT, DATASET, PROC, VIEW, etc.</td></tr>
                  <tr><td>source_id</td><td>INTEGER</td><td>ID of source entity</td></tr>
                  <tr><td>source_name</td><td>TEXT</td><td>Name for display</td></tr>
                  <tr><td>target_type</td><td>TEXT</td><td>PROC, VIEW, TABLE, etc.</td></tr>
                  <tr><td>target_id</td><td>INTEGER</td><td>ID of target entity (-1 if not found)</td></tr>
                  <tr><td>target_name</td><td>TEXT</td><td>Name for display</td></tr>
                  <tr><td>relationship</td><td>TEXT</td><td>CONTAINS, CALLS, READS_FROM, USES</td></tr>
                </tbody>
              </table>
              <p className="usage">This is the main table that stores all lineage relationships. Each row is one edge in the graph.</p>
            </div>
          )}
        </div>
      </section>

      {/* Error Nodes */}
      <section className="doc-section">
        <h2>Understanding Error Nodes (Red)</h2>
        <p>When something is referenced but not found in metadata, we create an error node:</p>
        <table className="info-table">
          <thead>
            <tr>
              <th>Node Type</th>
              <th>Meaning</th>
              <th>How to Fix</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>PROC_NOT_FOUND</code></td>
              <td>Stored procedure not in sysproreporting_stored_procs.csv</td>
              <td>Re-export CSV from SQL Server</td>
            </tr>
            <tr>
              <td><code>TABLE_NOT_FOUND</code> (In SysproReporting: No)</td>
              <td>Table not found in SysproReporting database</td>
              <td>May be on linked server (expected) or in another database</td>
            </tr>
            <tr>
              <td><code>VIEW_NOT_FOUND</code></td>
              <td>View not in all_views.csv</td>
              <td>Re-export CSV from SQL Server</td>
            </tr>
            <tr>
              <td><code>SHARED_DATASET_NOT_FOUND</code></td>
              <td>Shared dataset not in shared_datasets.csv</td>
              <td>Re-export from ReportServer database</td>
            </tr>
          </tbody>
        </table>
        <p className="note">
          <strong>Note:</strong> Tables outside SysproReporting (linked servers like <code>SYSPRO.*.dbo.TableName</code>,
          or other databases like Calgary, DunnRite, etc.) will show "In SysproReporting: No" because only
          SysproReporting tables are tracked. This helps identify dependencies outside the main reporting database.
        </p>
      </section>

      {/* CSV Files Summary */}
      <section className="doc-section">
        <h2>CSV Files Summary</h2>
        <p>All metadata comes from these CSV files exported from SQL Server:</p>
        <table className="info-table">
          <thead>
            <tr>
              <th>CSV File</th>
              <th>Loads Into Table</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>sysproreporting_stored_procs.csv</code></td>
              <td>stored_procedures</td>
              <td>Proc names + SQL code to parse for tables</td>
            </tr>
            <tr>
              <td><code>all_views.csv</code></td>
              <td>views</td>
              <td>View names + SQL code for recursive analysis</td>
            </tr>
            <tr>
              <td><code>tables_with_pks.csv</code></td>
              <td>source_tables</td>
              <td>List of SysproReporting tables (filtered on load)</td>
            </tr>
            <tr>
              <td><code>shared_datasets.csv</code></td>
              <td>shared_datasets</td>
              <td>Shared dataset SQL from ReportServer</td>
            </tr>
            <tr>
              <td><code>shared_datasources.csv</code></td>
              <td>shared_data_sources</td>
              <td>Shared data source connection strings (actual server/database)</td>
            </tr>
            <tr>
              <td><code>linked_servers.csv</code></td>
              <td>linked_servers</td>
              <td>Server alias mappings</td>
            </tr>
            <tr>
              <td><code>dependencies.csv</code></td>
              <td>proc_dependencies</td>
              <td>SQL Server's own dependency tracking</td>
            </tr>
            <tr>
              <td><code>linked_reports.csv</code></td>
              <td>linked_reports</td>
              <td>Maps Linked Reports (Type 4) to Templates (Type 2)</td>
            </tr>
            <tr>
              <td><code>rdl_reports.txt</code></td>
              <td>reports</td>
              <td>RDL definitions exported from ReportServer (tab-delimited)</td>
            </tr>
            <tr>
              <td><code>report_execution_history.csv</code></td>
              <td>report_execution_history</td>
              <td>Execution stats (counts, last run date)</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Power BI Section */}
      <section className="doc-section">
        <h2>Power BI Lineage</h2>
        <p>Power BI reports are tracked differently from SSRS. Instead of parsing report files, we use a manually maintained Excel mapping file.</p>

        <div className="process-step">
          <h3>How Power BI Lineage Works</h3>
          <div className="flow-diagram">
            <div className="flow-step">
              <div className="step-number">1</div>
              <div className="step-content">
                <h4>Excel File</h4>
                <p>Data source mapping</p>
              </div>
            </div>
            <div className="flow-arrow">→</div>
            <div className="flow-step">
              <div className="step-number">2</div>
              <div className="step-content">
                <h4>PBI Tables</h4>
                <p>Tables used in report</p>
              </div>
            </div>
            <div className="flow-arrow">→</div>
            <div className="flow-step">
              <div className="step-number">3</div>
              <div className="step-content">
                <h4>Source View/Table</h4>
                <p>Database object</p>
              </div>
            </div>
            <div className="flow-arrow">→</div>
            <div className="flow-step">
              <div className="step-number">4</div>
              <div className="step-content">
                <h4>Base Tables</h4>
                <p>Underlying tables</p>
              </div>
            </div>
          </div>
        </div>

        <div className="process-step">
          <h3>Excel File Format</h3>
          <p>Power BI mappings are loaded from <code>data/FP Reporting_DataSourcesMapping.xlsx</code></p>
          <table className="info-table">
            <thead>
              <tr>
                <th>Column</th>
                <th>Excel Column</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>PBI File</td>
                <td>A</td>
                <td>Name of the Power BI report file</td>
              </tr>
              <tr>
                <td>PBI Table</td>
                <td>B</td>
                <td>Table name inside the Power BI model</td>
              </tr>
              <tr>
                <td>Source Database</td>
                <td>F</td>
                <td>Database the table comes from</td>
              </tr>
              <tr>
                <td>Unique view/table</td>
                <td>H</td>
                <td>The actual view or table name in the database</td>
              </tr>
            </tbody>
          </table>
          <p className="note">
            <strong>Note:</strong> Data starts at row 6 in the "Source Tables" sheet. Headers are in row 5.
          </p>
        </div>

        <div className="process-step">
          <h3>Nested View Detection</h3>
          <p>When a PBI table references a <strong>view</strong>, the system automatically:</p>
          <ol>
            <li>Looks up the view definition in the <code>views</code> table</li>
            <li>Parses the view's SQL to find referenced tables/views</li>
            <li>Recursively traces nested views until base tables are found</li>
          </ol>
          <div className="example-trace">
            <div className="trace-item pbi-report">
              <strong>PBI REPORT:</strong> Sales Dashboard
            </div>
            <div className="trace-arrow">↓ CONTAINS</div>
            <div className="trace-item pbi-table">
              <strong>PBI TABLE:</strong> SalesData
            </div>
            <div className="trace-arrow">↓ READS_FROM</div>
            <div className="trace-item view">
              <strong>VIEW:</strong> bi.vSalesSummary
            </div>
            <div className="trace-arrow">↓ READS_FROM</div>
            <div className="trace-item view">
              <strong>VIEW:</strong> dbo.vSalesDetail
            </div>
            <div className="trace-arrow">↓ READS_FROM</div>
            <div className="trace-item table">
              <strong>TABLE:</strong> dbo.SalesTransaction
            </div>
          </div>
        </div>

        <div className="process-step">
          <h3>Loading Power BI Data</h3>
          <ol>
            <li>Go to the <strong>"Power BI Reports"</strong> tab</li>
            <li>Click <strong>"Load Excel"</strong> button</li>
            <li>The system parses the Excel file and populates <code>pbi_reports</code> and <code>pbi_tables</code></li>
            <li>Click any report to view its lineage graph</li>
          </ol>
        </div>

        <div className="process-step">
          <h3>Power BI Database Tables</h3>
          <table className="info-table">
            <thead>
              <tr>
                <th>Table</th>
                <th>Purpose</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>pbi_reports</code></td>
                <td>Stores Power BI report names (one row per .pbix file)</td>
              </tr>
              <tr>
                <td><code>pbi_tables</code></td>
                <td>Tables within each PBI report with their source database/view mappings</td>
              </tr>
              <tr>
                <td><code>pbi_lineage</code></td>
                <td>Lineage edges for the D3 visualization graph</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="process-step">
          <h3>Power BI Node Types in Lineage Graph</h3>
          <table className="info-table">
            <thead>
              <tr>
                <th>Node Type</th>
                <th>Color</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>PBI_REPORT</td>
                <td><span style={{background: '#81D4FA', padding: '2px 8px', borderRadius: '3px'}}>Light Blue</span></td>
                <td>The Power BI report itself</td>
              </tr>
              <tr>
                <td>PBI_TABLE</td>
                <td><span style={{background: '#CE93D8', padding: '2px 8px', borderRadius: '3px'}}>Light Purple</span></td>
                <td>A table in the Power BI model</td>
              </tr>
              <tr>
                <td>VIEW</td>
                <td><span style={{background: '#9C27B0', padding: '2px 8px', borderRadius: '3px', color: 'white'}}>Purple</span></td>
                <td>Database view (source or nested)</td>
              </tr>
              <tr>
                <td>TABLE</td>
                <td><span style={{background: '#F44336', padding: '2px 8px', borderRadius: '3px', color: 'white'}}>Red</span></td>
                <td>Base table in the database</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* CSV Export Fields */}
      <section className="doc-section">
        <h2>CSV Export Fields Explained</h2>
        <p>When you export lineage to CSV, each row represents one <strong>table</strong> that a report depends on. Here's what each column means:</p>

        <table className="info-table csv-fields-table">
          <thead>
            <tr>
              <th>Column</th>
              <th>Description</th>
              <th>Example</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>ReportType</strong></td>
              <td>Type of report: SSRS or PowerBI</td>
              <td>SSRS</td>
            </tr>
            <tr>
              <td><strong>Report Name</strong></td>
              <td>Display name of the report (from RDL)</td>
              <td>AP EFT Remittance Advice Review</td>
            </tr>
            <tr>
              <td><strong>Report Path</strong></td>
              <td>Full path in ReportServer folder structure</td>
              <td>/Report/AP/AP EFT Remittance Advice Review</td>
            </tr>
            <tr>
              <td><strong>Dataset</strong></td>
              <td>Name of the dataset in the RDL that leads to this table</td>
              <td>ApPaymentsReview</td>
            </tr>
            <tr>
              <td><strong>Dataset Type</strong></td>
              <td>How the dataset gets its data</td>
              <td>StoredProcedure, Text, or SharedDataSet</td>
            </tr>
            <tr>
              <td><strong>Proc1 - Proc10</strong></td>
              <td>Chain of stored procedures called (in order). Proc1 is called directly by the dataset, Proc2 is called by Proc1, etc.</td>
              <td>ssrs.ApRemittance, dbo.GetPaymentDetails</td>
            </tr>
            <tr>
              <td><strong>View1 - View10</strong></td>
              <td>Chain of views in the lineage path (in order). These are the views the procs read from, and views that those views depend on.</td>
              <td>dbo.vwApPayRunDetails, bi.vPaymentSummary</td>
            </tr>
            <tr>
              <td><strong>Comment</strong></td>
              <td>Overflow if more than 10 procs or views in the chain</td>
              <td>Additional Procs: dbo.sp_Extra1, dbo.sp_Extra2</td>
            </tr>
            <tr>
              <td><strong>Table</strong></td>
              <td>The base table name (final destination of the lineage)</td>
              <td>ApPayRunRevision</td>
            </tr>
            <tr>
              <td><strong>Schema</strong></td>
              <td>Database schema the table belongs to</td>
              <td>dbo, stage, bi, syspro</td>
            </tr>
            <tr>
              <td><strong>In SysproReporting</strong></td>
              <td>Whether this table exists in the SysproReporting database (from tables_with_pks.csv). This is the key lineage indicator - tells you where the data actually comes from.</td>
              <td><strong>Yes</strong> = table exists in SysproReporting, <strong>No</strong> = table is external (linked server, another database)</td>
            </tr>
            <tr>
              <td><strong>SysproReporting Has PK</strong></td>
              <td>Whether the table has a primary key (only if In SysproReporting = Yes)</td>
              <td>Yes, No, or - (unknown)</td>
            </tr>
          </tbody>
        </table>

        <h3>Understanding the Proc/View Chains</h3>
        <p>The Proc1-10 and View1-10 columns show the <strong>execution path</strong> from the dataset to the table:</p>
        <div className="chain-example">
          <div className="chain-flow">
            <span className="chain-item dataset">Dataset</span>
            <span className="chain-arrow">→</span>
            <span className="chain-item proc">Proc1</span>
            <span className="chain-arrow">→</span>
            <span className="chain-item proc">Proc2</span>
            <span className="chain-arrow">→</span>
            <span className="chain-item view">View1</span>
            <span className="chain-arrow">→</span>
            <span className="chain-item view">View2</span>
            <span className="chain-arrow">→</span>
            <span className="chain-item table">Table</span>
          </div>
          <p className="note">Each proc/view in the chain calls or reads from the next one in the sequence.</p>
        </div>

        <h3>Status Values Explained</h3>
        <table className="info-table">
          <thead>
            <tr>
              <th>In SysproReporting</th>
              <th>Meaning</th>
              <th>Table Column Shows</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Yes</strong></td>
              <td>Table exists in SysproReporting database - this is LOCAL data</td>
              <td>Just the table name (e.g., <code>ApPayRunRevision</code>)</td>
            </tr>
            <tr>
              <td><strong>No</strong></td>
              <td>Table is EXTERNAL - data comes from outside SysproReporting</td>
              <td>Full source path showing exactly where data comes from</td>
            </tr>
            <tr>
              <td><strong>NO TABLES</strong></td>
              <td>Dataset doesn't read from any tables (e.g., parameter queries)</td>
              <td>"No table references found"</td>
            </tr>
          </tbody>
        </table>

        <h3>External Table Source Paths</h3>
        <p>When <strong>In SysproReporting = No</strong>, the Table column shows the full source path:</p>
        <table className="info-table">
          <thead>
            <tr>
              <th>Source Type</th>
              <th>Table Column Format</th>
              <th>Example</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Linked Server</strong></td>
              <td><code>{'[alias->actual_server].database.schema.table'}</code></td>
              <td><code>{'[SYSPRO->SUN300DSYSSQL01].SysproCompanyS.dbo.Customers'}</code></td>
            </tr>
            <tr>
              <td><strong>Cross-Database</strong></td>
              <td><code>database.schema.table</code></td>
              <td><code>Calgary.dbo.InvoiceDetail</code></td>
            </tr>
            <tr>
              <td><strong>Dynamic SQL</strong></td>
              <td><code>@DYNAMIC.schema.table</code></td>
              <td><code>@DYNAMIC.dbo.Customer</code></td>
            </tr>
            <tr>
              <td><strong>Not Found</strong></td>
              <td><code>schema.table</code></td>
              <td><code>dbo.OldTable</code></td>
            </tr>
          </tbody>
        </table>
        <p className="note">
          <strong>Key Insight:</strong> The "Table" column is the lineage endpoint - it tells you exactly WHERE the data comes from.
          When external, you can see the full path including server, database, and schema.
        </p>

        <h3>Power BI CSV Differences</h3>
        <p>When exporting Power BI reports, the columns have slightly different meanings:</p>
        <table className="info-table">
          <thead>
            <tr>
              <th>Column</th>
              <th>Power BI Meaning</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>ReportType</strong></td>
              <td>Always "PowerBI"</td>
            </tr>
            <tr>
              <td><strong>Report Name</strong></td>
              <td>Power BI file name (from Excel)</td>
            </tr>
            <tr>
              <td><strong>Report Path</strong></td>
              <td>Empty (PBI files don't have server paths)</td>
            </tr>
            <tr>
              <td><strong>Dataset</strong></td>
              <td>The PBI table name (from Excel column B)</td>
            </tr>
            <tr>
              <td><strong>Dataset Type</strong></td>
              <td>Always "PowerBI"</td>
            </tr>
            <tr>
              <td><strong>Proc1-Proc10</strong></td>
              <td>Empty (PBI doesn't use stored procedures)</td>
            </tr>
            <tr>
              <td><strong>View1-View10</strong></td>
              <td>Chain of views from the source view to base tables</td>
            </tr>
          </tbody>
        </table>

        <h3>Example SSRS CSV Row</h3>
        <div className="code-example">
          <pre>{`ReportType,Report Name,Report Path,Dataset,Dataset Type,Proc1,Proc2,...,View1,...,Table,Schema,In SysproReporting,SysproReporting Has PK
SSRS,AP EFT Remittance,/Report/AP/AP EFT Remittance,ApPayRun,StoredProcedure,ssrs.ApRemittance,,,,dbo.vwPayRun,,,ApPayRunRevision,dbo,Yes,Yes`}</pre>
        </div>
        <p className="note">This row tells us: The "AP EFT Remittance" report has a dataset "ApPayRun" that calls stored procedure "ssrs.ApRemittance", which reads from view "dbo.vwPayRun", which ultimately reads from table "dbo.ApPayRunRevision" which exists in SysproReporting (In SysproReporting = Yes) and has a primary key.</p>

        <h3>Example Power BI CSV Row</h3>
        <div className="code-example">
          <pre>{`ReportType,Report Name,Report Path,Dataset,Dataset Type,Proc1,...,View1,View2,...,Table,Schema,In SysproReporting,SysproReporting Has PK
PowerBI,Sales Dashboard,,SalesData,PowerBI,,,bi.vSalesSummary,dbo.vSalesDetail,,,SalesTransaction,dbo,Yes,Yes`}</pre>
        </div>
        <p className="note">This row tells us: The "Sales Dashboard" Power BI report has a table "SalesData" that reads from view "bi.vSalesSummary", which reads from "dbo.vSalesDetail", which ultimately reads from table "dbo.SalesTransaction" (in SysproReporting).</p>
      </section>

      {/* Starring Feature */}
      <section className="doc-section">
        <h2>Starring Reports</h2>
        <p>You can <strong>star (★)</strong> reports to create a subset for export:</p>
        <ul>
          <li>Click the <strong>☆</strong> icon next to any report name to star it (turns gold ★)</li>
          <li>Works for both <strong>Template</strong> and <strong>Linked</strong> reports</li>
          <li>Stars are saved in the database - they persist across sessions</li>
          <li>Use <strong>"Export CSV" → "Export Starred CSV"</strong> to export only starred reports</li>
          <li>Use <strong>"Export Starred HTML"</strong> for an interactive HTML with only starred reports</li>
        </ul>
        <p className="note">
          <strong>Tip:</strong> Star the reports you need to migrate first, then export just those for focused analysis.
        </p>
      </section>

      {/* Custom Field Finder (CFF) */}
      <section className="doc-section">
        <h2>Custom Field Finder (CFF)</h2>
        <p>The CFF feature identifies columns from <strong>custom tables</strong> (tables ending with <code>+</code>) used across all starred reports.</p>

        <div className="process-step">
          <h3>What are Custom Tables?</h3>
          <p>Custom tables are user-defined extensions to standard Syspro tables. They end with a <code>+</code> suffix:</p>
          <ul>
            <li><code>ArCustomer+</code> - Custom fields added to customer records</li>
            <li><code>InvMaster+</code> - Custom inventory fields</li>
            <li><code>WipMaster+</code> - Custom work-in-progress fields</li>
          </ul>
        </div>

        <div className="process-step">
          <h3>How CFF Works</h3>
          <div className="flow-diagram">
            <div className="flow-step">
              <div className="step-number">1</div>
              <div className="step-content">
                <h4>Find Custom Tables</h4>
                <p>Scan lineage for tables ending with +</p>
              </div>
            </div>
            <div className="flow-arrow">→</div>
            <div className="flow-step">
              <div className="step-number">2</div>
              <div className="step-content">
                <h4>Trace Back</h4>
                <p>Find all VIEWs/PROCs that use them</p>
              </div>
            </div>
            <div className="flow-arrow">→</div>
            <div className="flow-step">
              <div className="step-number">3</div>
              <div className="step-content">
                <h4>Extract Columns</h4>
                <p>Parse SQL to find column names</p>
              </div>
            </div>
            <div className="flow-arrow">→</div>
            <div className="flow-step">
              <div className="step-number">4</div>
              <div className="step-content">
                <h4>Check Metadata</h4>
                <p>Verify in SQL2 and TRN1</p>
              </div>
            </div>
          </div>
        </div>

        <div className="process-step">
          <h3>CFF Export Columns</h3>
          <table className="info-table">
            <thead>
              <tr>
                <th>Column</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>ReportType</strong></td>
                <td>SSRS or PowerBI</td>
              </tr>
              <tr>
                <td><strong>ReportName</strong></td>
                <td>Name of the report using this custom field</td>
              </tr>
              <tr>
                <td><strong>EntityType</strong></td>
                <td>VIEW, PROC, or DATASET - where the column is used</td>
              </tr>
              <tr>
                <td><strong>EntityName</strong></td>
                <td>Name of the view/proc containing the column</td>
              </tr>
              <tr>
                <td><strong>CustomTableName</strong></td>
                <td>The custom table (e.g., ArCustomer+)</td>
              </tr>
              <tr>
                <td><strong>ColumnName</strong></td>
                <td>Column being used from the custom table</td>
              </tr>
              <tr>
                <td><strong>ExtractionStatus</strong></td>
                <td>OK, DYNAMIC_SQL, PARSE_ERROR, or UNKNOWN</td>
              </tr>
              <tr>
                <td><strong>InSQL2 / InNewSyspro</strong></td>
                <td>Whether column exists in each system</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="process-step">
          <h3>Using CFF Export</h3>
          <ol>
            <li>Star the reports you want to analyze</li>
            <li>Go to <strong>Export → Custom Fields (CFF)</strong></li>
            <li>CSV shows all custom columns used by starred reports</li>
          </ol>
          <p className="note">
            <strong>Use Case:</strong> Before migrating to new Syspro, use CFF to identify which custom fields your reports depend on,
            and whether those fields exist in the new system.
          </p>
        </div>
      </section>

      {/* Example */}
      <section className="doc-section">
        <h2>Example: Complete Lineage Trace</h2>
        <div className="example-trace">
          <div className="trace-item report">
            <strong>REPORT:</strong> AP EFT Remittance Advice Review
          </div>
          <div className="trace-arrow">↓ CONTAINS</div>
          <div className="trace-item dataset">
            <strong>DATASET:</strong> ApPaymentsReview (StoredProcedure)
          </div>
          <div className="trace-arrow">↓ CALLS</div>
          <div className="trace-item proc">
            <strong>PROC:</strong> ssrs.ApRemittanceAdvice_PaymentNumbers
          </div>
          <div className="trace-arrow">↓ READS_FROM</div>
          <div className="trace-item view">
            <strong>VIEW:</strong> dbo.vwApPayRunDetails
          </div>
          <div className="trace-arrow">↓ READS_FROM</div>
          <div className="trace-item table">
            <strong>TABLE:</strong> dbo.ApPayRunRevision
          </div>
          <div className="trace-arrow-branch">↓ also READS_FROM</div>
          <div className="trace-item table external">
            <strong>TABLE:</strong> SYSPRO.SysproCustomizations.dbo.ApPayRunStatus
            <span className="tag">Linked Server</span>
          </div>
        </div>
      </section>

    </div>
  )
}

export default HowItWorks
