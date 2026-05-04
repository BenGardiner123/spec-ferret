// Audit layer — read-only bidirectional drift report.
// Combines downward drift (reconciler), upward drift (code → spec), and status.
// No mutations. No side effects beyond reading the store and filesystem.

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DBStore } from '../store/types.js';
import type { ImportIntegrityReport, ReconcileReport } from '../reconciler/index.js';
import type { UpwardDriftResult } from '../extractor/upward-classifier.js';
import type { StatusReport } from '../status/index.js';
import type { ExtractionResult } from '../extractor/frontmatter.js';
import { Reconciler } from '../reconciler/index.js';
import { classifyUpwardDrift } from '../extractor/upward-classifier.js';
import { buildStatusReport } from '../status/index.js';
import { extractContractsFromTypeScript } from '../extractor/typescript.js';
import { extractFromContractFile } from '../extractor/typescript-contract.js';

export interface AuditSummary {
  totalContracts: number;
  stable: number;
  needsReview: number;
  pending: number;
  downwardBreaking: number;
  downwardNonBreaking: number;
  upwardBreaking: number;
  upwardNonBreaking: number;
  integrityViolationCount: number;
}

export interface AuditReport {
  version: '1.0';
  timestamp: string;
  summary: AuditSummary;
  downwardDrift: ReconcileReport['flagged'];
  upwardDrift: UpwardDriftResult[];
  integrityViolations: ImportIntegrityReport;
  importSuggestions: ReconcileReport['importSuggestions'];
  statusReport: StatusReport;
}

export async function buildAuditReport(store: DBStore, projectRoot: string): Promise<AuditReport> {
  const reconciler = new Reconciler(store);
  const reconcileReport = await reconciler.reconcile();
  const statusReport = await buildStatusReport(store);

  const contracts = await store.getContracts();
  const breakingTriggerIds = new Set(contracts.filter((c) => c.status === 'needs-review').map((c) => c.id));

  // Upward drift detection — re-extract live TypeScript and compare to declared schema.
  const upwardDrift: UpwardDriftResult[] = [];
  const tsExtractionCache = new Map<string, ExtractionResult>();

  for (const contract of contracts) {
    if (!contract.code_source_file || !contract.code_source_symbol) continue;
    const sourceAbsPath = path.resolve(projectRoot, contract.code_source_file);
    if (!fs.existsSync(sourceAbsPath)) continue;

    let codeShape: unknown;
    try {
      if (sourceAbsPath.endsWith('.contract.ts')) {
        let tsExtraction = tsExtractionCache.get(sourceAbsPath);
        if (!tsExtraction) {
          tsExtraction = await extractFromContractFile(sourceAbsPath);
          tsExtractionCache.set(sourceAbsPath, tsExtraction);
        }
        const found = tsExtraction.contracts.find((c) => c.id === contract.code_source_symbol);
        if (!found) continue;
        codeShape = found.shape;
      } else {
        const fileContent = fs.readFileSync(sourceAbsPath, 'utf-8');
        const extraction = extractContractsFromTypeScript(sourceAbsPath, fileContent);
        const found = extraction.contracts.find((c) => c.sourceSymbol === contract.code_source_symbol);
        if (!found) continue;
        codeShape = found.shape;
      }
    } catch {
      continue;
    }

    let declaredSchema: unknown = {};
    try {
      declaredSchema = JSON.parse(contract.shape_schema);
    } catch {}

    const result = classifyUpwardDrift(contract.id, declaredSchema, codeShape, contract.code_source_file, contract.code_source_symbol);
    if (result.driftClass !== 'NOOP') {
      upwardDrift.push(result);
    }
  }

  const downwardBreaking = reconcileReport.flagged.filter((f) => breakingTriggerIds.has(f.triggeredByContractId)).length;
  const downwardNonBreaking = reconcileReport.flagged.filter((f) => !breakingTriggerIds.has(f.triggeredByContractId)).length;
  const upwardBreaking = upwardDrift.filter((d) => d.driftClass === 'BREAKING').length;
  const upwardNonBreaking = upwardDrift.filter((d) => d.driftClass === 'NON_BREAKING').length;
  const integrityViolationCount =
    reconcileReport.integrityViolations.unresolvedImports.length +
    reconcileReport.integrityViolations.selfImports.length +
    reconcileReport.integrityViolations.circularImports.length;

  return {
    version: '1.0',
    timestamp: new Date().toISOString(),
    summary: {
      totalContracts: contracts.length,
      stable: statusReport.stable,
      needsReview: statusReport.needsReview,
      pending: statusReport.pending,
      downwardBreaking,
      downwardNonBreaking,
      upwardBreaking,
      upwardNonBreaking,
      integrityViolationCount,
    },
    downwardDrift: reconcileReport.flagged,
    upwardDrift,
    integrityViolations: reconcileReport.integrityViolations,
    importSuggestions: reconcileReport.importSuggestions,
    statusReport,
  };
}
