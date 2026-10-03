import {
  isWritable,
  listResources,
  parsePath,
  readResource,
  writeResource,
  type ResolverContext,
} from "./path-resolver";
import type { WorkspaceApi, WorkspaceEntry } from "./types";

export interface WorkspaceOptions {
  projectId: string;
  userId: string;
}

export class Workspace implements WorkspaceApi {
  private readonly entries = new Map<string, WorkspaceEntry>();
  private readonly resolverCtx: ResolverContext;

  constructor(opts: WorkspaceOptions) {
    this.resolverCtx = { projectId: opts.projectId, userId: opts.userId };
  }

  private async ensureLoaded(path: string): Promise<WorkspaceEntry> {
    const cached = this.entries.get(path);
    if (cached) return cached;
    const snapshot = await readResource(path, this.resolverCtx);
    const entry: WorkspaceEntry = {
      path,
      original: snapshot.content,
      current: snapshot.content,
      dirty: false,
      deleted: false,
      loadedAt: Date.now(),
    };
    this.entries.set(path, entry);
    return entry;
  }

  async read(path: string, opts?: { offset?: number; limit?: number }): Promise<string> {
    const entry = await this.ensureLoaded(path);
    if (entry.deleted) throw new Error(`Resource '${path}' has been deleted in this session`);
    const content = entry.current;
    const lines = content.split(/\r?\n/);
    const offset = Math.max(0, opts?.offset ?? 0);
    const limit = Math.max(1, opts?.limit ?? 2000);
    const slice = lines.slice(offset, offset + limit);
    const numbered = slice.map((l, i) => {
      const n = offset + i + 1;
      return `${String(n).padStart(6, " ")}\t${l}`;
    });
    const header = offset > 0 || offset + limit < lines.length
      ? `(showing lines ${offset + 1}-${Math.min(offset + limit, lines.length)} of ${lines.length})\n`
      : "";
    return header + numbered.join("\n");
  }

  async list(pattern: string): Promise<string[]> {
    return listResources(pattern, this.resolverCtx);
  }

  async edit(path: string, oldString: string, newString: string, replaceAll = false): Promise<void> {
    if (!isWritable(path)) {
      throw new Error(
        `Path '${path}' is read-only. Only 'site:*' resources support Edit/Write in this version.`,
      );
    }
    if (oldString === newString) {
      throw new Error("old_string and new_string must be different");
    }
    const entry = await this.ensureLoaded(path);
    if (entry.deleted) throw new Error(`Resource '${path}' has been deleted in this session`);
    const current = entry.current;

    if (replaceAll) {
      if (!current.includes(oldString)) {
        throw new Error(`old_string not found in '${path}'`);
      }
      entry.current = current.split(oldString).join(newString);
      entry.dirty = true;
      return;
    }

    const occurrences = countOccurrences(current, oldString);
    if (occurrences === 0) {
      throw new Error(
        `old_string not found in '${path}'. Read or Grep the file first to get the exact text, including whitespace.`,
      );
    }
    if (occurrences > 1) {
      throw new Error(
        `old_string matches ${occurrences} places in '${path}'. Include more surrounding context to make it unique, or pass replace_all=true to replace every occurrence.`,
      );
    }
    entry.current = current.replace(oldString, newString);
    entry.dirty = true;
  }

  async write(path: string, content: string): Promise<void> {
    if (!isWritable(path)) {
      throw new Error(
        `Path '${path}' is read-only. Only 'site:*' resources support Write in this version.`,
      );
    }
    let entry = this.entries.get(path);
    if (!entry) {
      try {
        const snapshot = await readResource(path, this.resolverCtx);
        entry = {
          path,
          original: snapshot.content,
          current: content,
          dirty: snapshot.content !== content,
          deleted: false,
          loadedAt: Date.now(),
        };
      } catch {
        entry = {
          path,
          original: null,
          current: content,
          dirty: true,
          deleted: false,
          loadedAt: Date.now(),
        };
      }
      this.entries.set(path, entry);
      return;
    }
    entry.current = content;
    entry.deleted = false;
    entry.dirty = entry.original !== content;
  }

  async grep(
    pattern: string,
    opts?: { path?: string; context?: number; outputMode?: "content" | "files_with_matches" | "count"; headLimit?: number },
  ): Promise<string> {
    const outputMode = opts?.outputMode || "files_with_matches";
    const contextN = opts?.context ?? 0;
    const headLimit = opts?.headLimit ?? 250;

    const paths = await this.resolveSearchPaths(opts?.path);
    if (paths.length === 0) return "(no resources in scope)";

    let re: RegExp;
    try {
      re = new RegExp(pattern, "g");
    } catch (err) {
      throw new Error(`Invalid regex: ${(err as Error).message}`);
    }

    const matches: Array<{ path: string; line: number; text: string; context?: string }> = [];
    const matchCounts = new Map<string, number>();

    for (const path of paths) {
      try {
        const entry = await this.ensureLoaded(path);
        if (entry.deleted) continue;
        const lines = entry.current.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          re.lastIndex = 0;
          if (re.test(lines[i])) {
            matchCounts.set(path, (matchCounts.get(path) || 0) + 1);
            if (outputMode === "content") {
              const ctxStart = Math.max(0, i - contextN);
              const ctxEnd = Math.min(lines.length, i + contextN + 1);
              const block = lines
                .slice(ctxStart, ctxEnd)
                .map((ln, idx) => `${String(ctxStart + idx + 1).padStart(6, " ")}\t${ln}`)
                .join("\n");
              matches.push({ path, line: i + 1, text: lines[i], context: block });
              if (matches.length >= headLimit) break;
            }
          }
        }
        if (outputMode === "content" && matches.length >= headLimit) break;
      } catch {
        // skip resources we can't load
      }
    }

    if (outputMode === "files_with_matches") {
      const list = [...matchCounts.keys()].slice(0, headLimit);
      return list.length > 0 ? list.join("\n") : "(no matches)";
    }
    if (outputMode === "count") {
      const rows = [...matchCounts.entries()].slice(0, headLimit).map(([p, c]) => `${p}\t${c}`);
      return rows.length > 0 ? rows.join("\n") : "(no matches)";
    }

    const blocks = matches.map((m) => `${m.path}:${m.line}\n${m.context || `\t${m.text}`}`);
    return blocks.length > 0 ? blocks.join("\n---\n") : "(no matches)";
  }

  private async resolveSearchPaths(pathArg?: string): Promise<string[]> {
    if (!pathArg) {
      const allKinds = ["site:*", "docs:*", "tasks:*", "emails:*", "leads:*", "analytics:*", "contacts:*"];
      const lists = await Promise.all(allKinds.map((p) => this.list(p).catch(() => [])));
      return [...new Set(lists.flat())];
    }
    if (pathArg.includes("*") || pathArg.includes("?")) {
      return this.list(pathArg);
    }
    try {
      parsePath(pathArg);
      return [pathArg];
    } catch {
      return [];
    }
  }

  diffSummary() {
    const out: Array<{ path: string; changeType: "modified" | "created" | "deleted"; bytes: number }> = [];
    for (const entry of this.entries.values()) {
      if (entry.deleted && entry.original !== null) {
        out.push({ path: entry.path, changeType: "deleted", bytes: 0 });
      } else if (entry.dirty) {
        const isCreated = entry.original === null;
        out.push({
          path: entry.path,
          changeType: isCreated ? "created" : "modified",
          bytes: entry.current.length,
        });
      }
    }
    return out;
  }

  async commit(): Promise<{ committed: string[]; errors: Array<{ path: string; error: string }> }> {
    const committed: string[] = [];
    const errors: Array<{ path: string; error: string }> = [];

    for (const entry of this.entries.values()) {
      if (!entry.dirty && !entry.deleted) continue;
      try {
        if (entry.deleted) {
          errors.push({ path: entry.path, error: "Deletion is not supported in this version" });
          continue;
        }
        await writeResource(entry.path, entry.current, this.resolverCtx);
        entry.original = entry.current;
        entry.dirty = false;
        committed.push(entry.path);
      } catch (err) {
        errors.push({ path: entry.path, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { committed, errors };
  }

  rollback(): void {
    for (const entry of this.entries.values()) {
      if (entry.dirty && entry.original !== null) {
        entry.current = entry.original;
        entry.dirty = false;
      }
      entry.deleted = false;
    }
  }
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}
