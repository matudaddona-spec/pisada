// Pruebas de pedidos y pagos. Mercado Pago se simula: no se hace ningún cobro.
import assert from "node:assert/strict";
import { LocalD1 } from "./local-d1.mjs";
import { bootstrap, getProduct, moveStock } from "../lib/inventory-service.mjs";
import { createOrder, getOrder, markPaid, setStatus, quoteOrder, SHIPPING_COST } from "../lib/orders.mjs";
import { createPreference, applyPayment, syncOrder } from "../lib/mercadopago.mjs";
import { orderPage } from "../lib/order-page.mjs";

const db = new LocalD1();
await bootstrap(db);
let jordan = await getProduct(db, 2034);
// Deja 8 pares del talle de prueba para no depender del stock de la semilla.
jordan = await moveStock(db, 2034, { requestId: "prueba-stock-10", version: jordan.version, variantId: jordan.sizes.find((s) => s.color === "Azul").id, kind: "adjust", quantity: 8, reason: "Stock de prueba" }, "test");
const azul = jordan.sizes.find((s) => s.color === "Azul" && s.stock === 8);
const customer = { name: "Ana Pérez", email: "ana@example.com", phone: "11 2345 6789", address: "Av. Siempre Viva 742", city: "CABA", zip: "1414" };
const base = { method: "tarjeta", delivery: "envio", customer, items: [{ id: 2034, variantId: azul.id, qty: 1 }] };

// El precio lo pone el servidor, aunque el navegador mande otro.
const q1 = await quoteOrder(db, { ...base, items: [{ ...base.items[0], price: 1 }] });
assert.equal(q1.subtotal, azul.price);
assert.equal(q1.shipping, SHIPPING_COST);
assert.equal(q1.total, azul.price + SHIPPING_COST);
assert.equal(q1.items[0].color, "Azul");
assert.match(q1.items[0].image, /pisada-34-azul/);

// Transferencia: 10% de descuento. Dos pares: envío gratis.
const q2 = await quoteOrder(db, { ...base, method: "transferencia", items: [{ ...base.items[0], qty: 2 }] });
assert.equal(q2.discount, Math.round(azul.price * 2 * 0.1 * 100) / 100);
assert.equal(q2.shipping, 0);
assert.equal(q2.total, azul.price * 2 - q2.discount);

// Datos o carrito inválidos se rechazan.
await assert.rejects(() => quoteOrder(db, { ...base, method: "efectivo" }));
await assert.rejects(() => quoteOrder(db, { ...base, customer: { ...customer, email: "no-es-correo" } }));
await assert.rejects(() => quoteOrder(db, { ...base, items: [] }));
await assert.rejects(() => quoteOrder(db, { ...base, items: [{ id: 2034, variantId: "999", qty: 1 }] }));
await assert.rejects(() => quoteOrder(db, { ...base, items: [{ ...base.items[0], qty: azul.stock + 1 }] }), /quedan/);
await assert.rejects(() => quoteOrder(db, { ...base, delivery: "envio", customer: { ...customer, address: "" } }));

// Mercado Pago simulado.
const payments = new Map();
const calls = [];
const fakeMP = async (url, options = {}) => {
    calls.push({ url, options });
    if (!String(options.headers?.Authorization).endsWith("TEST-token"))
        return new Response(JSON.stringify({ message: "invalid token" }), { status: 401 });
    if (url.endsWith("/checkout/preferences"))
        return Response.json({ id: "pref-1", init_point: "https://mp/real", sandbox_init_point: "https://mp/sandbox" });
    if (url.includes("/v1/payments/search")) {
        const ref = new URL(url).searchParams.get("external_reference");
        return Response.json({ results: [...payments.values()].filter((p) => p.external_reference === ref) });
    }
    const id = url.split("/").pop();
    return payments.has(id) ? Response.json(payments.get(id)) : new Response("{}", { status: 404 });
};

// Pedido con tarjeta: arma el link con cuotas, sin dinero en cuenta, y apunta al pedido.
const order = await createOrder(db, base);
assert.equal(order.status, "esperando_pago");
const pref = await createPreference("TEST-token", order, "https://pisada.com.ar", fakeMP);
assert.equal(pref.link, "https://mp/sandbox");
const sent = JSON.parse(calls.at(-1).options.body);
assert.equal(sent.external_reference, order.token);
assert.equal(sent.payment_methods.installments, 3);
assert.equal(sent.payment_methods.excluded_payment_methods, undefined, "Mercado Pago no deja excluir el dinero en cuenta");
assert.equal(sent.items.reduce((n, i) => n + i.unit_price * i.quantity, 0), order.total);
assert.equal(sent.back_urls.success, `https://pisada.com.ar/pedido/${order.token}`);
assert.equal(sent.notification_url, "https://pisada.com.ar/api/pagos/mercadopago");
await assert.rejects(() => createPreference("", order, "https://x", fakeMP), /no está configurado/);
await assert.rejects(() => createPreference("TEST-otra", order, "https://x", fakeMP), /no es válida/);
// En la compu (http) no manda avisos automáticos ni vuelta automática.
await createPreference("TEST-token", order, "http://localhost:5173", fakeMP);
assert.equal(JSON.parse(calls.at(-1).options.body).notification_url, undefined);

// Un pago de otro pedido o por otro monto no marca el pedido como pagado.
payments.set("100", { id: 100, status: "approved", external_reference: "otro", transaction_amount: order.total, currency_id: "ARS" });
assert.equal((await applyPayment(db, "TEST-token", order, "100", fakeMP)).status, "esperando_pago");
payments.set("101", { id: 101, status: "approved", external_reference: order.token, transaction_amount: 10, currency_id: "ARS" });
assert.equal((await applyPayment(db, "TEST-token", order, "101", fakeMP)).status, "rechazado");

// Pago aprobado: queda pagado y descuenta el stock una sola vez.
const before = azul.stock;
payments.set("102", { id: 102, status: "approved", external_reference: order.token, transaction_amount: order.total, currency_id: "ARS", payment_method_id: "visa", installments: 3 });
let paid = await applyPayment(db, "TEST-token", await getOrder(db, order.token), "102", fakeMP);
assert.equal(paid.status, "pagado");
assert.equal(paid.paymentId, "102");
paid = await applyPayment(db, "TEST-token", paid, "102", fakeMP);
await markPaid(db, paid, { actor: "otra vez" });
const stockAfter = (await getProduct(db, 2034)).sizes.find((s) => s.id === azul.id).stock;
assert.equal(stockAfter, before - 1, "el stock baja una sola vez");
// Un rechazo que llega tarde no deshace un pago.
payments.set("103", { id: 103, status: "rejected", external_reference: order.token });
assert.equal((await applyPayment(db, "TEST-token", paid, "103", fakeMP)).status, "pagado");

// Si el comprador pagó pero no volvió a la tienda, el pedido se encuentra buscando en Mercado Pago.
const lost = await createOrder(db, { ...base, method: "mercadopago" });
assert.equal((await syncOrder(db, "TEST-token", lost, fakeMP)).status, "esperando_pago", "sin pagos sigue esperando");
payments.set("200", { id: 200, status: "approved", external_reference: lost.token, transaction_amount: lost.total, currency_id: "ARS" });
assert.equal((await syncOrder(db, "TEST-token", lost, fakeMP)).status, "pagado");

// Transferencia: queda reservada hasta que el dueño confirma; ahí baja el stock.
const transfer = await createOrder(db, { ...base, method: "transferencia" });
assert.equal(transfer.status, "esperando_transferencia");
assert.equal((await getProduct(db, 2034)).sizes.find((s) => s.id === azul.id).stock, before - 2);
const confirmed = await markPaid(db, transfer, { actor: "dueño" });
assert.equal(confirmed.status, "pagado");
assert.equal((await getProduct(db, 2034)).sizes.find((s) => s.id === azul.id).stock, before - 3);
const cancelled = await setStatus(db, await createOrder(db, { ...base, method: "transferencia" }), "cancelado");
assert.equal(cancelled.status, "cancelado");
assert.equal((await setStatus(db, confirmed, "cancelado")).status, "pagado", "un pedido pagado no se cancela solo");

// Página del pedido: datos de transferencia y nada de código inyectado.
const evil = await createOrder(db, { ...base, method: "transferencia", customer: { ...customer, name: "<script>alert(1)</script>" } });
const html = orderPage(evil, { bank: { alias: "MI.ALIAS", cbu: "123", holder: "Yo", bank: "Banco" }, whatsapp: "5491100000000" });
assert(html.includes("MI.ALIAS"));
assert(!html.includes("<script>alert(1)"));
assert(html.includes('localStorage.removeItem("pisada-carrito")'));
assert.equal(await getOrder(db, "no-existe"), null);

console.log(JSON.stringify({ serverPrices: true, transferDiscount: true, mercadoPagoLink: true, paymentVerified: true, stockOnce: true, transferConfirm: true, orderPageSafe: true }));
