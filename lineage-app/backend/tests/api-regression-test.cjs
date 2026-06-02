#!/usr/bin/env node
/**
 * API Regression Test Suite
 *
 * Run this after any code changes to verify all exports work correctly.
 *
 * Usage:
 *   node tests/api-regression-test.js
 *   npm run test:api
 *
 * Prerequisites:
 *   - Backend must be running on localhost:8080
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:8080';
const TEST_DIR = '/tmp/lineage_api_tests';

// Test results tracking
let passed = 0;
let failed = 0;
const failures = [];

// Utility functions
function log(msg) {
  console.log(msg);
}

function pass(name) {
  passed++;
  log(`  ✓ ${name}`);
}

function fail(name, reason) {
  failed++;
  failures.push({ name, reason });
  log(`  ✗ ${name}`);
  log(`    Reason: ${reason}`);
}

function fetch(urlPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    }).on('error', reject);
  });
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    if (char === '"') {
      if (inQuotes && nextChar === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsv(content) {
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length === 0) return { header: [], rows: [] };
  const header = parseCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row = {};
    header.forEach((h, idx) => row[h] = values[idx] || '');
    rows.push(row);
  }
  return { header, rows };
}

// Test functions
async function testHealthCheck() {
  log('\n1. HEALTH CHECK');
  log('---------------');
  try {
    const res = await fetch('/api/health');
    if (res.status === 200 && res.body.includes('ok')) {
      pass('Backend is running');
      return true;
    } else {
      fail('Backend health check', `Status: ${res.status}`);
      return false;
    }
  } catch (e) {
    fail('Backend health check', `Connection failed: ${e.message}`);
    return false;
  }
}

async function testStarredExports() {
  log('\n2. STARRED EXPORT ENDPOINTS');
  log('---------------------------');

  const endpoints = [
    { path: '/api/reports/starred/export-csv', name: 'starred/export-csv' },
    { path: '/api/reports/starred/export-all-csv', name: 'starred/export-all-csv' },
    { path: '/api/reports/starred/custom-tables/export', name: 'custom-tables' },
    { path: '/api/reports/starred/report-table-mapping/export', name: 'table-mapping' },
    { path: '/api/reports/starred/unique-table-columns/export', name: 'unique-columns' },
  ];

  const results = {};

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.path);
      if (res.status === 200) {
        const lines = res.body.split('\n').filter(l => l.trim()).length;
        pass(`${ep.name} (HTTP 200, ${lines} lines)`);
        results[ep.name] = { status: 200, content: res.body, lines };
      } else {
        fail(ep.name, `HTTP ${res.status}`);
        results[ep.name] = { status: res.status };
      }
    } catch (e) {
      fail(ep.name, e.message);
      results[ep.name] = { error: e.message };
    }
  }

  return results;
}

async function testUnifiedExports() {
  log('\n3. UNIFIED EXPORT ENDPOINTS');
  log('---------------------------');

  const scopes = ['ssrs', 'pbi', 'both'];
  const results = {};

  for (const scope of scopes) {
    try {
      const res = await fetch(`/api/reports/unified-export?scope=${scope}`);
      if (res.status === 200) {
        const lines = res.body.split('\n').filter(l => l.trim()).length;
        pass(`unified-export?scope=${scope} (${lines} lines)`);
        results[scope] = { lines };
      } else {
        fail(`unified-export?scope=${scope}`, `HTTP ${res.status}`);
      }
    } catch (e) {
      fail(`unified-export?scope=${scope}`, e.message);
    }
  }

  // Verify SSRS + PBI = Both
  if (results.ssrs && results.pbi && results.both) {
    const expectedBoth = results.ssrs.lines + results.pbi.lines - 1; // -1 for header
    if (Math.abs(results.both.lines - expectedBoth) <= 1) {
      pass('SSRS + PBI = Both (consistency check)');
    } else {
      fail('SSRS + PBI = Both', `Expected ~${expectedBoth}, got ${results.both.lines}`);
    }
  }

  return results;
}

async function testPbiExports() {
  log('\n4. POWER BI ENDPOINTS');
  log('---------------------');

  try {
    // PBI reports list
    const reportsRes = await fetch('/api/pbi/reports');
    if (reportsRes.status === 200) {
      const reports = JSON.parse(reportsRes.body);
      pass(`PBI reports list (${reports.length} reports)`);

      const starred = reports.filter(r => r.starred).length;
      if (starred === 8) {
        pass(`PBI starred count = 8`);
      } else {
        fail(`PBI starred count`, `Expected 8, got ${starred}`);
      }
    } else {
      fail('PBI reports list', `HTTP ${reportsRes.status}`);
    }

    // PBI export all
    const exportRes = await fetch('/api/pbi/export-all');
    if (exportRes.status === 200) {
      const lines = exportRes.body.split('\n').filter(l => l.trim()).length;
      pass(`PBI export-all (${lines} lines)`);
    } else {
      fail('PBI export-all', `HTTP ${exportRes.status}`);
    }
  } catch (e) {
    fail('PBI endpoints', e.message);
  }
}

async function testDataConsistency(starredResults) {
  log('\n5. DATA CONSISTENCY VALIDATION');
  log('------------------------------');

  // Parse starred lineage CSV
  const lineageCsv = starredResults['starred/export-csv']?.content;
  const mappingCsv = starredResults['table-mapping']?.content;
  const columnsCsv = starredResults['unique-columns']?.content;

  if (!lineageCsv || !mappingCsv || !columnsCsv) {
    fail('Data consistency', 'Missing export data');
    return;
  }

  const lineage = parseCsv(lineageCsv);
  const mapping = parseCsv(mappingCsv);
  const columns = parseCsv(columnsCsv);

  // Count unique reports in lineage
  const lineageReports = new Set(lineage.rows.map(r => r['Report Name']));
  if (lineageReports.size === 27) {
    pass(`Lineage reports = 27`);
  } else {
    fail(`Lineage reports`, `Expected 27, got ${lineageReports.size}`);
  }

  // Count unique reports in mapping
  const mappingReports = new Set(mapping.rows.map(r => r['ReportName']));
  if (mappingReports.size === 27) {
    pass(`Mapping reports = 27`);
  } else {
    fail(`Mapping reports`, `Expected 27, got ${mappingReports.size}`);
  }

  // Count SSRS vs PBI in lineage
  const ssrsReports = new Set(lineage.rows.filter(r => r['ReportType'] === 'SSRS').map(r => r['Report Name']));
  const pbiReports = new Set(lineage.rows.filter(r => r['ReportType'] === 'PowerBI').map(r => r['Report Name']));

  if (ssrsReports.size === 19) {
    pass(`SSRS reports = 19 (5 templates + 14 linked)`);
  } else {
    fail(`SSRS reports`, `Expected 19, got ${ssrsReports.size}`);
  }

  if (pbiReports.size === 8) {
    pass(`PowerBI reports = 8`);
  } else {
    fail(`PowerBI reports`, `Expected 8, got ${pbiReports.size}`);
  }

  // Count unique tables (Status=Yes) in lineage
  const lineageTables = new Set();
  lineage.rows.forEach(r => {
    if (r['In SQL2(D300SQLDW01)'] === 'Yes' && r['Table'] && !r['Table'].includes('No ')) {
      lineageTables.add(`${r['Schema']}.${r['Table']}`.toLowerCase());
    }
  });

  if (lineageTables.size === 100) {
    pass(`Lineage tables = 100`);
  } else {
    fail(`Lineage tables`, `Expected 100, got ${lineageTables.size}`);
  }

  // Count unique tables in mapping
  const mappingTables = new Set(mapping.rows.map(r => `${r['TableSchema']}.${r['TableName']}`.toLowerCase()));
  if (mappingTables.size === 100) {
    pass(`Mapping tables = 100`);
  } else {
    fail(`Mapping tables`, `Expected 100, got ${mappingTables.size}`);
  }

  // Verify all mapping tables are in lineage
  const missingInLineage = [...mappingTables].filter(t => !lineageTables.has(t));
  if (missingInLineage.length === 0) {
    pass(`All mapping tables in lineage`);
  } else {
    fail(`Tables consistency`, `${missingInLineage.length} tables missing in lineage: ${missingInLineage.slice(0, 3).join(', ')}`);
  }

  // Count unique tables in columns
  const columnTables = new Set();
  columns.rows.forEach(r => {
    if (r['TableName'] && !r['TableName'].includes('no columns')) {
      columnTables.add(`${r['Schema_In_Report']}.${r['TableName']}`.toLowerCase());
    }
  });

  if (columnTables.size === 100) {
    pass(`Columns tables = 100`);
  } else {
    fail(`Columns tables`, `Expected 100, got ${columnTables.size}`);
  }

  // Verify mapping tables are in columns
  const missingInColumns = [...mappingTables].filter(t => !columnTables.has(t));
  if (missingInColumns.length === 0) {
    pass(`All mapping tables in columns`);
  } else {
    fail(`Columns consistency`, `${missingInColumns.length} tables missing`);
  }
}

async function testOtherEndpoints() {
  log('\n6. OTHER CRITICAL ENDPOINTS');
  log('---------------------------');

  const endpoints = [
    { path: '/api/reports', name: 'Reports list' },
    { path: '/api/reports/export-all', name: 'Export all reports' },
    { path: '/api/metadata/status', name: 'Metadata status' },
    { path: '/api/metadata/linked-reports', name: 'Linked reports list' },
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.path);
      if (res.status === 200) {
        pass(`${ep.name} (HTTP 200)`);
      } else {
        fail(ep.name, `HTTP ${res.status}`);
      }
    } catch (e) {
      fail(ep.name, e.message);
    }
  }
}

async function testFileIdentical(starredResults) {
  log('\n7. FILE IDENTITY CHECK');
  log('----------------------');

  const csv1 = starredResults['starred/export-csv']?.content;
  const csv2 = starredResults['starred/export-all-csv']?.content;

  if (csv1 && csv2) {
    if (csv1 === csv2) {
      pass('export-csv === export-all-csv (identical)');
    } else {
      fail('export-csv vs export-all-csv', 'Files are not identical');
    }
  }
}

// Main test runner
async function runTests() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           LINEAGE API REGRESSION TEST SUITE                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\nTest started: ${new Date().toISOString()}`);
  console.log(`Target: ${BASE_URL}`);

  // Create test directory
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }

  // Run tests
  const healthy = await testHealthCheck();
  if (!healthy) {
    console.log('\n❌ Backend not running. Start it with: npm run dev');
    process.exit(1);
  }

  const starredResults = await testStarredExports();
  await testUnifiedExports();
  await testPbiExports();
  await testDataConsistency(starredResults);
  await testOtherEndpoints();
  await testFileIdentical(starredResults);

  // Summary
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('                         SUMMARY');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total:  ${passed + failed}`);

  if (failed > 0) {
    console.log('\n  FAILURES:');
    failures.forEach(f => {
      console.log(`    - ${f.name}: ${f.reason}`);
    });
    console.log('\n❌ TESTS FAILED');
    process.exit(1);
  } else {
    console.log('\n✅ ALL TESTS PASSED');
    process.exit(0);
  }
}

// Run
runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
