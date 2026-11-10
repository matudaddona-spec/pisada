// Reglas de validación de productos, talles, imágenes y movimientos.
export class CatalogError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}
export function escapeHtml(value) {
    return String(value ?? "").replace(
        /[&<>"']/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
}
export const plainText = (html) =>
    String(html ?? "")
        .replace(/<br\s*\/?\s*>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
export function slugify(value) {
    return String(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 100);
}
const fail = (message) => {
    throw new CatalogError(message);
};
function limited(value, label, min, max) {
    const s = String(value ?? "").trim();
    if (s.length < min || s.length > max)
        fail(`${label}: completá entre ${min} y ${max} caracteres.`);
    return s;
}
export function operationKey(value) {
    return limited(value, "Identificador de operación", 8, 100);
}
export function versionNumber(value) {
    if (!Number.isInteger(value) || value < 1) fail("Actualizá el producto antes de guardar.");
    return value;
}
export function normalizeProduct(input, categories, previous = null) {
    const name = limited(input.name, "Nombre del modelo", 2, 120);
    const categoryPath = String(input.categoryPath ?? "");
    if (!categories.some((c) => c.path === categoryPath)) fail("Elegí una categoría válida.");
    const price = Number(input.price);
    if (!Number.isFinite(price) || price <= 0 || price > 100000000)
        fail("Ingresá un precio mayor a cero.");
    const rounded = Math.round(price * 100) / 100;
    const description = limited(input.description ?? "", "Descripción", 0, 8000);
    const images = input.images;
    if (!Array.isArray(images) || images.length < 1 || images.length > 10)
        fail("Agregá entre 1 y 10 fotos.");
    const uniqueImages = [...new Set(images.map(String))];
    if (
        uniqueImages.some(
            (p) =>
                !/^\/IMG\/[a-zA-Z0-9_.-]+$/.test(p) &&
                !/^\/media\/images\/[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(p),
        )
    )
        fail("Una de las fotos no pertenece al catálogo.");
    if (!Array.isArray(input.sizes) || input.sizes.length < 1 || input.sizes.length > 100)
        fail("Agregá al menos un talle y hasta 100 combinaciones.");
    const seen = new Set(),
        ids = new Set();
    const sizes = input.sizes.map((v) => {
        const label = limited(v.label, "Talle", 1, 16),
            color = limited(v.color ?? "", "Color", 0, 40);
        const signature = (label + "|" + color).toLocaleLowerCase("es");
        if (seen.has(signature)) fail("Hay una combinación de talle y color repetida.");
        seen.add(signature);
        const stock = Number(v.stock);
        if (!Number.isInteger(stock) || stock < 0 || stock > 1000000)
            fail("El stock debe ser una cantidad entera entre 0 y 1.000.000.");
        const id = String(v.id || crypto.randomUUID());
        if (ids.has(id)) fail("Hay una variante repetida.");
        ids.add(id);
        if (id.length > 100) fail("Variante inválida.");
        const variantPrice = v.price === "" || v.price == null ? rounded : Number(v.price);
        if (!Number.isFinite(variantPrice) || variantPrice <= 0 || variantPrice > 100000000)
            fail("Revisá el precio de cada variante.");
        return {
            id,
            label,
            color,
            stock,
            unlimited: Boolean(v.unlimited),
            price: Math.round(variantPrice * 100) / 100,
            attributes: { Talle: label, ...(color ? { Color: color } : {}) },
        };
    });
    // Color de cada foto: la tienda muestra las fotos del color elegido.
    const colorNames = new Map(
        sizes.filter((s) => s.color).map((s) => [s.color.toLocaleLowerCase("es"), s.color]),
    );
    const imageColors = {};
    const rawColors = input.imageColors && typeof input.imageColors === "object" ? input.imageColors : {};
    for (const src of uniqueImages) {
        const wanted = String(rawColors[src] ?? "").trim();
        if (!wanted) continue;
        const color = colorNames.get(wanted.toLocaleLowerCase("es"));
        if (!color) fail(`La foto marcada como "${wanted}" no coincide con ningún color de los talles.`);
        imageColors[src] = color;
    }
    return {
        name,
        categoryPath,
        price: rounded,
        offerPrice: 0,
        legend: previous?.legend || "Envío a todo el país",
        images: uniqueImages,
        imageColors,
        description,
        descriptionHtml: description
            .split(/\n+/)
            .map((p) => `<p>${escapeHtml(p)}</p>`)
            .join(""),
        sizes,
        published: input.published !== false,
    };
}
export function stockChange(product, input) {
    const variant = product.sizes.find((v) => String(v.id) === String(input.variantId));
    if (!variant) fail("La combinación seleccionada ya no existe.");
    if (variant.unlimited)
        fail("Primero desactivá el stock sin límite desde la edición del producto.");
    const quantity = Number(input.quantity),
        kind = input.kind;
    if (!["sale", "received", "adjust"].includes(kind)) fail("Elegí el tipo de movimiento.");
    if (
        !Number.isInteger(quantity) ||
        quantity < 0 ||
        quantity > 1000000 ||
        (kind !== "adjust" && quantity === 0)
    )
        fail("Ingresá una cantidad entera válida.");
    const reason = limited(input.reason ?? "", "Referencia", kind === "adjust" ? 3 : 0, 240);
    const before = Number(variant.stock),
        after =
            kind === "sale"
                ? before - quantity
                : kind === "received"
                  ? before + quantity
                  : quantity;
    if (after < 0)
        throw new CatalogError(
            "No hay suficientes pares disponibles para registrar esa venta.",
            409,
        );
    if (after > 1000000) fail("La cantidad resultante supera el límite permitido.");
    const next = {
        ...product,
        sizes: product.sizes.map((v) =>
            String(v.id) === String(variant.id) ? { ...v, stock: after } : v,
        ),
    };
    return {
        next,
        details: {
            name: product.name,
            variantId: variant.id,
            talle: variant.label,
            color: variant.color || "",
            before,
            after,
            quantity,
            reason,
        },
    };
}
export function productChanges(before, after) {
    const changes = [];
    for (const s of after.sizes) {
        const old = before?.sizes.find((v) => String(v.id) === String(s.id));
        if (!old || old.stock !== s.stock || old.unlimited !== s.unlimited)
            changes.push({
                talle: s.label,
                color: s.color || "",
                before: old?.stock ?? 0,
                after: s.stock,
            });
    }
    for (const s of before?.sizes || [])
        if (!after.sizes.some((v) => String(v.id) === String(s.id)))
            changes.push({
                talle: s.label,
                color: s.color || "",
                before: s.stock,
                after: 0,
                removed: true,
            });
    return changes;
}
// Fotos para mostrar de un color: las marcadas con ese color y las que sirven para todos.
export function imagesForColor(product, color) {
    const tags = product.imageColors || {};
    const chosen = product.images.filter((src) => !tags[src] || tags[src] === color);
    return chosen.length ? chosen : product.images;
}
export function firstVariant(product) {
    return (
        product.sizes.find((s) => s.unlimited || Number(s.stock) > 0) || product.sizes[0] || {}
    );
}
export function measurementMap(product) {
    const text = plainText(product.descriptionHtml).replace(/\n/g, " ");
    return new Map(
        [...text.matchAll(/\b(\d{2})\s*=\s*(\d+(?:[.,]\d+)?)\s*cm/gi)].map((m) => [
            m[1],
            m[2].replace(".", ","),
        ]),
    );
}
