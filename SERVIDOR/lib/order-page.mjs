// Página de seguimiento del pedido: estado del pago, detalle y datos para transferir.
import { escapeHtml as e } from "./catalog-domain.mjs";
import { ORDER_STATUS, PAYMENT_METHODS } from "./orders.mjs";

const money = (n) =>
    "$" + Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const titles = {
    pagado: ["¡Listo, tu compra está paga!", "Te escribimos al WhatsApp para coordinar la entrega."],
    esperando_transferencia: [
        "Pedido recibido",
        "Transferí el total a esta cuenta. Cuando nos llegue, confirmamos el pago y preparamos tu pedido.",
    ],
    esperando_pago: ["Falta completar el pago", "Tu pedido está guardado. Podés pagarlo ahora con Mercado Pago."],
    rechazado: ["El pago no se aprobó", "No se hizo ningún cobro. Podés intentar con otro medio de pago."],
    cancelado: ["Pedido cancelado", "Si fue un error, escribinos y lo resolvemos."],
};

export function orderPage(order, { bank, whatsapp }) {
    const [title, lead] = titles[order.status] || [ORDER_STATUS[order.status] || order.status, ""];
    const method = PAYMENT_METHODS[order.method];
    const canPay = method?.mercadoPago && ["esperando_pago", "rechazado"].includes(order.status);
    const clearCart = ["pagado", "esperando_transferencia"].includes(order.status);
    const icon = order.status === "pagado" ? "✓" : order.status === "rechazado" || order.status === "cancelado" ? "!" : "…";
    const wa =
        "https://wa.me/" +
        whatsapp +
        "?text=" +
        encodeURIComponent(
            order.status === "esperando_transferencia"
                ? `Hola Pisada, te paso el comprobante de la transferencia del pedido #${order.id} (${money(order.total)}).`
                : `Hola Pisada, te escribo por el pedido #${order.id}.`,
        );
    return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex,nofollow" />
<title>Pedido #${order.id} · Pisada</title>
<link rel="icon" href="/IMG/favicon.svg" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@700;900&family=Inter:wght@400;500;600&display=swap" />
<style>
:root{--bg:#0d0d0f;--surface:#16161a;--surface2:#1f1f25;--line:#2b2b33;--ink:#f2f2ee;--muted:#9b9ba5;--accent:#c6ff3d;--danger:#ff6b5e}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;background:radial-gradient(60% 50% at 85% 0%,rgba(198,255,61,.1),transparent 70%),var(--bg);color:var(--ink);font-family:Inter,"Segoe UI",Arial,sans-serif}
main{max-width:640px;margin:0 auto;padding:28px 16px 60px}
.logo{display:inline-flex;align-items:center;gap:10px;color:var(--accent);text-decoration:none;margin-bottom:28px}
.logo span{font-family:Archivo,sans-serif;font-weight:900;font-size:22px;letter-spacing:.04em;color:var(--ink)}
.card{background:var(--surface);border:1px solid var(--line);border-radius:22px;padding:28px 24px;margin-bottom:16px}
.status{display:flex;gap:16px;align-items:flex-start}
.badge{flex:0 0 52px;height:52px;border-radius:50%;display:grid;place-items:center;font:900 24px Archivo,sans-serif;background:var(--surface2);color:var(--muted)}
.is-pagado .badge{background:var(--accent);color:#0d0d0f}
.is-rechazado .badge,.is-cancelado .badge{background:rgba(255,107,94,.15);color:var(--danger)}
h1{font-family:Archivo,sans-serif;font-weight:900;font-size:26px;text-transform:uppercase;letter-spacing:-.01em;margin:2px 0 8px}
p{color:var(--muted);line-height:1.6;margin:0}
.eyebrow{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);font-weight:600;margin-bottom:12px}
ul{list-style:none;margin:0;padding:0}
li{display:flex;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)}
li img{width:56px;height:56px;object-fit:cover;border-radius:12px;background:#fff}
li span{flex:1;font-weight:600}
li small{display:block;color:var(--muted);font-weight:400;margin-top:2px}
.row{display:flex;justify-content:space-between;padding:6px 0;color:var(--muted)}
.row.total{color:var(--ink);font:900 20px Archivo,sans-serif;padding-top:12px}
.row.off span:last-child{color:var(--accent)}
dl{display:grid;grid-template-columns:auto 1fr;gap:10px 16px;margin:0}
dt{color:var(--muted)}
dd{margin:0;font-weight:600;word-break:break-all;display:flex;gap:8px;align-items:center;justify-content:space-between}
.copy{border:1px solid var(--line);background:var(--surface2);color:var(--ink);border-radius:999px;padding:4px 12px;font-size:12px;cursor:pointer}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:999px;padding:14px 22px;font:700 15px Inter,sans-serif;text-decoration:none;cursor:pointer;background:var(--accent);color:#0d0d0f;width:100%;margin-top:16px}
.btn--ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
.btn[disabled]{opacity:.6;cursor:wait}
.error{color:#ffb3ab;margin-top:10px;min-height:1px}
.note{font-size:13px;margin-top:14px}
</style>
</head>
<body>
<main>
<a class="logo" href="/" aria-label="Pisada, volver a la tienda"><svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="currentColor"/><path d="M7 21.5c3.2 0 4.6-1.6 6.4-4.6l2-3.3c1.3-2.2 2.6-3.1 4.6-3.1H25v3.4h-4.4c-.9 0-1.5.4-2.2 1.6l-2 3.4c-2.4 4-4.6 6-9.4 6z" fill="#0d0d0f"/></svg><span>PISADA</span></a>
<section class="card status is-${e(order.status)}" aria-live="polite">
<div class="badge" aria-hidden="true">${icon}</div>
<div><p class="eyebrow">Pedido #${order.id} · ${e(ORDER_STATUS[order.status] || order.status)}</p><h1>${e(title)}</h1><p>${e(lead)}</p></div>
</section>
${
    order.status === "esperando_transferencia"
        ? `<section class="card"><p class="eyebrow">Datos para transferir</p><dl>
<dt>Monto</dt><dd>${money(order.total)}</dd>
<dt>Alias</dt><dd><span>${e(bank.alias)}</span><button class="copy" data-copy="${e(bank.alias)}">Copiar</button></dd>
<dt>CBU</dt><dd><span>${e(bank.cbu)}</span><button class="copy" data-copy="${e(bank.cbu)}">Copiar</button></dd>
<dt>Titular</dt><dd>${e(bank.holder)}</dd>
<dt>Banco</dt><dd>${e(bank.bank)}</dd>
</dl><a class="btn" href="${e(wa)}" target="_blank" rel="noopener noreferrer">Enviar comprobante por WhatsApp</a>
<p class="note">Apenas veamos la transferencia confirmamos tu pedido y te avisamos. Si se agota algún talle antes, te escribimos.</p></section>`
        : ""
}
${
    canPay
        ? `<section class="card"><p class="eyebrow">${e(method.label)}</p><p>Total a pagar: <b style="color:var(--ink)">${money(order.total)}</b>${method.installments ? ` · hasta ${method.installments} cuotas sin interés` : ""}</p><button class="btn" id="pagar">Pagar con Mercado Pago</button><p class="error" id="error" role="alert"></p></section>`
        : ""
}
<section class="card"><p class="eyebrow">Tu pedido</p><ul>${order.items
        .map(
            (i) =>
                `<li><img src="${e(i.image)}" alt=""><span>${e(i.name)}<small>Talle ${e(i.size)}${i.color ? " · " + e(i.color) : ""} · ${i.qty} ${i.qty === 1 ? "par" : "pares"}</small></span><b>${money(i.unitPrice * i.qty)}</b></li>`,
        )
        .join("")}</ul>
<div class="row"><span>Subtotal</span><span>${money(order.subtotal)}</span></div>
${order.discount ? `<div class="row off"><span>Descuento ${e(method?.label.toLowerCase() || "")}</span><span>−${money(order.discount)}</span></div>` : ""}
<div class="row"><span>${order.delivery === "retiro" ? "Retiro" : "Envío"}</span><span>${order.shipping ? money(order.shipping) : "Gratis"}</span></div>
<div class="row total"><span>Total</span><span>${money(order.total)}</span></div>
<p class="note">${order.delivery === "retiro" ? "Retiro sin cargo en el punto de entrega (te avisamos dónde por WhatsApp)." : `Envío a ${e(order.customer.address)}, ${e(order.customer.city)} (CP ${e(order.customer.zip)}).`} Pago: ${e(method?.label || order.method)}.</p>
</section>
<a class="btn btn--ghost" href="/productos">Seguir mirando zapatillas</a>
<a class="btn btn--ghost" href="${e(wa)}" target="_blank" rel="noopener noreferrer">¿Dudas? Escribinos por WhatsApp</a>
</main>
<script>
${clearCart ? 'try{localStorage.removeItem("pisada-carrito")}catch(e){}' : ""}
document.addEventListener("click", async (ev) => {
    const copy = ev.target.closest("[data-copy]");
    if (copy) {
        try { await navigator.clipboard.writeText(copy.dataset.copy); copy.textContent = "¡Copiado!"; } catch {}
        return;
    }
    const pay = ev.target.closest("#pagar");
    if (!pay) return;
    pay.disabled = true;
    pay.textContent = "Abriendo Mercado Pago…";
    try {
        const r = await fetch(${JSON.stringify(`/api/pedidos/${order.token}/pagar`)}, { method: "POST", headers: { "X-Pisada-Tienda": "1" } });
        const data = await r.json().catch(() => ({}));
        if (!r.ok || !data.redirect) throw new Error(data.error || "No se pudo abrir Mercado Pago.");
        location.href = data.redirect;
    } catch (error) {
        document.getElementById("error").textContent = error.message;
        pay.disabled = false;
        pay.textContent = "Pagar con Mercado Pago";
    }
});
</script>
</body>
</html>`;
}
