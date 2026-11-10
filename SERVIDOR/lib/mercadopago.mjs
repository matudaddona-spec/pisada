// Cobro con Mercado Pago (Checkout Pro): crea el link de pago y verifica los pagos con la API.
// La clave (Access Token) se configura en SERVIDOR/.dev.vars como MP_ACCESS_TOKEN y nunca llega al navegador.
import { CatalogError } from "./catalog-domain.mjs";
import { PAYMENT_METHODS, markPaid, setStatus } from "./orders.mjs";

const API = "https://api.mercadopago.com";

async function call(token, path, options = {}, fetchImpl = fetch) {
    if (!token)
        throw new CatalogError(
            "El pago con Mercado Pago todavía no está configurado. Elegí transferencia o avisale a la tienda.",
            503,
        );
    const response = await fetchImpl(API + path, {
        ...options,
        headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
            ...options.headers,
        },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        console.error("Mercado Pago respondió", response.status, data?.message || data?.error);
        throw new CatalogError(
            response.status === 401
                ? "La clave de Mercado Pago no es válida. Revisá MP_ACCESS_TOKEN."
                : "Mercado Pago no respondió. Volvé a intentar en unos segundos.",
            502,
        );
    }
    return data;
}

// Arma la preferencia de pago y devuelve el link al que va el comprador.
export async function createPreference(token, order, origin, fetchImpl = fetch) {
    const method = PAYMENT_METHODS[order.method];
    const secure = origin.startsWith("https://");
    const back = `${origin}/pedido/${order.token}`;
    const items = order.items.map((i) => ({
        id: i.variantId,
        title: `${i.name} · Talle ${i.size}${i.color ? " · " + i.color : ""}`,
        quantity: i.qty,
        unit_price: i.unitPrice,
        currency_id: "ARS",
        ...(secure ? { picture_url: origin + i.image } : {}),
    }));
    if (order.shipping)
        items.push({ id: "envio", title: "Envío a domicilio", quantity: 1, unit_price: order.shipping, currency_id: "ARS" });
    const excludedTypes = [{ id: "ticket" }, { id: "atm" }];
    const body = {
        items,
        payer: { name: order.customer.name, email: order.customer.email },
        external_reference: order.token,
        statement_descriptor: "PISADA",
        back_urls: { success: back, pending: back, failure: back },
        ...(secure ? { auto_return: "approved", notification_url: `${origin}/api/pagos/mercadopago` } : {}),
        payment_methods:
            order.method === "tarjeta"
                ? // Mercado Pago no permite ocultar el dinero en cuenta; con tarjeta se habilitan las cuotas.
                  { excluded_payment_types: excludedTypes, installments: method.installments }
                : { excluded_payment_types: excludedTypes, installments: 1 },
        metadata: { pedido: order.id },
    };
    const data = await call(
        token,
        "/checkout/preferences",
        { method: "POST", body: JSON.stringify(body), headers: { "X-Idempotency-Key": "pref-" + order.token } },
        fetchImpl,
    );
    const link = token.startsWith("TEST-") ? data.sandbox_init_point || data.init_point : data.init_point;
    if (!link) throw new CatalogError("Mercado Pago no devolvió el link de pago.", 502);
    return { preferenceId: data.id, link };
}

export function getPayment(token, paymentId, fetchImpl = fetch) {
    if (!/^\d{1,30}$/.test(String(paymentId))) throw new CatalogError("Pago inválido.");
    return call(token, "/v1/payments/" + paymentId, {}, fetchImpl);
}

// Busca en Mercado Pago los pagos de un pedido, por si el comprador no volvió a la tienda.
export async function syncOrder(db, token, order, fetchImpl = fetch) {
    if (!["esperando_pago", "rechazado"].includes(order.status)) return order;
    const data = await call(
        token,
        "/v1/payments/search?sort=date_created&criteria=desc&limit=10&external_reference=" +
            encodeURIComponent(order.token),
        {},
        fetchImpl,
    );
    const results = data.results || [];
    const approved = results.find((p) => p.status === "approved" && p.external_reference === order.token);
    const latest = approved || results.find((p) => p.external_reference === order.token);
    return latest ? applyPayment(db, token, order, String(latest.id), fetchImpl) : order;
}

// Consulta el pago en Mercado Pago (nunca confía en lo que dice la URL) y actualiza el pedido.
export async function applyPayment(db, token, order, paymentId, fetchImpl = fetch) {
    if (!/^\d{1,30}$/.test(String(paymentId))) return order;
    const payment = await getPayment(token, paymentId, fetchImpl);
    if (payment.external_reference !== order.token) return order;
    if (payment.status === "approved") {
        const paid = Number(payment.transaction_amount);
        if (payment.currency_id !== "ARS" || Math.abs(paid - order.total) > 0.5)
            return setStatus(db, order, "rechazado", String(payment.id));
        return markPaid(db, order, {
            actor: "Mercado Pago",
            paymentId: String(payment.id),
            note: `${payment.payment_method_id || ""} ${payment.installments > 1 ? payment.installments + " cuotas" : ""}`.trim(),
        });
    }
    if (["rejected", "cancelled"].includes(payment.status))
        return setStatus(db, order, "rechazado", String(payment.id));
    return order;
}
