/**
 * Execution Scratchpad — in-memory key-value store scoped to a single orchestration run.
 *
 * Agents can write findings (e.g., `research.competitors`) that downstream agents
 * can read without explicit dependency injection. Lives in memory only — no persistence.
 */
export class ExecutionScratchpad {
  private store = new Map<string, unknown>();

  write(key: string, value: unknown): void {
    this.store.set(key, value);
  }

  read<T = unknown>(key: string): T | undefined {
    return this.store.get(key) as T | undefined;
  }

  readAll(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of this.store) {
      result[key] = value;
    }
    return result;
  }

  /** Append a string value to an existing key (creates if not exists) */
  append(key: string, value: string): void {
    const existing = this.store.get(key);
    if (typeof existing === "string") {
      this.store.set(key, existing + "\n" + value);
    } else {
      this.store.set(key, value);
    }
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  /** Format scratchpad contents as context string for injection into agent prompts */
  toContextString(): string {
    if (this.store.size === 0) return "";
    const lines: string[] = ["━━━ SHARED EXECUTION CONTEXT ━━━"];
    for (const [key, value] of this.store) {
      const formatted = typeof value === "string" ? value : JSON.stringify(value, null, 2);
      lines.push(`[${key}]:\n${formatted}`);
    }
    return lines.join("\n\n");
  }
}
