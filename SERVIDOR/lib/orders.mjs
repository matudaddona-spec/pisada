// Pedidos de la tienda: precios calculados en el servidor, formas de pago y descuento de stock.
import { CatalogError } from "./catalog-domain.mjs";
import { getProduct, moveStock } from "./inventory-service.mjs";
import { imagesForColor } from "./catalog-domain.mjs";

export const SHIPPING_COST = 9900;
export const FREE_SHIPPING_FROM = 2; // pares
export const PAYMENT_METHODS = {
    tarjeta: {
        label: "Tarjeta de crédito o débito",
        detail: "Hasta 3 cuotas sin interés · Pago seguro con Mercado Pago",
        discount: 0,
        installments: 3,
        mercadoPago: true,
    },
    mercadopago: {
        label: "Mercado Pago",
        detail: "Pagá con el dinero de tu cuenta o tus tarjetas guardadas",
        discount: 0,
        mercadoPago: true,
    },
    transferencia: {
        label: "Transferencia bancaria",
        detail: "10% OFF · Te mostramos el alias al confirmar",
        discount: 0.1,
    },
};
export const ORDER_STATUS = {
    esperando_pago: "Esperando el pago",
    esperando_transferencia: "Esperando la transferencia",
    pagado: "Pagado",
    rechazado: "Pago rechazado",
    cancelado: "Cancelado",
};

const fail = (message, status = 400) => {
    throw new CatalogError(message, status);
};
const text = (value, label, min, max) => {
    const s = String(value ?? "").trim();
    if (s.length < min || s.length > max) fail(`Revisá ${label}.`);
    return s;
};
const round = (n) => Math.round(n * 100) / 100;
const colorOf = (s) => s.color || s.attributes?.Color || "";

let tableReady = null;
export function ensureOrdersTable(db) {
    tableReady ??= db
        .prepare(
            "CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT NOT NULL UNIQUE, status TEXT NOT NULL, method TEXT NOT NULL, total REAL NOT NULL, data TEXT NOT NULL, payment_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
        )
        .bind()
        .run()
        .catch((error) => {
            tableReady = null;
            throw error;
        });
    return tableReady;
}

// Valida el carrito contra el catálogo actual y calcula el total con precios del servidor.
export async function quoteOrder(db, input) {
    const method = String(input?.method ?? "");
    const payment = PAYMENT_METHODS[method];
    if (!payment) fail("Elegí una forma de pago.");
    const delivery = input?.delivery === "retiro" ? "retiro" : "envio";
    const c = input?.customer || {};
    const customer = {
        name: text(c.name, "tu nombre y apellido", 3, 80),
        email: text(c.email, "tu correo", 6, 120).toLowerCase(),
        phone: text(c.phone, "tu teléfono", 6, 30),
    };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(customer.email)) fail("Revisá tu correo.");
    if (customer.phone.replace(/\D/g, "").length < 8) fail("Revisá tu teléfono.");
    if (delivery === "envio") {
        customer.address = text(c.address, "la calle y el número", 3, 120);
        customer.city = text(c.city, "la localidad", 2, 80);
        customer.zip = text(c.zip, "el código postal", 4, 8);
    }
    const lines = Array.isArray(input?.items) ? input.items : [];
    if (!lines.length) fail("Tu carrito está vacío.");
    if (lines.length > 20) fail("El pedido tiene demasiados productos.");
    const wanted = new Map();
    for (const line of lines) {
        const qty = Number(line?.qty);
        if (!Number.isInteger(qty) || qty < 1 || qty > 10) fail("Revisá las cantidades del carrito.");
        const key = Number(line.id) + "|" + String(line.variantId);
        wanted.set(key, (wanted.get(key) || 0) + qty);
    }
    const items = [];
    for (const [key, qty] of wanted) {
        const [id, variantId] = key.split("|");
        const product = await getProduct(db, Number(id));
        if (!product || product.deletedAt || !product.published)
            fail("Uno de los modelos del carrito ya no está disponible. Quitalo y volvé a intentar.", 409);
        const variant = product.sizes.find((s) => String(s.id) === variantId);
        if (!variant) fail(`El talle elegido de ${product.name} ya no existe.`, 409);
        if (!variant.unlimited && Number(variant.stock) < qty)
            fail(
                `De ${product.name} talle ${variant.label} quedan ${variant.stock} pares. Ajustá el carrito.`,
                409,
            );
        const color = colorOf(variant);
        items.push({
            productId: product.id,
            variantId: String(variant.id),
            name: product.name,
            path: product.path,
            size: variant.label,
            color,
            qty,
            unitPrice: round(Number(variant.price || product.offerPrice || product.price)),
            image: imagesForColor(product, color)[0] || product.images[0],
        });
    }
    const pairs = items.reduce((n, i) => n + i.qty, 0);
    const subtotal = round(items.reduce((n, i) => n + i.unitPrice * i.qty, 0));
    const discount = round(subtotal * payment.discount);
    const shipping = delivery === "retiro" || pairs >= FREE_SHIPPING_FROM ? 0 : SHIPPING_COST;
    return {
        method,
        delivery,
        customer,
        items,
        pairs,
        subtotal,
        discount,
        shipping,
        total: round(subtotal - discount + shipping),
    };
}

const unpack = (row) =>
    row && {
        ...JSON.parse(row.data),
        id: row.id,
        token: row.token,
        status: row.status,
        method: row.method,
        total: row.total,
        paymentId: row.payment_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };

export async function createOrder(db, input) {
    await ensureOrdersTable(db);
    const quote = await quoteOrder(db, input);
    const token = crypto.randomUUID().replace(/-/g, "");
    const now = new Date().toISOString();
    const status = PAYMENT_METHODS[quote.method].mercadoPago ? "esperando_pago" : "esperando_transferencia";
    await db
        .prepare(
            "INSERT INTO orders(token,status,method,total,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
        )
        .bind(token, status, quote.method, quote.total, JSON.stringify(quote), now, now)
        .run();
    return getOrder(db, token);
}
export async function getOrder(db, token) {
    await ensureOrdersTable(db);
    if (!/^[a-f0-9]{32}$/.test(String(token))) return null;
    return unpack(await db.prepare("SELECT * FROM orders WHERE token=?").bind(token).first());
}
export async function getOrderById(db, id) {
    await ensureOrdersTable(db);
    return unpack(await db.prepare("SELECT * FROM orders WHERE id=?").bind(id).first());
}
export async function listOrders(db) {
    await ensureOrdersTable(db);
    return (await db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 100").all()).results.map(
        unpack,
    );
}

async function setData(db, order, changes) {
    const next = { ...order, ...changes };
    const { id, token, status, method, total, paymentId, createdAt, updatedAt, ...data } = next;
    await db
        .prepare("UPDATE orders SET data=?,updated_at=? WHERE id=?")
        .bind(JSON.stringify(data), new Date().toISOString(), order.id)
        .run();
}

// Descuenta el stock de cada par vendido. Cada línea usa una clave fija, así que repetirlo no descuenta dos veces.
async function takeStock(db, order, actor) {
    const problems = [];
    for (const [i, item] of order.items.entries()) {
        for (let attempt = 0; attempt < 3; attempt++) {
            const product = await getProduct(db, item.productId);
            const variant = product?.sizes.find((s) => String(s.id) === item.variantId);
            if (!product || product.deletedAt || !variant) {
                problems.push(`${item.name} talle ${item.size}: el modelo ya no existe`);
                break;
            }
            if (variant.unlimited) break;
            try {
                await moveStock(
                    db,
                    product.id,
                    {
                        requestId: `pedido-${order.token}-${i}`,
                        version: product.version,
                        variantId: variant.id,
                        kind: "sale",
                        quantity: item.qty,
                        reason: `Pedido #${order.id}`,
                    },
                    actor,
                );
                break;
            } catch (error) {
                if (error?.status === 409 && /otra edición/i.test(error.message) && attempt < 2) continue;
                problems.push(`${item.name} talle ${item.size}: ${error.message}`);
                break;
            }
        }
    }
    return problems;
}

// Marca el pedido como pagado una sola vez y descuenta el stock.
export async function markPaid(db, order, { actor, paymentId = null, note = "" } = {}) {
    const now = new Date().toISOString();
    const claimed = await db
        .prepare(
            "UPDATE orders SET status='pagado',payment_id=COALESCE(?,payment_id),updated_at=? WHERE id=? AND status IN ('esperando_pago','esperando_transferencia','rechazado')",
        )
        .bind(paymentId, now, order.id)
        .run();
    const fresh = await getOrderById(db, order.id);
    if (!claimed.meta?.changes) return fresh;
    const problems = await takeStock(db, fresh, actor);
    await setData(db, fresh, {
        paidAt: now,
        paidBy: actor,
        ...(note ? { paymentNote: note } : {}),
        ...(problems.length ? { stockProblems: problems } : {}),
    });
    return getOrderById(db, order.id);
}
export async function setStatus(db, order, status, paymentId = null) {
    if (!["rechazado", "cancelado", "esperando_pago"].includes(status)) fail("Estado inválido.");
    await db
        .prepare(
            "UPDATE orders SET status=?,payment_id=COALESCE(?,payment_id),updated_at=? WHERE id=? AND status!='pagado'",
        )
        .bind(status, paymentId, new Date().toISOString(), order.id)
        .run();
    return getOrderById(db, order.id);
}
