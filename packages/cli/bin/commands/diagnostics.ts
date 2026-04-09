import type { ReconcileReport } from '@specferret/core';

export const DIAGNOSTICS_SCHEMA_VERSION = '1.0.0';

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export type DiagnosticLocation = {
  contractId?: string;
  filePath?: string;
  nodeId?: string;
  importPath?: string;
  depth?: number;
  impact?: 'direct' | 'transitive';
};

export type MachineDiagnostic = {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  location: DiagnosticLocation;
  remediation: string;
};

export function buildLintDiagnostics(params: {
  report: ReconcileReport;
  breakingTriggerIds: Set<string>;
  triggerLocations: Map<string, { filePath?: string; nodeId?: string }>;
  perfBudgetMs?: number;
  durationMs?: number;
  perfExceeded?: boolean;
  includeSuggestions?: boolean;
}): MachineDiagnostic[] {
  const diagnostics: MachineDiagnostic[] = [];

  const add = (diagnostic: MachineDiagnostic): void => {
    diagnostics.push(diagnostic);
  };

  for (const item of params.report.flagged) {
    const breaking = params.breakingTriggerIds.has(item.triggeredByContractId);
    add({
      code: breaking ? 'FERRET_DRIFT_BREAKING' : 'FERRET_DRIFT_NON_BREAKING',
      severity: breaking ? 'error' : 'warning',
      message: `${item.triggeredByContractId} impacts ${item.filePath} (${item.impact}, depth ${item.depth}).`,
      location: {
        contractId: item.triggeredByContractId,
        filePath: item.filePath,
        nodeId: item.nodeId,
        depth: item.depth,
        impact: item.impact,
      },
      remediation: 'Run ferret review and resolve downstream drift before merge.',
    });
  }

  for (const contractId of params.breakingTriggerIds) {
    const alreadyRepresented = diagnostics.some(
      (d) => d.location.contractId === contractId && d.code === 'FERRET_DRIFT_BREAKING',
    );
    if (alreadyRepresented) {
      continue;
    }

    const location = params.triggerLocations.get(contractId);
    add({
      code: 'FERRET_CONTRACT_NEEDS_REVIEW',
      severity: 'error',
      message: `${contractId} is marked needs-review.`,
      location: {
        contractId,
        filePath: location?.filePath,
        nodeId: location?.nodeId,
      },
      remediation: 'Run ferret review to accept, update downstream contracts, or reject upstream drift.',
    });
  }

  for (const violation of params.report.integrityViolations.unresolvedImports) {
    add({
      code: 'FERRET_IMPORT_UNRESOLVED',
      severity: 'error',
      message: `${violation.contractId} imports missing contract ${violation.importPath}.`,
      location: {
        contractId: violation.contractId,
        filePath: violation.filePath,
        importPath: violation.importPath,
      },
      remediation: 'Create the missing contract or remove the invalid import path.',
    });
  }

  for (const violation of params.report.integrityViolations.selfImports) {
    add({
      code: 'FERRET_IMPORT_SELF_REFERENCE',
      severity: 'error',
      message: `${violation.contractId} imports itself via ${violation.importPath}.`,
      location: {
        contractId: violation.contractId,
        filePath: violation.filePath,
        importPath: violation.importPath,
      },
      remediation: 'Remove the self-import from the contract imports list.',
    });
  }

  for (const violation of params.report.integrityViolations.circularImports) {
    add({
      code: 'FERRET_IMPORT_CIRCULAR',
      severity: 'error',
      message: `${violation.contractId} participates in a circular import via ${violation.importPath}.`,
      location: {
        contractId: violation.contractId,
        filePath: violation.filePath,
        importPath: violation.importPath,
      },
      remediation: 'Break the cycle by removing or redesigning one of the circular dependencies.',
    });
  }

  if (params.includeSuggestions) {
    for (const suggestion of params.report.importSuggestions) {
      add({
        code: 'FERRET_IMPORT_SUGGESTION',
        severity: 'warning',
        message: `${suggestion.sourceContractId} may need import ${suggestion.suggestedImportId}.`,
        location: {
          contractId: suggestion.sourceContractId,
          filePath: suggestion.sourceFilePath,
          importPath: suggestion.suggestedImportId,
        },
        remediation: `Review the suggestion and add import '${suggestion.suggestedImportId}' if the dependency is intentional.`,
      });
    }
  }

  if (params.perfExceeded && params.perfBudgetMs !== undefined && params.durationMs !== undefined) {
    add({
      code: 'FERRET_PERFORMANCE_BUDGET_EXCEEDED',
      severity: 'error',
      message: `Lint runtime ${params.durationMs}ms exceeded budget ${params.perfBudgetMs}ms.`,
      location: {},
      remediation: 'Optimize extraction/reconciliation paths or increase the explicit performance budget.',
    });
  }

  return diagnostics;
}

export function buildReviewDiagnostics(items: Array<{
  contractId: string;
  sourceFile: string;
  classification: 'breaking' | 'non-breaking';
  affectedCount: number;
}>): MachineDiagnostic[] {
  return items.map((item) => ({
    code: item.classification === 'breaking' ? 'FERRET_REVIEW_BREAKING' : 'FERRET_REVIEW_NON_BREAKING',
    severity: item.classification === 'breaking' ? 'error' : 'warning',
    message: `${item.contractId} requires review (${item.affectedCount} impacted files).`,
    location: {
      contractId: item.contractId,
      filePath: item.sourceFile,
    },
    remediation: 'Run ferret review --action accept|update|reject to resolve this review item.',
  }));
}

export function buildIntegrityDiagnostics(report: ReconcileReport['integrityViolations']): MachineDiagnostic[] {
  return buildLintDiagnostics({
    report: {
      consistent: false,
      flagged: [],
      integrityViolations: report,
      importSuggestions: [],
      timestamp: new Date().toISOString(),
    },
    breakingTriggerIds: new Set<string>(),
    triggerLocations: new Map<string, { filePath?: string; nodeId?: string }>(),
  });
}
