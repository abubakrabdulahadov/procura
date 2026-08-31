declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): { run(...values: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint }; get(...values: unknown[]): unknown; all(...values: unknown[]): unknown[] };
  }
}
