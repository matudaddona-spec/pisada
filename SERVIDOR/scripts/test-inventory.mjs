import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
    bootstrap,
    getCatalog,
    getProduct,
    createCategory,
    createProduct,
    editProduct,
    moveStock,
    deleteProduct,
    restoreProduct,
    events,
    uploadImage,
} from "../lib/inventory-service.mjs";
import { normalizeProduct, measurementMap } from "../lib/catalog-domain.mjs";
import { renderStore } from "../lib/store-renderer.mjs";

class LocalD1 {
    constructor() {
        this.sqlite = new DatabaseSync(":memory:");
        this.sqlite.exec(
            readFileSync(
                new URL("../drizzle/0000_silly_hannibal_king.sql", import.meta.url),
                "utf8",
            ),
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
const db = new LocalD1();
assert.equal((await getCatalog(db)).needsSetup, true);
await bootstrap(db);
await bootstrap(db);
let catalog = await getCatalog(db);
assert.equal(catalog.products.length, 30);
assert.equal(catalog.categories.length, 6);
let product = catalog.products.find((p) => p.path === "/basquet/air-jordan-12-retro");
assert.equal(product.imageColors["/IMG/pisada-34-azul-a.jpg"], "Azul");
assert.equal(measurementMap(product).get("39"), "25,4");
const size = product.sizes.find((s) => s.label === "40");
product = await moveStock(
    db,
    product.id,
    {
        requestId: "test-adjust-one",
        version: product.version,
        variantId: size.id,
        kind: "adjust",
        quantity: 1,
        reason: "Conteo de prueba",
    },
    "test-owner",
);
const version = product.version;
const attempts = await Promise.allSettled(
    ["test-sale-a", "test-sale-b"].map((requestId) =>
        moveStock(
            db,
            product.id,
            { requestId, version, variantId: size.id, kind: "sale", quantity: 1, reason: "" },
            "test-owner",
        ),
    ),
);
assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
assert.equal(attempts.filter((r) => r.status === "rejected" && r.reason.status === 409).length, 1);
const winner = attempts[0].status === "fulfilled" ? "test-sale-a" : "test-sale-b";
product = await getProduct(db, product.id);
assert.equal(product.sizes.find((s) => s.id === size.id).stock, 0);
await moveStock(
    db,
    product.id,
    { requestId: winner, version, variantId: size.id, kind: "sale", quantity: 1 },
    "test-owner",
);
assert.equal((await getProduct(db, product.id)).sizes.find((s) => s.id === size.id).stock, 0);
assert.equal((await events(db)).filter((e) => e.kind === "sale").length, 1);
await assert.rejects(
    () =>
        moveStock(
            db,
            product.id,
            {
                requestId: "test-negative-sale",
                version: product.version,
                variantId: size.id,
                kind: "sale",
                quantity: 1,
            },
            "test-owner",
        ),
    (e) => e.status === 409,
);
product = await moveStock(
    db,
    product.id,
    {
        requestId: "test-restock",
        version: product.version,
        variantId: size.id,
        kind: "received",
        quantity: 5,
    },
    "test-owner",
);
assert.equal(product.sizes.find((s) => s.id === size.id).stock, 5);
await assert.rejects(
    () =>
        moveStock(
            db,
            product.id,
            {
                requestId: "test-stale-edit",
                version,
                variantId: size.id,
                kind: "adjust",
                quantity: 8,
                reason: "Versión vieja",
            },
            "test-owner",
        ),
    (e) => e.status === 409,
);
const category = await createCategory(db, { name: "Categoría de prueba" });
catalog = await getCatalog(db, true);
const input = {
    requestId: "test-create-model",
    name: "Modelo de prueba",
    categoryPath: category.path,
    price: 12000,
    description: "<script>alert(1)</script>\nModelo de prueba",
    images: [product.images[0]],
    sizes: [
        { id: "black-40", label: "40", color: "Negro", stock: 2 },
        { id: "white-40", label: "40", color: "Blanco", stock: 3 },
    ],
    published: true,
};
let created = await createProduct(db, null, input, "test-owner");
const repeat = await createProduct(db, null, input, "test-owner");
assert.equal(created.id, repeat.id);
assert(!created.descriptionHtml.includes("<script>"));
assert(created.descriptionHtml.includes("&lt;script&gt;"));
created = await moveStock(
    db,
    created.id,
    {
        requestId: "test-sale-color",
        version: created.version,
        variantId: "black-40",
        kind: "sale",
        quantity: 1,
    },
    "test-owner",
);
assert.equal(created.sizes.find((s) => s.id === "black-40").stock, 1);
assert.equal(created.sizes.find((s) => s.id === "white-40").stock, 3);
const beforeHide = await getCatalog(db);
assert(beforeHide.products.some((p) => p.id === created.id));
created = await editProduct(
    db,
    null,
    created.id,
    {
        ...created,
        description: created.description,
        requestId: "test-hide-model",
        published: false,
    },
    "test-owner",
);
assert(!(await getCatalog(db)).products.some((p) => p.id === created.id));
assert((await getCatalog(db, true)).products.some((p) => p.id === created.id));
assert.throws(() =>
    normalizeProduct(
        { ...input, sizes: [{ label: "40", color: "Negro", stock: -1 }] },
        catalog.categories,
    ),
);
assert.throws(() =>
    normalizeProduct(
        {
            ...input,
            sizes: [
                { label: "40", color: "Negro", stock: 1 },
                { label: "40", color: "negro", stock: 1 },
            ],
        },
        catalog.categories,
    ),
);
assert.throws(() =>
    normalizeProduct(
        { ...input, images: ["https://external.example/image.png"] },
        catalog.categories,
    ),
);
const bucket = {
    files: new Map(),
    async put(key, body, meta) {
        this.files.set(key, { body, meta });
    },
    async head(key) {
        return this.files.has(key) ? {} : null;
    },
};
const image = await uploadImage(
    new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "test.png", {
        type: "image/png",
    }),
    bucket,
);
assert(image.url.startsWith("/media/images/"));
assert.equal(bucket.files.size, 1);
await assert.rejects(() =>
    uploadImage(
        new File(["<svg><script>alert(1)</script></svg>"], "x.svg", { type: "image/svg+xml" }),
        bucket,
    ),
);
const templates = Object.fromEntries(
    Object.entries({
        home: "../../index.html",
        listing: "../../PAGES/productos.html",
        product: "../../PAGES/producto.html",
    }).map(([name, file]) => [name, readFileSync(new URL(file, import.meta.url), "utf8")]),
);
const rendered = renderStore(
    templates,
    await getCatalog(db),
    new URL("http://localhost" + product.path),
);
assert(rendered.includes("25,4 cm"));
assert(!rendered.includes("__PRODUCT_"));
assert(rendered.includes("Pisada"));
created = await editProduct(
    db,
    null,
    created.id,
    { ...created, requestId: "test-publish-before-delete", published: true },
    "test-owner",
);
const beforeDelete = structuredClone(created),
    deleteVersion = created.version;
const deletions = await Promise.allSettled(
    ["test-delete-a", "test-delete-b"].map((requestId) =>
        deleteProduct(db, created.id, { requestId, version: deleteVersion }, "test-owner"),
    ),
);
assert.equal(deletions.filter((r) => r.status === "fulfilled").length, 1);
assert.equal(deletions.filter((r) => r.status === "rejected" && r.reason.status === 409).length, 1);
const deleteWinner = deletions[0].status === "fulfilled" ? "test-delete-a" : "test-delete-b";
created = await getProduct(db, created.id);
assert(created.deletedAt);
assert.equal(created.published, false);
assert.deepEqual(created.sizes, beforeDelete.sizes);
assert.deepEqual(created.images, beforeDelete.images);
assert(!(await getCatalog(db)).products.some((p) => p.id === created.id));
assert(!("deletedProducts" in (await getCatalog(db))));
let adminCatalog = await getCatalog(db, true);
assert(!adminCatalog.products.some((p) => p.id === created.id));
assert(adminCatalog.deletedProducts.some((p) => p.id === created.id));
assert.equal(
    renderStore(templates, await getCatalog(db), new URL("http://localhost" + created.path)),
    null,
);
await deleteProduct(
    db,
    created.id,
    { requestId: deleteWinner, version: deleteVersion },
    "test-owner",
);
assert.equal((await events(db)).filter((e) => e.kind === "delete").length, 1);
await assert.rejects(
    () =>
        editProduct(
            db,
            null,
            created.id,
            { ...created, requestId: "test-edit-deleted", published: true },
            "test-owner",
        ),
    (e) => e.status === 409,
);
await assert.rejects(
    () =>
        moveStock(
            db,
            created.id,
            {
                requestId: "test-sell-deleted",
                version: created.version,
                variantId: "black-40",
                kind: "sale",
                quantity: 1,
            },
            "test-owner",
        ),
    (e) => e.status === 409,
);
await assert.rejects(
    () =>
        restoreProduct(
            db,
            created.id,
            { requestId: "test-stale-restore", version: deleteVersion },
            "test-owner",
        ),
    (e) => e.status === 409,
);
const restoreVersion = created.version;
created = await restoreProduct(
    db,
    created.id,
    { requestId: "test-restore-model", version: restoreVersion },
    "test-owner",
);
await restoreProduct(
    db,
    created.id,
    { requestId: "test-restore-model", version: restoreVersion },
    "test-owner",
);
assert(!created.deletedAt);
assert.equal(created.published, false);
assert.equal(created.path, beforeDelete.path);
assert.deepEqual(created.sizes, beforeDelete.sizes);
assert.deepEqual(created.images, beforeDelete.images);
adminCatalog = await getCatalog(db, true);
assert(adminCatalog.products.some((p) => p.id === created.id));
assert(!adminCatalog.deletedProducts.some((p) => p.id === created.id));
assert.equal((await events(db)).filter((e) => e.kind === "restore").length, 1);
created = await editProduct(
    db,
    null,
    created.id,
    { ...created, requestId: "test-republish-restored", published: true },
    "test-owner",
);
assert((await getCatalog(db)).products.some((p) => p.id === created.id));
db.sqlite.close();
console.log(
    JSON.stringify({
        seedIdempotent: true,
        lastUnitConcurrentSaleProtected: true,
        retriesDoNotDoubleDebit: true,
        negativeStockRejected: true,
        staleEditsRejected: true,
        restocking: true,
        categoryAndProductCreation: true,
        colorStockIndependent: true,
        publishingAndHiding: true,
        persistentImageStorage: true,
        unsafeUploadsRejected: true,
        dynamicStorefront: true,
        concurrentDeletionProtected: true,
        deleteAndRestoreIdempotent: true,
        deletedProductsAbsentFromStore: true,
        deletedProductsCannotBeEditedOrSold: true,
        restorationPreservesDataAndHistory: true,
    }),
);
