// Base D1 en memoria para las pruebas (misma interfaz que usa la tienda).
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

export class LocalD1 {
    constructor() {
        this.sqlite = new DatabaseSync(":memory:");
        this.sqlite.exec(
            readFileSync(new URL("../drizzle/0000_silly_hannibal_king.sql", import.meta.url), "utf8"),
        );
    }
    prepare(sql) {
        const db = this;
        return {
            bind(...args) {
                return {
                    async first() {
                        return db.sqlite.prepare(sql).get(...args) || null;
                    },
                    async all() {
                        return { results: db.sqlite.prepare(sql).all(...args) };
                    },
                    async run() {
                        const r = db.sqlite.prepare(sql).run(...args);
                        return { meta: { changes: Number(r.changes) } };
                    },
                    sql,
                    args,
                };
            },
            async first() {
                return db.sqlite.prepare(sql).get() || null;
            },
            async all() {
                return { results: db.sqlite.prepare(sql).all() };
            },
            sql,
            args: [],
        };
    }
    async batch(statements) {
        this.sqlite.exec("BEGIN");
        try {
            const result = statements.map((s) => ({
                meta: { changes: Number(this.sqlite.prepare(s.sql).run(...s.args).changes) },
            }));
            this.sqlite.exec("COMMIT");
            return result;
        } catch (error) {
            this.sqlite.exec("ROLLBACK");
            throw error;
        }
    }
}
