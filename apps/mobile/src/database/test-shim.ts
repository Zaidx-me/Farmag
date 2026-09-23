/**
 * Pure in-memory SQLite shim for vitest (Node) tests.
 *
 * expo-sqlite is a native module and cannot run under vitest's Node
 * environment, so the database layer accepts an injected `SqliteConnection`
 * and tests pass this shim instead. It implements the async SQL subset the
 * database modules use — CREATE TABLE, INSERT OR REPLACE, SELECT ... WHERE ...
 * ORDER BY ... LIMIT, UPDATE ... SET (incl. `col = col + n`), DELETE, PRAGMA
 * user_version / journal_mode, and withTransactionAsync — over an in-memory
 * table store with a module-level `user_version`.
 *
 * Shared by migrations.test.ts and sync-queue.test.ts; reusable by Task 29's
 * sync-engine tests. Zero `any`.
 */

import type { SqliteBindValue, SqliteConnection, SqliteRunResult } from './db';

export interface InMemoryRow {
  [column: string]: SqliteBindValue;
}

interface ColumnDef {
  name: string;
  primaryKey: boolean;
  defaultValue: ValueExpr | null;
}

type ValueExpr =
  | { kind: 'param' }
  | { kind: 'literal'; value: SqliteBindValue }
  | { kind: 'arith'; column: string; op: '+' | '-'; operand: ValueExpr };

interface Condition {
  column: string;
  op: string;
  value: ValueExpr | null;
}

interface OrderBy {
  column: string;
  direction: 'ASC' | 'DESC';
}

interface SetClause {
  column: string;
  value: ValueExpr;
}

type Statement =
  | { kind: 'pragma-get'; name: string }
  | { kind: 'pragma-set'; name: string; value: SqliteBindValue }
  | { kind: 'create-table'; table: string; columns: ColumnDef[] }
  | { kind: 'insert'; table: string; columns: string[]; values: ValueExpr[]; orReplace: boolean }
  | { kind: 'select'; table: string; where: Condition[]; orderBy: OrderBy[]; limit: number | null }
  | { kind: 'update'; table: string; sets: SetClause[]; where: Condition[] }
  | { kind: 'delete'; table: string; where: Condition[] };

type Token =
  | { type: 'ident'; value: string }
  | { type: 'string'; value: string }
  | { type: 'number'; value: number }
  | { type: 'op'; value: string }
  | { type: 'punct'; value: string }
  | { type: 'param'; value: '?' };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === "'") {
      let j = i + 1;
      let value = '';
      while (j < source.length) {
        if (source[j] === "'") {
          if (source[j + 1] === "'") {
            value += "'";
            j += 2;
            continue;
          }
          break;
        }
        value += source[j];
        j += 1;
      }
      tokens.push({ type: 'string', value });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === '-' && /[0-9]/.test(source[i + 1] ?? ''))) {
      let j = i;
      let value = '';
      while (j < source.length && /[0-9.]/.test(source[j])) {
        value += source[j];
        j += 1;
      }
      tokens.push({ type: 'number', value: Number(value) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      let value = '';
      while (j < source.length && /[A-Za-z0-9_]/.test(source[j])) {
        value += source[j];
        j += 1;
      }
      tokens.push({ type: 'ident', value });
      i = j;
      continue;
    }
    if (ch === '?') {
      tokens.push({ type: 'param', value: '?' });
      i += 1;
      continue;
    }
    const two = source.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '!=' || two === '<>') {
      tokens.push({ type: 'op', value: two });
      i += 2;
      continue;
    }
    if (ch === '=' || ch === '<' || ch === '>' || ch === '+' || ch === '-') {
      tokens.push({ type: 'op', value: ch });
      i += 1;
      continue;
    }
    if (ch === '(' || ch === ')' || ch === ',' || ch === ';' || ch === '*') {
      tokens.push({ type: 'punct', value: ch });
      i += 1;
      continue;
    }
    throw new Error(`test-shim: unexpected character "${ch}" in SQL: ${source}`);
  }
  return tokens;
}

/** Split a SQL script on top-level semicolons (string-literal aware). */
function splitStatements(source: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inString = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === "'") {
      inString = !inString;
      current += ch;
      continue;
    }
    if (ch === ';' && !inString) {
      if (current.trim().length > 0) statements.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim().length > 0) statements.push(current.trim());
  return statements;
}

function evalValue(
  expr: ValueExpr,
  params: SqliteBindValue[],
  cursor: { index: number },
  row?: InMemoryRow,
): SqliteBindValue {
  if (expr.kind === 'literal') return expr.value;
  if (expr.kind === 'param') {
    const value = params[cursor.index];
    cursor.index += 1;
    if (value === undefined) {
      throw new Error('test-shim: not enough bound parameters');
    }
    return value;
  }
  if (row === undefined) {
    throw new Error('test-shim: arithmetic expression requires a row context');
  }
  const current = row[expr.column];
  const operand = evalValue(expr.operand, params, cursor, row);
  const left = typeof current === 'number' ? current : Number(current);
  const right = typeof operand === 'number' ? operand : Number(operand);
  return expr.op === '+' ? left + right : left - right;
}

function compareValues(a: SqliteBindValue, b: SqliteBindValue): number {
  if (a === null && b === null) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const as = String(a);
  const bs = String(b);
  return as < bs ? -1 : as > bs ? 1 : 0;
}

interface EvaluatedCondition {
  column: string;
  op: string;
  value: SqliteBindValue | null;
}

function matchesCondition(row: InMemoryRow, cond: EvaluatedCondition): boolean {
  const actual = row[cond.column];
  if (cond.op === 'IS') return actual === null;
  if (cond.op === 'IS NOT') return actual !== null;
  const expected = cond.value;
  switch (cond.op) {
    case '=':
      return actual === expected;
    case '!=':
    case '<>':
      return actual !== expected;
    case '<':
      return compareValues(actual, expected) < 0;
    case '<=':
      return compareValues(actual, expected) <= 0;
    case '>':
      return compareValues(actual, expected) > 0;
    case '>=':
      return compareValues(actual, expected) >= 0;
    default:
      throw new Error(`test-shim: unsupported operator "${cond.op}"`);
  }
}

class SqlParser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): Statement {
    const first = this.peek();
    if (first === undefined) throw new Error('test-shim: empty SQL statement');
    if (first.type !== 'ident') {
      throw new Error('test-shim: unsupported SQL statement');
    }
    switch (first.value.toUpperCase()) {
      case 'PRAGMA':
        return this.parsePragma();
      case 'CREATE':
        return this.parseCreate();
      case 'INSERT':
        return this.parseInsert();
      case 'SELECT':
        return this.parseSelect();
      case 'UPDATE':
        return this.parseUpdate();
      case 'DELETE':
        return this.parseDelete();
      default:
        throw new Error(`test-shim: unsupported SQL keyword "${first.value}"`);
    }
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private next(): Token {
    const token = this.tokens[this.pos];
    if (token === undefined) throw new Error('test-shim: unexpected end of SQL');
    this.pos += 1;
    return token;
  }

  private expectIdent(): string {
    const token = this.next();
    if (token.type !== 'ident') {
      throw new Error(`test-shim: expected identifier, got "${token.value}"`);
    }
    return token.value;
  }

  private expectKeyword(keyword: string): void {
    const token = this.next();
    if (token.type !== 'ident' || token.value.toUpperCase() !== keyword) {
      throw new Error(`test-shim: expected keyword ${keyword}, got "${token.value}"`);
    }
  }

  private expectPunct(value: string): void {
    const token = this.next();
    if (token.type !== 'punct' || token.value !== value) {
      throw new Error(`test-shim: expected "${value}", got "${token.value}"`);
    }
  }

  private expectOp(value: string): void {
    const token = this.next();
    if (token.type !== 'op' || token.value !== value) {
      throw new Error(`test-shim: expected operator "${value}", got "${token.value}"`);
    }
  }

  private isKeyword(keyword: string): boolean {
    const token = this.peek();
    return token !== undefined && token.type === 'ident' && token.value.toUpperCase() === keyword;
  }

  private isPunct(value: string): boolean {
    const token = this.peek();
    return token !== undefined && token.type === 'punct' && token.value === value;
  }

  private skipParenGroup(): void {
    this.expectPunct('(');
    let depth = 1;
    while (depth > 0) {
      const token = this.next();
      if (token.type === 'punct' && token.value === '(') depth += 1;
      else if (token.type === 'punct' && token.value === ')') depth -= 1;
    }
  }

  private parseValueExpr(): ValueExpr {
    const token = this.next();
    if (token.type === 'param') return { kind: 'param' };
    if (token.type === 'string') return { kind: 'literal', value: token.value };
    if (token.type === 'number') return { kind: 'literal', value: token.value };
    if (token.type === 'ident') {
      if (token.value.toUpperCase() === 'NULL') return { kind: 'literal', value: null };
      return { kind: 'literal', value: token.value };
    }
    throw new Error(`test-shim: expected a value, got "${token.value}"`);
  }

  private parsePragma(): Statement {
    this.next(); // PRAGMA
    const name = this.expectIdent();
    if (this.peek()?.type === 'op' && this.peek()?.value === '=') {
      this.next();
      const value = this.parseValueExpr();
      return { kind: 'pragma-set', name, value: evalValue(value, [], { index: 0 }) };
    }
    return { kind: 'pragma-get', name };
  }

  private parseCreate(): Statement {
    this.next(); // CREATE
    this.expectKeyword('TABLE');
    if (this.isKeyword('IF')) {
      this.next();
      this.expectKeyword('NOT');
      this.expectKeyword('EXISTS');
    }
    const table = this.expectIdent();
    this.expectPunct('(');
    const columns: ColumnDef[] = [];
    while (!this.isPunct(')')) {
      if (this.isKeyword('PRIMARY')) {
        // table-level PRIMARY KEY (col)
        this.next();
        this.expectKeyword('KEY');
        this.expectPunct('(');
        const pkColumn = this.expectIdent();
        this.expectPunct(')');
        const def = columns.find((c) => c.name === pkColumn);
        if (def !== undefined) def.primaryKey = true;
      } else {
        const name = this.expectIdent();
        this.expectIdent(); // column type (TEXT / INTEGER / REAL / ...)
        let primaryKey = false;
        let defaultValue: ValueExpr | null = null;
        while (!this.isPunct(',') && !this.isPunct(')')) {
          const token = this.next();
          if (token.type === 'ident') {
            switch (token.value.toUpperCase()) {
              case 'PRIMARY':
                this.expectKeyword('KEY');
                primaryKey = true;
                break;
              case 'DEFAULT':
                defaultValue = this.parseValueExpr();
                break;
              case 'NOT':
                this.expectKeyword('NULL');
                break;
              case 'REFERENCES':
                this.expectIdent();
                if (this.isPunct('(')) this.skipParenGroup();
                break;
              case 'COLLATE':
                this.expectIdent();
                break;
              case 'CHECK':
                this.skipParenGroup();
                break;
              case 'UNIQUE':
              default:
                break; // unknown constraint keyword — ignore
            }
          }
        }
        columns.push({ name, primaryKey, defaultValue });
      }
      if (this.isPunct(',')) this.next();
    }
    this.expectPunct(')');
    return { kind: 'create-table', table, columns };
  }

  private parseInsert(): Statement {
    this.next(); // INSERT
    let orReplace = false;
    if (this.isKeyword('OR')) {
      this.next();
      const mode = this.expectIdent().toUpperCase();
      orReplace = mode === 'REPLACE';
    }
    this.expectKeyword('INTO');
    const table = this.expectIdent();
    this.expectPunct('(');
    const columns: string[] = [];
    while (!this.isPunct(')')) {
      columns.push(this.expectIdent());
      if (this.isPunct(',')) this.next();
    }
    this.expectPunct(')');
    this.expectKeyword('VALUES');
    this.expectPunct('(');
    const values: ValueExpr[] = [];
    while (!this.isPunct(')')) {
      values.push(this.parseValueExpr());
      if (this.isPunct(',')) this.next();
    }
    this.expectPunct(')');
    return { kind: 'insert', table, columns, values, orReplace };
  }

  private parseSelect(): Statement {
    this.next(); // SELECT
    const star = this.next();
    if (!(star.type === 'punct' && star.value === '*')) {
      throw new Error('test-shim: only SELECT * is supported');
    }
    this.expectKeyword('FROM');
    const table = this.expectIdent();
    let where: Condition[] = [];
    if (this.isKeyword('WHERE')) {
      this.next();
      where = this.parseConditions();
    }
    let orderBy: OrderBy[] = [];
    if (this.isKeyword('ORDER')) {
      this.next();
      this.expectKeyword('BY');
      while (true) {
        const column = this.expectIdent();
        let direction: 'ASC' | 'DESC' = 'ASC';
        if (this.isKeyword('ASC')) this.next();
        else if (this.isKeyword('DESC')) {
          this.next();
          direction = 'DESC';
        }
        orderBy.push({ column, direction });
        if (this.isPunct(',')) {
          this.next();
          continue;
        }
        break;
      }
    }
    let limit: number | null = null;
    if (this.isKeyword('LIMIT')) {
      this.next();
      const token = this.next();
      if (token.type !== 'number') throw new Error('test-shim: LIMIT must be a number');
      limit = token.value;
    }
    return { kind: 'select', table, where, orderBy, limit };
  }

  private parseConditions(): Condition[] {
    const conditions: Condition[] = [];
    while (true) {
      const column = this.expectIdent();
      if (this.isKeyword('IS')) {
        this.next();
        let negate = false;
        if (this.isKeyword('NOT')) {
          this.next();
          negate = true;
        }
        this.expectKeyword('NULL');
        conditions.push({ column, op: negate ? 'IS NOT' : 'IS', value: null });
      } else {
        const op = this.next();
        if (op.type !== 'op') throw new Error('test-shim: expected operator in WHERE clause');
        conditions.push({ column, op: op.value, value: this.parseValueExpr() });
      }
      if (this.isKeyword('AND')) {
        this.next();
        continue;
      }
      break;
    }
    return conditions;
  }

  private parseUpdate(): Statement {
    this.next(); // UPDATE
    const table = this.expectIdent();
    this.expectKeyword('SET');
    const sets: SetClause[] = [];
    while (true) {
      const column = this.expectIdent();
      this.expectOp('=');
      if (this.peek()?.type === 'ident' && this.peek()?.value === column) {
        this.next();
        const opToken = this.peek();
        if (opToken?.type === 'op' && (opToken.value === '+' || opToken.value === '-')) {
          this.next();
          sets.push({
            column,
            value: { kind: 'arith', column, op: opToken.value, operand: this.parseValueExpr() },
          });
        } else {
          sets.push({ column, value: { kind: 'literal', value: column } });
        }
      } else {
        sets.push({ column, value: this.parseValueExpr() });
      }
      if (this.isPunct(',')) {
        this.next();
        continue;
      }
      break;
    }
    let where: Condition[] = [];
    if (this.isKeyword('WHERE')) {
      this.next();
      where = this.parseConditions();
    }
    return { kind: 'update', table, sets, where };
  }

  private parseDelete(): Statement {
    this.next(); // DELETE
    this.expectKeyword('FROM');
    const table = this.expectIdent();
    let where: Condition[] = [];
    if (this.isKeyword('WHERE')) {
      this.next();
      where = this.parseConditions();
    }
    return { kind: 'delete', table, where };
  }
}

function parseStatement(source: string): Statement {
  return new SqlParser(tokenize(source)).parse();
}

interface TableStore {
  columns: ColumnDef[];
  rows: InMemoryRow[];
}

export class InMemorySqlite implements SqliteConnection {
  private readonly tables = new Map<string, TableStore>();
  private userVersion = 0;
  private journalMode = '';
  private lastInsertRowId = 0;

  async execAsync(source: string): Promise<void> {
    for (const statement of splitStatements(source)) {
      const stmt = parseStatement(statement);
      switch (stmt.kind) {
        case 'pragma-set':
          if (stmt.name === 'user_version') this.userVersion = Number(stmt.value);
          else if (stmt.name === 'journal_mode') this.journalMode = String(stmt.value);
          break;
        case 'create-table':
          this.tables.set(stmt.table, { columns: stmt.columns, rows: [] });
          break;
        default:
          throw new Error(`test-shim: execAsync does not support ${stmt.kind} statements`);
      }
    }
  }

  async runAsync(source: string, params: SqliteBindValue[] = []): Promise<SqliteRunResult> {
    const stmt = parseStatement(source);
    const cursor = { index: 0 };
    switch (stmt.kind) {
      case 'insert': {
        const table = this.requireTable(stmt.table);
        const row: InMemoryRow = {};
        for (let i = 0; i < stmt.columns.length; i++) {
          row[stmt.columns[i]] = evalValue(stmt.values[i], params, cursor);
        }
        for (const col of table.columns) {
          if (col.name in row) continue;
          if (col.defaultValue !== null) {
            row[col.name] = evalValue(col.defaultValue, [], { index: 0 });
          } else if (col.primaryKey) {
            throw new Error(`test-shim: missing value for PRIMARY KEY column "${col.name}"`);
          } else {
            row[col.name] = null;
          }
        }
        const pk = table.columns.find((c) => c.primaryKey)?.name ?? null;
        let changes = 1;
        if (stmt.orReplace && pk !== null) {
          const existing = table.rows.findIndex((r) => r[pk] === row[pk]);
          if (existing >= 0) {
            table.rows[existing] = row;
            changes = 2;
          } else {
            table.rows.push(row);
          }
        } else {
          table.rows.push(row);
        }
        this.lastInsertRowId += 1;
        return { changes, lastInsertRowId: this.lastInsertRowId };
      }
      case 'update': {
        const table = this.requireTable(stmt.table);
        const setValues: { column: string; value: SqliteBindValue }[] = [];
        const arithSets: SetClause[] = [];
        for (const set of stmt.sets) {
          if (set.value.kind === 'arith') arithSets.push(set);
          else setValues.push({ column: set.column, value: evalValue(set.value, params, cursor) });
        }
        const matched = this.matchingRows(table.rows, stmt.where, params, cursor);
        for (const row of matched) {
          for (const sv of setValues) row[sv.column] = sv.value;
          for (const set of arithSets) {
            row[set.column] = evalValue(set.value, [], { index: 0 }, row);
          }
        }
        return { changes: matched.length, lastInsertRowId: 0 };
      }
      case 'delete': {
        const table = this.requireTable(stmt.table);
        const matched = this.matchingRows(table.rows, stmt.where, params, cursor);
        const toRemove = new Set(matched);
        table.rows = table.rows.filter((r) => !toRemove.has(r));
        return { changes: matched.length, lastInsertRowId: 0 };
      }
      default:
        throw new Error(`test-shim: runAsync does not support ${stmt.kind} statements`);
    }
  }

  async getFirstAsync<T>(source: string, params: SqliteBindValue[] = []): Promise<T | null> {
    const stmt = parseStatement(source);
    if (stmt.kind === 'pragma-get') {
      if (stmt.name === 'user_version') return { user_version: this.userVersion } as unknown as T;
      if (stmt.name === 'journal_mode') return { journal_mode: this.journalMode } as unknown as T;
      throw new Error(`test-shim: unknown PRAGMA "${stmt.name}"`);
    }
    if (stmt.kind !== 'select') {
      throw new Error('test-shim: getFirstAsync only supports SELECT');
    }
    const rows = this.executeSelect(stmt, params);
    return rows.length > 0 ? (rows[0] as unknown as T) : null;
  }

  async getAllAsync<T>(source: string, params: SqliteBindValue[] = []): Promise<T[]> {
    const stmt = parseStatement(source);
    if (stmt.kind !== 'select') {
      throw new Error('test-shim: getAllAsync only supports SELECT');
    }
    return this.executeSelect(stmt, params) as unknown as T[];
  }

  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    await task();
  }

  private requireTable(name: string): TableStore {
    const table = this.tables.get(name);
    if (table === undefined) throw new Error(`test-shim: no such table "${name}"`);
    return table;
  }

  private executeSelect(stmt: Extract<Statement, { kind: 'select' }>, params: SqliteBindValue[]): InMemoryRow[] {
    const table = this.requireTable(stmt.table);
    const cursor = { index: 0 };
    let rows = this.matchingRows(table.rows, stmt.where, params, cursor);
    if (stmt.orderBy.length > 0) {
      rows = [...rows].sort((a, b) => {
        for (const ob of stmt.orderBy) {
          const cmp = compareValues(a[ob.column], b[ob.column]);
          if (cmp !== 0) return ob.direction === 'DESC' ? -cmp : cmp;
        }
        return 0;
      });
    }
    if (stmt.limit !== null) rows = rows.slice(0, stmt.limit);
    return rows;
  }

  private matchingRows(
    rows: InMemoryRow[],
    where: Condition[],
    params: SqliteBindValue[],
    cursor: { index: number },
  ): InMemoryRow[] {
    const evaluated: EvaluatedCondition[] = where.map((cond) => ({
      column: cond.column,
      op: cond.op,
      value: cond.value === null ? null : evalValue(cond.value, params, cursor),
    }));
    return rows.filter((row) => evaluated.every((cond) => matchesCondition(row, cond)));
  }
}

/** Create a fresh in-memory SQLite connection for tests. */
export function createInMemorySqlite(): SqliteConnection {
  return new InMemorySqlite();
}