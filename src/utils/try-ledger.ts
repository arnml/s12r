/**
 * Try Ledger: Ordered attempt tracking for diagnostic logging.
 *
 * Records each step of a process with inputs, outputs, errors, and timing.
 * Designed for reproducible, auditable execution traces.
 */

export interface LedgerStep {
  idx: number;
  timestamp: number;
  durationMs: number;
  name: string;
  inputsSummary: string;
  resultSummary?: string;
  errorSummary?: string;
  branchTag?: string; // 'primary' | 'fallback' | custom
}

export interface LedgerNote {
  idx: number;
  timestamp: number;
  name: string;
  details: string;
}

export interface LedgerEntry {
  type: 'step' | 'note';
  data: LedgerStep | LedgerNote;
}

export class TryLedger {
  private traceId: string;
  private entries: LedgerEntry[] = [];
  private stepIndex: number = 0;
  private verbose: boolean;

  constructor(traceId?: string, verbose?: boolean) {
    this.traceId = traceId || this.generateTraceId();
    this.verbose = verbose ?? isDebugEnabled();
  }

  getTraceId(): string {
    return this.traceId;
  }

  /**
   * Execute a step, record inputs/outputs/errors and timing.
   * @param name Step name (e.g., "normalize-segments")
   * @param inputsSummary Human-readable inputs (e.g., "segments=4, fps=30")
   * @param fn Function to execute
   * @returns Result of fn
   */
  step<T>(
    name: string,
    inputsSummary: string,
    fn: () => T,
    branchTag?: string
  ): T {
    const stepIdx = ++this.stepIndex;
    const startMs = Date.now();

    try {
      const result = fn();
      const durationMs = Date.now() - startMs;
      const resultSummary = this.summarizeValue(result);

      const entry: LedgerStep = {
        idx: stepIdx,
        timestamp: startMs,
        durationMs,
        name,
        inputsSummary,
        resultSummary,
        branchTag: branchTag || 'primary',
      };

      this.entries.push({ type: 'step', data: entry });

      if (this.verbose) {
        console.log(
          `[LEDGER ${this.traceId}] ${stepIdx}. ${name} (${durationMs}ms) → ${resultSummary}`
        );
      }

      return result;
    } catch (error) {
      const durationMs = Date.now() - startMs;
      const errorSummary = error instanceof Error ? error.message : String(error);

      const entry: LedgerStep = {
        idx: stepIdx,
        timestamp: startMs,
        durationMs,
        name,
        inputsSummary,
        errorSummary,
        branchTag: branchTag || 'error',
      };

      this.entries.push({ type: 'step', data: entry });

      if (this.verbose) {
        console.log(
          `[LEDGER ${this.traceId}] ${stepIdx}. ${name} (${durationMs}ms) ✗ ${errorSummary}`
        );
      }

      throw error;
    }
  }

  /**
   * Record a checkpoint without executing code (e.g., validation checkpoint).
   */
  note(name: string, details: string): void {
    const noteIdx = ++this.stepIndex;
    const timestamp = Date.now();

    const entry: LedgerNote = {
      idx: noteIdx,
      timestamp,
      name,
      details,
    };

    this.entries.push({ type: 'note', data: entry });

    if (this.verbose) {
      console.log(`[LEDGER ${this.traceId}] ${noteIdx}. NOTE: ${name} - ${details}`);
    }
  }

  /**
   * Get all entries as an array (for testing, serialization).
   */
  getEntries(): LedgerEntry[] {
    return [...this.entries];
  }

  /**
   * Emit final ledger summary (call this at end of process).
   */
  emitSummary(): string {
    const lines: string[] = [];
    lines.push(`\n╔══════════════════════════════════════════════════════════════╗`);
    lines.push(`║ TRY LEDGER SUMMARY (${this.traceId})`);
    lines.push(`╚══════════════════════════════════════════════════════════════╝\n`);

    for (const entry of this.entries) {
      if (entry.type === 'step') {
        const step = entry.data as LedgerStep;
        const status = step.errorSummary ? '✗ ERROR' : '✓ OK';
        const result = step.errorSummary || step.resultSummary || '—';
        lines.push(
          `${step.idx.toString().padStart(2)}. [${step.branchTag?.padEnd(8) || 'primary '}] ${step.name.padEnd(30)} (${step.durationMs}ms) ${status}`
        );
        lines.push(`    └─ input:  ${step.inputsSummary}`);
        lines.push(`    └─ result: ${result}\n`);
      } else {
        const note = entry.data as LedgerNote;
        lines.push(`${note.idx.toString().padStart(2)}. [NOTE    ] ${note.name}`);
        lines.push(`    └─ ${note.details}\n`);
      }
    }

    const summary = lines.join('\n');
    console.log(summary);
    return summary;
  }

  /**
   * For testing: get all step names in order.
   */
  getStepNames(): string[] {
    return this.entries
      .filter(e => e.type === 'step')
      .map(e => (e.data as LedgerStep).name);
  }

  /**
   * For testing: find a step by name and get its result.
   */
  getStepResult(name: string): string | undefined {
    const entry = this.entries.find(
      e => e.type === 'step' && (e.data as LedgerStep).name === name
    );
    if (entry && entry.type === 'step') {
      return (entry.data as LedgerStep).resultSummary;
    }
    return undefined;
  }

  // ─── Helpers ───

  private generateTraceId(): string {
    return `trace-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  private summarizeValue(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return value.length > 100 ? `"${value.substring(0, 100)}…"` : `"${value}"`;
    if (typeof value === 'number') return value.toString();
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (Array.isArray(value)) return `[${value.length} items]`;
    if (typeof value === 'object') {
      const keys = Object.keys(value);
      return `{${keys.join(', ')}}`;
    }
    return String(value);
  }
}

/**
 * Check if DEBUG_EXPRESSION is set in environment.
 */
export function isDebugEnabled(): boolean {
  return process.env.DEBUG_EXPRESSION === '1' || process.env.DEBUG_EXPRESSION === 'true';
}

/**
 * Global default ledger (for convenience).
 */
let defaultLedger: TryLedger | null = null;

export function getDefaultLedger(): TryLedger {
  if (!defaultLedger) {
    defaultLedger = new TryLedger();
  }
  return defaultLedger;
}

export function setDefaultLedger(ledger: TryLedger): void {
  defaultLedger = ledger;
}

export function resetDefaultLedger(): void {
  defaultLedger = null;
}
