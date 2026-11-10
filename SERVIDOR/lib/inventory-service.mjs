// Persistencia del catálogo y del inventario en D1, con imágenes nuevas en R2.
import seed from "../data/catalog-seed.json" with { type: "json" };
import {
    CatalogError,
    normalizeProduct,
    operationKey,
    versionNumber,
    stockChange,
    productChanges,
    plainText,
    slugify,
} from "./catalog-domain.mjs";

const seedImages = new Set(seed.products.flatMap((p) => p.images));
const now = () => new Date().toISOString();
const unpack = (r) => {
    if (!r) return null;
    const p = JSON.parse(r.data);
    return {
        ...p,
        id: r.id,
        path: r.path,
        published: Boolean(r.published),
        version: r.version,
        order: r.sort_order,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
    };
};
export async function getProduct(db, id) {
    return unpack(await db.prepare("SELECT * FROM catalog_products WHERE id=?").bind(id).first());
}
export async function getCatalog(db, admin = false) {
    const initialized = await db
        .prepare("SELECT value FROM catalog_meta WHERE key='initialized'")
        .first();
    if (!initialized)
        return {
            ...seed,
            products: seed.products.map((p) => ({ ...p, published: true, version: 0 })),
            needsSetup: true,
        };
    const cats = (
        await db.prepare("SELECT path,name FROM catalog_categories ORDER BY sort_order,name").all()
    ).results;
    const rows = (
        await db
            .prepare(
                "SELECT * FROM catalog_products " +
                    (admin ? "" : "WHERE published=1 ") +
                    "ORDER BY sort_order DESC,id DESC",
            )
            .all()
    ).results;
    const all = rows.map(unpack),
        products = all.filter((p) => !p.deletedAt),
        categories = cats.map((c) => ({
            ...c,
            productIds: products.filter((p) => p.categoryPath === c.path).map((p) => p.id),
        }));
    return {
        categories,
        products,
        ...(admin ? { deletedProducts: all.filter((p) => p.deletedAt) } : {}),
        homeProductIds: products.slice(0, 12).map((p) => p.id),
        assets: seed.assets,
        needsSetup: false,
    };
}
export async function bootstrap(db) {
    if (await db.prepare("SELECT value FROM catalog_meta WHERE key='initialized'").first())
        return { initialized: true };
    const timestamp = now(),
        statements = [];
    for (let i = 0; i < seed.categories.length; i++) {
        const c = seed.categories[i];
        statements.push(
            db
                .prepare(
                    "INSERT OR IGNORE INTO catalog_categories(path,name,sort_order) VALUES(?,?,?)",
                )
                .bind(c.path, c.name, i),
        );
    }
    for (const original of seed.products) {
        const p = {
            ...original,
            description: plainText(original.descriptionHtml),
            sizes: original.sizes.map((v) => ({
                ...v,
                id: String(v.id),
                color: v.attributes?.Color || "",
            })),
        };
        statements.push(
            db
                .prepare(
                    "INSERT OR IGNORE INTO catalog_products(id,path,create_key,data,published,version,sort_order,last_operation,created_at,updated_at) VALUES(?,?,?,?,1,1,?,?,?,?)",
                )
                .bind(
                    p.id,
                    p.path,
                    "seed:" + p.id,
                    JSON.stringify(p),
                    p.order,
                    "seed:" + p.id,
                    timestamp,
                    timestamp,
                ),
        );
    }
    for (let i = 0; i < statements.length; i += 40) await db.batch(statements.slice(i, i + 40));
    await db
        .prepare("INSERT OR IGNORE INTO catalog_meta(key,value) VALUES('initialized',?)")
        .bind(timestamp)
        .run();
    return { initialized: true, products: seed.products.length };
}
export async function events(db) {
    const rows = (
        await db.prepare("SELECT * FROM inventory_events ORDER BY created_at DESC LIMIT 60").all()
    ).results;
    return rows.map((r) => ({
        operationId: r.operation_id,
        productId: r.product_id,
        kind: r.kind,
        actor: r.actor,
        createdAt: r.created_at,
        details: JSON.parse(r.details),
    }));
}
export async function createCategory(db, input) {
    const name = String(input.name ?? "").trim();
    if (name.length < 2 || name.length > 70)
        throw new CatalogError("La categoría debe tener entre 2 y 70 caracteres.");
    const slug = slugify(name);
    if (!slug) throw new CatalogError("Revisá el nombre de la categoría.");
    if (
        [
            "admin",
            "api",
            "media",
            "assets",
            "css",
            "js",
            "img",
            "productos",
            "search",
            "signin-with-chatgpt",
            "signout",
        ].includes(slug)
    )
        throw new CatalogError(
            "Ese nombre está reservado para una sección de la tienda. Elegí otro.",
        );
    const path = "/" + slug;
    if (
        await db
            .prepare("SELECT path FROM catalog_categories WHERE path=? OR lower(name)=lower(?)")
            .bind(path, name)
            .first()
    )
        throw new CatalogError("Esa categoría ya existe.", 409);
    await db
        .prepare(
            "INSERT INTO catalog_categories(path,name,sort_order) VALUES(?,?,(SELECT COALESCE(MAX(sort_order),0)+1 FROM catalog_categories))",
        )
        .bind(path, name)
        .run();
    return { path, name };
}
async function validateImages(images, bucket) {
    for (const image of images) {
        if (seedImages.has(image)) continue;
        if (
            !image.startsWith("/media/images/") ||
            !bucket ||
            !(await bucket.head(image.slice("/media/".length)))
        )
            throw new CatalogError("Una foto no está disponible. Volvé a subirla.");
    }
}
async function existingOperation(db, key, id) {
    const row = await db
        .prepare("SELECT product_id FROM inventory_events WHERE operation_id=?")
        .bind(key)
        .first();
    if (!row) return null;
    if (id && row.product_id !== id)
        throw new CatalogError("Esta operación ya pertenece a otro producto.", 409);
    return getProduct(db, row.product_id);
}
export async function createProduct(db, bucket, input, actor) {
    const key = operationKey(input.requestId),
        old = await db
            .prepare("SELECT * FROM catalog_products WHERE create_key=?")
            .bind(key)
            .first();
    if (old) return unpack(old);
    const { categories } = await getCatalog(db, true),
        p = normalizeProduct(input, categories);
    await validateImages(p.images, bucket);
    let path = p.categoryPath + "/" + (slugify(p.name) || "modelo");
    if (await db.prepare("SELECT id FROM catalog_products WHERE path=?").bind(path).first())
        path += "-" + crypto.randomUUID().slice(0, 6);
    const timestamp = now(),
        details = JSON.stringify({ name: p.name, changes: productChanges(null, p) });
    await db.batch([
        db
            .prepare(
                "INSERT OR IGNORE INTO catalog_products(path,create_key,data,published,version,sort_order,last_operation,created_at,updated_at) VALUES(?,?,?,?,1,(SELECT COALESCE(MAX(sort_order),0)+1 FROM catalog_products),?,?,?)",
            )
            .bind(path, key, JSON.stringify(p), p.published ? 1 : 0, key, timestamp, timestamp),
        db
            .prepare(
                "INSERT OR IGNORE INTO inventory_events(operation_id,product_id,kind,actor,details,created_at) SELECT ?,id,'create',?,?,? FROM catalog_products WHERE create_key=?",
            )
            .bind(key, actor, details, timestamp, key),
    ]);
    const row = await db
        .prepare("SELECT * FROM catalog_products WHERE create_key=?")
        .bind(key)
        .first();
    if (!row) throw new CatalogError("No se pudo crear el modelo. Volvé a intentar.", 409);
    return unpack(row);
}
async function commit(db, id, expected, key, next, kind, actor, details) {
    const timestamp = now();
    let result;
    try {
        result = await db.batch([
            db
                .prepare(
                    "UPDATE catalog_products SET data=?,published=?,version=version+1,last_operation=?,updated_at=? WHERE id=? AND version=?",
                )
                .bind(
                    JSON.stringify(next),
                    next.published === false ? 0 : 1,
                    key,
                    timestamp,
                    id,
                    expected,
                ),
            db
                .prepare(
                    "INSERT INTO inventory_events(operation_id,product_id,kind,actor,details,created_at) SELECT ?,id,?,?,?,? FROM catalog_products WHERE id=? AND last_operation=? AND version=?",
                )
                .bind(key, kind, actor, JSON.stringify(details), timestamp, id, key, expected + 1),
        ]);
    } catch (error) {
        const done = await existingOperation(db, key, id);
        if (done) return done;
        throw error;
    }
    if (!result[0].meta?.changes)
        throw new CatalogError(
            "Otra edición cambió este producto. Recargá sus datos antes de guardar.",
            409,
        );
    return getProduct(db, id);
}
export async function editProduct(db, bucket, id, input, actor) {
    const key = operationKey(input.requestId),
        done = await existingOperation(db, key, id);
    if (done) return done;
    const old = await getProduct(db, id);
    if (!old) throw new CatalogError("El modelo no existe.", 404);
    if (old.deletedAt)
        throw new CatalogError(
            "Este producto está en la Papelera. Restauralo antes de editarlo.",
            409,
        );
    const expected = versionNumber(input.version);
    const { categories } = await getCatalog(db, true),
        p = normalizeProduct(input, categories, old);
    await validateImages(p.images, bucket);
    const next = { ...p, order: old.order };
    return commit(db, id, expected, key, next, "edit", actor, {
        name: p.name,
        changes: productChanges(old, p),
        published: p.published,
    });
}
export async function moveStock(db, id, input, actor) {
    const key = operationKey(input.requestId),
        done = await existingOperation(db, key, id);
    if (done) return done;
    const old = await getProduct(db, id);
    if (!old) throw new CatalogError("El modelo no existe.", 404);
    if (old.deletedAt)
        throw new CatalogError(
            "Este producto está en la Papelera. Restauralo antes de modificar el stock.",
            409,
        );
    const expected = versionNumber(input.version),
        { next, details } = stockChange(old, input);
    return commit(db, id, expected, key, next, input.kind, actor, details);
}
export async function deleteProduct(db, id, input, actor) {
    const key = operationKey(input.requestId),
        done = await existingOperation(db, key, id);
    if (done) return done;
    const old = await getProduct(db, id);
    if (!old) throw new CatalogError("El modelo no existe.", 404);
    if (old.deletedAt) throw new CatalogError("El producto ya está en la Papelera.", 409);
    const expected = versionNumber(input.version),
        next = { ...old, published: false, deletedAt: now() };
    return commit(db, id, expected, key, next, "delete", actor, {
        name: old.name,
        note: "Producto enviado a la Papelera. Se conservan sus fotos, talles y movimientos.",
    });
}
export async function restoreProduct(db, id, input, actor) {
    const key = operationKey(input.requestId),
        done = await existingOperation(db, key, id);
    if (done) return done;
    const old = await getProduct(db, id);
    if (!old) throw new CatalogError("El modelo no existe.", 404);
    if (!old.deletedAt) throw new CatalogError("El producto ya fue restaurado.", 409);
    const expected = versionNumber(input.version),
        next = { ...old, published: false };
    delete next.deletedAt;
    return commit(db, id, expected, key, next, "restore", actor, {
        name: old.name,
        note: "Producto restaurado como oculto. Podés publicarlo desde Editar.",
    });
}
export async function uploadImage(file, bucket) {
    if (
        !file ||
        typeof file.arrayBuffer !== "function" ||
        file.size === 0 ||
        file.size > 8 * 1024 * 1024
    )
        throw new CatalogError("Subí una foto JPG, PNG o WebP de hasta 8 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    let mime, extension;
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
        mime = "image/jpeg";
        extension = "jpg";
    } else if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) {
        mime = "image/png";
        extension = "png";
    } else if (
        String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
        String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    ) {
        mime = "image/webp";
        extension = "webp";
    } else throw new CatalogError("El archivo no es una imagen JPG, PNG o WebP válida.");
    const key = "images/" + crypto.randomUUID() + "." + extension;
    await bucket.put(key, bytes, {
        httpMetadata: { contentType: mime, cacheControl: "public, max-age=31536000, immutable" },
    });
    return { url: "/media/" + key };
}
