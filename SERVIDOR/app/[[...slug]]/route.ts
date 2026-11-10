// Rutas de la tienda, archivos subidos y operaciones privadas de administración.
import { env } from "cloudflare:workers";
import {
    AuthError,
    GOOGLE_CLIENT_ID,
    isAuthorized,
    verifyGoogleCredential,
    createSession,
    readSession,
    sessionCookie,
    clearSessionCookie,
} from "../../lib/admin-auth.mjs";
import { adminLoginPage } from "../../lib/admin-login-page.mjs";
import home from "../../../index.html?raw";
import listing from "../../../PAGES/productos.html?raw";
import product from "../../../PAGES/producto.html?raw";
import admin from "../../../PAGES/administrador.html?raw";
import { renderStore } from "../../lib/store-renderer.mjs";
import { CatalogError } from "../../lib/catalog-domain.mjs";
import {
    getCatalog,
    bootstrap,
    events,
    createCategory,
    createProduct,
    editProduct,
    moveStock,
    deleteProduct,
    restoreProduct,
    uploadImage,
} from "../../lib/inventory-service.mjs";
import {
    PAYMENT_METHODS,
    createOrder,
    getOrder,
    getOrderById,
    listOrders,
    markPaid,
    setStatus,
} from "../../lib/orders.mjs";
import { createPreference, applyPayment, getPayment, syncOrder } from "../../lib/mercadopago.mjs";
import { orderPage } from "../../lib/order-page.mjs";

export const dynamic = "force-dynamic";
const vars = env as unknown as Record<string, string | undefined>;
// Mercado Pago y datos bancarios: se configuran en SERVIDOR/.dev.vars (o con `wrangler secret put`).
const mpToken = () => vars.MP_ACCESS_TOKEN || "";
const bank = () => ({
    alias: vars.BANK_ALIAS || "PISADA.ZAPAS.DEMO",
    cbu: vars.BANK_CBU || "0000003100000000000000",
    holder: vars.BANK_HOLDER || "Pisada (cuenta de demostración)",
    bank: vars.BANK_NAME || "Banco de demostración",
});
const STORE_WHATSAPP = "5491128383634";
// Las compras solo se aceptan desde la propia tienda.
function storeGuard(request: Request) {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
        throw new CatalogError("La solicitud debe enviarse desde esta tienda.", 403);
    if (request.headers.get("x-pisada-tienda") !== "1")
        throw new CatalogError("Solicitud no válida.", 403);
}
async function payLink(order: any, url: URL) {
    const { link } = await createPreference(mpToken(), order, url.origin);
    return link;
}
const googleClientId = () => vars.GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID;
// En producción la clave se define con `wrangler secret put SESSION_SECRET`.
const sessionSecret = () =>
    vars.SESSION_SECRET || (import.meta.env.DEV ? "pisada-clave-solo-para-desarrollo-local" : "");
const json = (data: any, status = 200) =>
    Response.json(data, {
        status,
        headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
const page = (body: string, status = 200) =>
    new Response(body, {
        status,
        headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    });
// Solo pasa una sesión firmada, vigente y de un correo autorizado.
async function administrator(request: Request) {
    const user = await readSession(request.headers.get("cookie"), sessionSecret());
    if (!user) throw new CatalogError("Iniciá sesión para entrar a la administración.", 401);
    return user;
}
function writeGuard(request: Request) {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
        throw new CatalogError("La solicitud debe enviarse desde esta tienda.", 403);
    if (request.headers.get("x-pisada-admin") !== "1")
        throw new CatalogError("Solicitud no válida.", 403);
}
async function payload(request: Request) {
    const text = await request.text();
    if (text.length > 1000000)
        throw new CatalogError("La información enviada es demasiado grande.", 413);
    try {
        return JSON.parse(text);
    } catch {
        throw new CatalogError("Revisá los datos enviados.");
    }
}
async function route(request: Request) {
    const url = new URL(request.url),
        path = url.pathname.replace(/\/$/, "") || "/";
    try {
        const db = env.DB;
        if (!db)
            return json(
                { error: "El catálogo se está preparando. Volvé a intentar en unos minutos." },
                503,
            );
        if (path.startsWith("/media/images/") && request.method === "GET") {
            const key = path.slice("/media/".length);
            if (!/^images\/[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(key))
                return new Response("No encontrado", { status: 404 });
            const object = await env.BUCKET?.get(key);
            if (!object) return new Response("Foto no encontrada", { status: 404 });
            const headers = new Headers();
            object.writeHttpMetadata(headers);
            headers.set("ETag", object.httpEtag);
            headers.set("X-Content-Type-Options", "nosniff");
            return new Response(object.body, { headers });
        }
        if (path === "/catalog.json" && request.method === "GET") return json(await getCatalog(db));
        // Compra: crea el pedido y, si corresponde, el link de Mercado Pago.
        if (path === "/api/pedidos" && request.method === "POST") {
            storeGuard(request);
            const input = await payload(request);
            if (PAYMENT_METHODS[input?.method as keyof typeof PAYMENT_METHODS]?.mercadoPago && !mpToken())
                throw new CatalogError(
                    "El pago con Mercado Pago todavía no está configurado. Elegí transferencia.",
                    503,
                );
            await bootstrap(db); // si el catálogo nunca se guardó en la base, lo prepara (no repite)
            const order = await createOrder(db, input);
            if (order.status !== "esperando_pago")
                return json({ token: order.token, redirect: `/pedido/${order.token}` }, 201);
            try {
                return json({ token: order.token, redirect: await payLink(order, url) }, 201);
            } catch (error: any) {
                console.error("No se pudo crear el pago:", error?.message);
                return json({ token: order.token, redirect: `/pedido/${order.token}` }, 201);
            }
        }
        const payMatch = path.match(/^\/api\/pedidos\/([a-f0-9]{32})\/pagar$/);
        if (payMatch && request.method === "POST") {
            storeGuard(request);
            const order = await getOrder(db, payMatch[1]);
            if (!order) throw new CatalogError("No encontramos el pedido.", 404);
            if (
                !PAYMENT_METHODS[order.method as keyof typeof PAYMENT_METHODS]?.mercadoPago ||
                !["esperando_pago", "rechazado"].includes(order.status)
            )
                throw new CatalogError("Este pedido ya no se puede pagar.", 409);
            return json({ redirect: await payLink(order, url) });
        }
        const orderMatch = path.match(/^\/pedido\/([a-f0-9]{32})$/);
        if (orderMatch && request.method === "GET") {
            let order = await getOrder(db, orderMatch[1]);
            if (!order) return page("<!doctype html><title>Pedido</title><p>No encontramos ese pedido.</p>", 404);
            const paymentId = url.searchParams.get("payment_id") || url.searchParams.get("collection_id");
            if (order.status !== "pagado" && mpToken()) {
                try {
                    order = paymentId
                        ? await applyPayment(db, mpToken(), order, paymentId)
                        : await syncOrder(db, mpToken(), order);
                } catch (error: any) {
                    console.error("No se pudo verificar el pago:", error?.message);
                }
            }
            return page(orderPage(order, { bank: bank(), whatsapp: STORE_WHATSAPP }));
        }
        // Aviso automático de Mercado Pago cuando cambia un pago (solo con la web publicada en https).
        if (path === "/api/pagos/mercadopago" && request.method === "POST") {
            const body = await request.json().catch(() => ({}));
            const type = url.searchParams.get("type") || url.searchParams.get("topic") || body?.type;
            const id = url.searchParams.get("data.id") || url.searchParams.get("id") || body?.data?.id;
            if (type !== "payment" || !id || !mpToken()) return json({ ok: true });
            const payment = await getPayment(mpToken(), id);
            const order = await getOrder(db, payment.external_reference);
            if (order && order.status !== "pagado") await applyPayment(db, mpToken(), order, id);
            return json({ ok: true });
        }
        if (path === "/admin" && request.method === "GET") {
            try {
                await administrator(request);
                return page(admin);
            } catch {
                return page(adminLoginPage({ clientId: googleClientId() }), 401);
            }
        }
        if (path === "/admin/salir" && request.method === "GET")
            return new Response(null, {
                status: 303,
                headers: {
                    Location: "/admin",
                    "Set-Cookie": clearSessionCookie(url.protocol === "https:"),
                    "Cache-Control": "no-store",
                },
            });
        if (path === "/api/auth/google" && request.method === "POST") {
            writeGuard(request);
            const { credential } = await payload(request);
            try {
                const user = await verifyGoogleCredential(credential, googleClientId());
                if (!isAuthorized(user.email))
                    return json(
                        {
                            error: "No tenés autorización para entrar al administrador.",
                            email: user.email,
                        },
                        403,
                    );
                const session = await createSession(user, sessionSecret());
                return new Response(JSON.stringify({ ok: true, email: user.email }), {
                    status: 200,
                    headers: {
                        "Content-Type": "application/json",
                        "Cache-Control": "no-store",
                        "Set-Cookie": sessionCookie(session, url.protocol === "https:"),
                    },
                });
            } catch (error: any) {
                if (error instanceof AuthError)
                    return json({ error: error.message }, error.status === 403 ? 400 : error.status);
                throw error;
            }
        }
        if (path.startsWith("/api/admin/")) {
            const user = await administrator(request);
            if (request.method !== "GET") writeGuard(request);
            if (path === "/api/admin/state" && request.method === "GET")
                return json({
                    catalog: await getCatalog(db, true),
                    events: await events(db),
                    user: { email: user.email, name: user.name },
                });
            if (path === "/api/admin/orders" && request.method === "GET") {
                // Antes de mostrar, consulta en Mercado Pago los pedidos que siguen esperando el pago.
                if (mpToken()) {
                    const pending = (await listOrders(db))
                        .filter((o: any) => o.status === "esperando_pago" || o.status === "rechazado")
                        .slice(0, 10);
                    for (const o of pending)
                        await syncOrder(db, mpToken(), o).catch((e: any) =>
                            console.error("No se pudo revisar el pedido", o.id, e?.message),
                        );
                }
                return json({ orders: await listOrders(db) });
            }
            const adminOrder = path.match(/^\/api\/admin\/orders\/(\d+)$/);
            if (adminOrder && request.method === "POST") {
                const order = await getOrderById(db, Number(adminOrder[1]));
                if (!order) throw new CatalogError("No encontramos el pedido.", 404);
                const { action } = await payload(request);
                if (action === "pagado")
                    return json({
                        order: await markPaid(db, order, {
                            actor: user.email,
                            note: "Pago confirmado a mano",
                        }),
                    });
                if (action === "cancelado") return json({ order: await setStatus(db, order, "cancelado") });
                throw new CatalogError("Acción inválida.");
            }
            if (path === "/api/admin/bootstrap" && request.method === "POST")
                return json(await bootstrap(db));
            if (path === "/api/admin/categories" && request.method === "POST")
                return json(await createCategory(db, await payload(request)), 201);
            if (path === "/api/admin/uploads" && request.method === "POST") {
                if (!env.BUCKET)
                    throw new CatalogError("Las fotos todavía no están disponibles.", 503);
                const form = await request.formData();
                return json(await uploadImage(form.get("file"), env.BUCKET), 201);
            }
            if (path === "/api/admin/products" && request.method === "POST")
                return json(
                    {
                        product: await createProduct(
                            db,
                            env.BUCKET,
                            await payload(request),
                            user.email,
                        ),
                    },
                    201,
                );
            const match = path.match(/^\/api\/admin\/products\/(\d+)(\/(?:stock|restore))?$/);
            if (match) {
                const id = Number(match[1]);
                if (!Number.isSafeInteger(id) || id < 1) throw new CatalogError("Modelo inválido.");
                if (match[2] === "/stock" && request.method === "POST")
                    return json({
                        product: await moveStock(db, id, await payload(request), user.email),
                    });
                if (match[2] === "/restore" && request.method === "POST")
                    return json({
                        product: await restoreProduct(db, id, await payload(request), user.email),
                    });
                if (!match[2] && request.method === "PUT")
                    return json({
                        product: await editProduct(
                            db,
                            env.BUCKET,
                            id,
                            await payload(request),
                            user.email,
                        ),
                    });
                if (!match[2] && request.method === "DELETE")
                    return json({
                        product: await deleteProduct(db, id, await payload(request), user.email),
                    });
            }
            return json({ error: "La acción no existe." }, 404);
        }
        if (request.method === "GET") {
            const catalog = await getCatalog(db);
            const body = renderStore({ home, listing, product }, catalog, url);
            if (body) return page(body);
        }
        return page(
            '<!doctype html><html lang="es"><meta charset="utf-8"><title>Pisada</title><body style="font:16px Arial;margin:60px"><h1>No encontramos ese modelo.</h1><a href="/productos">Ver el catálogo</a></body></html>',
            404,
        );
    } catch (error: any) {
        if (error instanceof CatalogError) return json({ error: error.message }, error.status);
        console.error("Pisada request failed:", error?.message);
        return json({ error: "No se pudo completar la operación. Volvé a intentar." }, 500);
    }
}
export const GET = route;
export const POST = route;
export const PUT = route;
export const DELETE = route;
