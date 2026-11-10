/* ADMINISTRACIÓN
 * Formularios para modelos, imágenes, categorías, stock y Papelera.
 * El servidor verifica el permiso de cada operación.
 */
(() => {
    "use strict";
    const $ = (s) => document.querySelector(s),
        $$ = (s) => [...document.querySelectorAll(s)];
    const esc = (v) =>
        String(v ?? "").replace(
            /[&<>"']/g,
            (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
        );
    const money = (n) =>
        "$" +
        Number(n).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    let state,
        editing = null,
        photos = [],
        moving = null,
        saveKey = null,
        moveKey = null,
        busy = false,
        removing = null,
        deleteKey = null;
    // Envía las operaciones al servidor y muestra sus errores.
    async function api(path, options = {}) {
        const form = options.body instanceof FormData;
        const response = await fetch(path, {
            ...options,
            credentials: "same-origin",
            headers: {
                "X-Pisada-Admin": "1",
                ...(!form && options.body ? { "Content-Type": "application/json" } : {}),
                ...options.headers,
            },
        });
        let data;
        try {
            data = await response.json();
        } catch {
            throw new Error("No pudimos leer la respuesta. Volvé a intentar.");
        }
        if (!response.ok) {
            const error = new Error(data.error || "No se pudo completar la operación.");
            error.status = response.status;
            throw error;
        }
        return data;
    }
    function notice(message, error = false) {
        $("#notice").textContent = message;
        $("#notice").classList.toggle("error", error);
    }
    function errorIn(id, error) {
        const el = $(id);
        el.textContent = error?.message || "";
        el.hidden = !error;
    }
    function options(selected = "") {
        return state.catalog.categories
            .map(
                (c) =>
                    `<option value="${esc(c.path)}" ${c.path === selected ? "selected" : ""}>${esc(c.name)}</option>`,
            )
            .join("");
    }
    function available(p) {
        return p.sizes.filter((s) => !s.unlimited).reduce((n, s) => n + Number(s.stock), 0);
    }
    // Actualiza la tabla de modelos, la Papelera y los movimientos.
    function draw() {
        const all = state.catalog.products,
            published = all.filter((p) => p.published),
            units = published.reduce((n, p) => n + available(p), 0);
        $("#published-count").textContent = published.length;
        $("#units-count").textContent = units.toLocaleString("es-AR");
        $("#empty-count").textContent = published
            .flatMap((p) => p.sizes)
            .filter((s) => !s.unlimited && s.stock === 0).length;
        const category = $("#admin-category").value;
        $("#admin-category").innerHTML =
            '<option value="">Todas las categorías</option>' + options(category);
        const q = $("#admin-search").value.trim().toLowerCase(),
            visibility = $("#admin-visibility").value;
        const rows = all.filter(
            (p) =>
                (!category || p.categoryPath === category) &&
                (!q ||
                    (
                        p.name +
                        " " +
                        (state.catalog.categories.find((c) => c.path === p.categoryPath)?.name ||
                            "") +
                        " " +
                        p.sizes.map((s) => s.color || "").join(" ")
                    )
                        .toLowerCase()
                        .includes(q)) &&
                (!visibility ||
                    (visibility === "published"
                        ? p.published
                        : visibility === "hidden"
                          ? !p.published
                          : !p.sizes.some((s) => s.unlimited || s.stock > 0))),
        );
        $("#result-count").textContent = `${rows.length} modelo${rows.length === 1 ? "" : "s"}`;
        $("#product-list").innerHTML = rows
            .map(
                (p) =>
                    `<tr><td><div class="model-cell"><img src="${esc(p.images[0])}" alt="${esc(p.name)}" loading="lazy"><div><strong>${esc(p.name)}</strong><small>${p.sizes.length} ${p.sizes.length === 1 ? "combinación" : "combinaciones"}</small></div></div></td><td>${esc(state.catalog.categories.find((c) => c.path === p.categoryPath)?.name || "")}</td><td>${money(p.price)}</td><td class="${available(p) === 0 && !p.sizes.some((s) => s.unlimited) ? "stock-zero" : ""}">${available(p)}${p.sizes.some((s) => s.unlimited) ? " + sin límite" : ""}<small> pares</small></td><td><span class="badge${p.published ? "" : " hidden"}">${p.published ? "Publicado" : "Oculto"}</span></td><td><div class="cell-actions"><button class="secondary" data-edit="${p.id}">Editar</button><button class="secondary" data-stock="${p.id}">Stock</button><button class="secondary danger" data-delete="${p.id}">Eliminar</button></div></td></tr>`,
            )
            .join("");
        $("#empty-list").hidden = rows.length > 0;
        const deleted = [...(state.catalog.deletedProducts || [])].sort((a, b) =>
            b.deletedAt.localeCompare(a.deletedAt),
        );
        $("#trash-count").textContent = deleted.length;
        $("#trash-list").innerHTML = deleted
            .map(
                (p) =>
                    `<tr><td><div class="model-cell"><img src="${esc(p.images[0])}" alt="${esc(p.name)}" loading="lazy"><div><strong>${esc(p.name)}</strong><small>${p.sizes.length} ${p.sizes.length === 1 ? "combinación" : "combinaciones"}</small></div></div></td><td>${esc(state.catalog.categories.find((c) => c.path === p.categoryPath)?.name || "")}</td><td>${new Date(p.deletedAt).toLocaleString("es-AR")}</td><td><button class="secondary" data-restore="${p.id}">Restaurar</button></td></tr>`,
            )
            .join("");
        $("#empty-trash").hidden = deleted.length > 0;
        const names = {
            create: "Modelo creado",
            edit: "Modelo actualizado",
            received: "Ingreso de mercadería",
            sale: "Venta confirmada",
            adjust: "Ajuste de stock",
            delete: "Producto eliminado",
            restore: "Producto restaurado",
        };
        $("#event-list").innerHTML = state.events.length
            ? state.events
                  .map(
                      (ev) =>
                          `<article class="event-card"><header><strong>${esc(names[ev.kind] || ev.kind)} · ${esc(ev.details.name)}</strong><time>${new Date(ev.createdAt).toLocaleString("es-AR")}</time></header>${ev.details.changes ? "<ul>" + ev.details.changes.map((c) => `<li>Talle ${esc(c.talle)}${c.color ? " · " + esc(c.color) : ""}: ${c.before} → ${c.after} pares</li>`).join("") + "</ul>" : ev.details.note ? "<p>" + esc(ev.details.note) + "</p>" : `<p>Talle ${esc(ev.details.talle)}${ev.details.color ? " · " + esc(ev.details.color) : ""}: <b>${ev.details.before} → ${ev.details.after} pares</b></p>`}${ev.details.reason ? `<p>${esc(ev.details.reason)}</p>` : ""}<small>${esc(ev.actor)}</small></article>`,
                  )
                  .join("")
            : '<p class="muted">Todavía no hay movimientos registrados.</p>';
        drawOrders();
    }
    // Pedidos de la tienda con su estado de pago.
    const ORDER_LABELS = {
        esperando_pago: "Esperando el pago",
        esperando_transferencia: "Esperando transferencia",
        pagado: "Pagado",
        rechazado: "Pago rechazado",
        cancelado: "Cancelado",
    };
    const METHOD_LABELS = {
        tarjeta: "Tarjeta",
        mercadopago: "Mercado Pago",
        transferencia: "Transferencia",
    };
    function drawOrders() {
        const orders = state.orders || [];
        $("#orders-count").textContent = orders.filter(
            (o) => o.status === "esperando_transferencia",
        ).length;
        $("#order-list").innerHTML = orders.length
            ? orders
                  .map((o) => {
                      const c = o.customer || {};
                      const actions =
                          o.status === "pagado" || o.status === "cancelado"
                              ? ""
                              : `<div class="cell-actions">${o.status === "esperando_transferencia" ? `<button class="primary" data-order-paid="${o.id}">Confirmar pago</button>` : ""}<button class="secondary danger" data-order-cancel="${o.id}">Cancelar</button></div>`;
                      return `<article class="event-card order-card is-${esc(o.status)}"><header><strong>Pedido #${o.id} · ${money(o.total)}</strong><span class="badge order-badge">${esc(ORDER_LABELS[o.status] || o.status)}</span></header><p>${esc(c.name)} · <a href="mailto:${esc(c.email)}">${esc(c.email)}</a> · <a href="https://wa.me/${esc(String(c.phone || "").replace(/\D/g, ""))}" target="_blank" rel="noopener noreferrer">${esc(c.phone)}</a></p><ul>${(o.items || []).map((i) => `<li>${esc(i.name)} · talle ${esc(i.size)}${i.color ? " · " + esc(i.color) : ""} × ${i.qty}</li>`).join("")}</ul><p>${esc(METHOD_LABELS[o.method] || o.method)} · ${o.delivery === "retiro" ? "Retira" : `Envío a ${esc(c.address)}, ${esc(c.city)} (CP ${esc(c.zip)})`}</p>${o.stockProblems?.length ? `<p class="error">Revisá el stock: ${esc(o.stockProblems.join(" · "))}</p>` : ""}<small>${new Date(o.createdAt).toLocaleString("es-AR")}${o.paymentId ? " · Pago Mercado Pago " + esc(o.paymentId) : ""}${o.paidBy && o.status === "pagado" ? " · Confirmado por " + esc(o.paidBy) : ""}</small>${actions}</article>`;
                  })
                  .join("")
            : '<p class="muted">Todavía no hay pedidos.</p>';
    }
    $("#order-list").addEventListener("click", async (ev) => {
        const paid = ev.target.closest("[data-order-paid]"),
            cancel = ev.target.closest("[data-order-cancel]");
        const button = paid || cancel;
        if (!button || busy) return;
        const id = button.dataset.orderPaid || button.dataset.orderCancel;
        const question = paid
            ? `¿Confirmás que recibiste la transferencia del pedido #${id}? Se descuenta el stock.`
            : `¿Cancelar el pedido #${id}?`;
        if (!confirm(question)) return;
        busy = true;
        button.disabled = true;
        try {
            await api("/api/admin/orders/" + id, {
                method: "POST",
                body: JSON.stringify({ action: paid ? "pagado" : "cancelado" }),
            });
            await load(true);
            notice(paid ? "Pago confirmado. El stock quedó actualizado." : "Pedido cancelado.");
        } catch (error) {
            notice(error.message, true);
        } finally {
            busy = false;
            button.disabled = false;
        }
    });
    async function load(silent = false) {
        try {
            if (!silent) notice("Actualizando el catálogo…");
            state = await api("/api/admin/state");
            if (state.catalog.needsSetup) {
                notice("Preparando tu catálogo actual…");
                await api("/api/admin/bootstrap", { method: "POST", body: "{}" });
                state = await api("/api/admin/state");
            }
            state.orders = (await api("/api/admin/orders")).orders;
            $("#account").textContent = state.user.email;
            $("#new-product").disabled = false;
            draw();
            if (!silent) notice("");
            return true;
        } catch (error) {
            notice(error.message, true);
            return false;
        }
    }
    function addVariant(v = {}) {
        const id = String(v.id || crypto.randomUUID()),
            row = document.createElement("tr");
        row.dataset.variantId = id;
        row.innerHTML = `<td><input type="text" data-field="label" value="${esc(v.label || "")}" placeholder="40" maxlength="16" required aria-label="Talle de la combinación"></td><td><input type="text" data-field="color" value="${esc(v.color || "")}" placeholder="Ej. Negro" maxlength="40" aria-label="Color de la combinación"></td><td><input type="number" data-field="stock" value="${Number(v.stock || 0)}" min="0" max="1000000" step="1" required aria-label="Pares disponibles" ${v.unlimited ? "disabled" : ""}><label class="infinite"><input type="checkbox" data-field="unlimited" ${v.unlimited ? "checked" : ""}> Sin límite</label></td><td><input type="number" data-field="price" value="${v.price && Number(v.price) !== Number($("#product-price").value) ? Number(v.price) : ""}" min="0.01" step="0.01" placeholder="Precio del modelo" aria-label="Precio de la combinación"></td><td><button type="button" class="remove-row" aria-label="Quitar combinación">×</button></td>`;
        $("#variant-rows").append(row);
    }
    // Colores escritos en las combinaciones, sin repetir.
    function variantColors() {
        const seen = new Map();
        for (const input of $$("#variant-rows [data-field=color]")) {
            const color = input.value.trim();
            if (color && !seen.has(color.toLocaleLowerCase("es")))
                seen.set(color.toLocaleLowerCase("es"), color);
        }
        return [...seen.values()];
    }
    function photoView() {
        const colors = variantColors();
        const lower = colors.map((c) => c.toLocaleLowerCase("es"));
        for (const p of photos) {
            const i = lower.indexOf(String(p.color || "").toLocaleLowerCase("es"));
            p.color = i >= 0 ? colors[i] : "";
        }
        $("#photos").innerHTML = photos
            .map(
                (p, i) =>
                    `<div class="photo-tile"><img src="${esc(p.preview || p.url)}" alt="Foto ${i + 1} del modelo"><small>${i === 0 ? "Foto principal" : "Foto " + (i + 1)}</small>${colors.length ? `<select data-photo-color="${i}" aria-label="Color de la foto ${i + 1}"><option value="">Todos los colores</option>${colors.map((c) => `<option value="${esc(c)}" ${c === p.color ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>` : ""}<div class="photo-actions">${i ? `<button type="button" data-photo-main="${i}">Principal</button>` : ""}<button type="button" data-photo-remove="${i}">Quitar</button></div></div>`,
            )
            .join("");
    }
    // Abre el formulario para crear o editar un modelo.
    function edit(id) {
        editing = id ? state.catalog.products.find((p) => p.id === id) : null;
        saveKey = crypto.randomUUID();
        const p = editing;
        $("#product-form").reset();
        $("#editor-title").textContent = p ? "Editar modelo" : "Nuevo modelo";
        $("#product-name").value = p?.name || "";
        $("#product-category").innerHTML = options(
            p?.categoryPath || state.catalog.categories[0]?.path,
        );
        $("#product-price").value = p?.price || "";
        $("#product-description").value = p?.description || "";
        $("#product-published").checked = p?.published !== false;
        $("#variant-rows").replaceChildren();
        (p?.sizes || [{ label: "", stock: 0 }]).forEach(addVariant);
        photos = (p?.images || []).map((url) => ({ url, color: p.imageColors?.[url] || "" }));
        $("#range-color").value = "";
        photoView();
        errorIn("#editor-error", null);
        $("#upload-progress").textContent = "";
        $("#editor").showModal();
    }
    function formProduct() {
        return {
            name: $("#product-name").value,
            categoryPath: $("#product-category").value,
            price: Number($("#product-price").value),
            description: $("#product-description").value,
            published: $("#product-published").checked,
            images: photos.map((p) => p.url),
            imageColors: Object.fromEntries(
                photos.filter((p) => p.color).map((p) => [p.url, p.color]),
            ),
            sizes: $$("#variant-rows tr").map((row) => ({
                id: row.dataset.variantId,
                label: row.querySelector("[data-field=label]").value,
                color: row.querySelector("[data-field=color]").value,
                stock: Number(row.querySelector("[data-field=stock]").value),
                unlimited: row.querySelector("[data-field=unlimited]").checked,
                price: row.querySelector("[data-field=price]").value,
            })),
            requestId: saveKey,
            ...(editing ? { version: editing.version } : {}),
        };
    }
    $("#product-form").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        if (busy) return;
        errorIn("#editor-error", null);
        if (!photos.length) {
            errorIn("#editor-error", new Error("Agregá al menos una foto."));
            return;
        }
        busy = true;
        $("#save-product").disabled = true;
        try {
            for (let i = 0; i < photos.length; i++) {
                if (photos[i].file) {
                    $("#upload-progress").textContent =
                        `Subiendo foto ${i + 1} de ${photos.length}…`;
                    const form = new FormData();
                    form.append("file", photos[i].file);
                    const result = await api("/api/admin/uploads", { method: "POST", body: form });
                    photos[i].url = result.url;
                    photos[i].file = null;
                }
            }
            $("#upload-progress").textContent = "Guardando el modelo…";
            await api("/api/admin/products" + (editing ? "/" + editing.id : ""), {
                method: editing ? "PUT" : "POST",
                body: JSON.stringify(formProduct()),
            });
            $("#editor").close();
            await load(true);
            notice("Modelo guardado. Los cambios ya están disponibles en la tienda.");
        } catch (error) {
            errorIn("#editor-error", error);
            $("#upload-progress").textContent = "";
            if (error.status === 409) {
                await load(true);
                errorIn(
                    "#editor-error",
                    new Error(
                        error.message +
                            " Cerrá esta ventana y volvé a abrir el modelo para editar la versión actual.",
                    ),
                );
            }
        } finally {
            busy = false;
            $("#save-product").disabled = false;
        }
    });
    $("#photo-files").addEventListener("change", (ev) => {
        errorIn("#editor-error", null);
        for (const file of ev.target.files) {
            if (photos.length >= 10) {
                errorIn("#editor-error", new Error("Podés agregar hasta 10 fotos."));
                break;
            }
            if (
                !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
                file.size > 8 * 1024 * 1024
            ) {
                errorIn("#editor-error", new Error("Elegí fotos JPG, PNG o WebP de hasta 8 MB."));
                continue;
            }
            photos.push({ file, preview: URL.createObjectURL(file), url: null });
        }
        ev.target.value = "";
        photoView();
    });
    $("#photos").addEventListener("click", (ev) => {
        const main = ev.target.closest("[data-photo-main]"),
            remove = ev.target.closest("[data-photo-remove]");
        if (main) {
            const i = Number(main.dataset.photoMain);
            photos.unshift(photos.splice(i, 1)[0]);
            photoView();
        }
        if (remove) {
            const p = photos.splice(Number(remove.dataset.photoRemove), 1)[0];
            if (p.preview) URL.revokeObjectURL(p.preview);
            photoView();
        }
    });
    $("#photos").addEventListener("change", (ev) => {
        const select = ev.target.closest("[data-photo-color]");
        if (select) photos[Number(select.dataset.photoColor)].color = select.value;
    });
    $("#variant-rows").addEventListener("click", (ev) => {
        if (ev.target.closest(".remove-row")) {
            ev.target.closest("tr").remove();
            photoView();
        }
    });
    $("#variant-rows").addEventListener("change", (ev) => {
        if (ev.target.matches("[data-field=unlimited]"))
            ev.target.closest("tr").querySelector("[data-field=stock]").disabled =
                ev.target.checked;
        if (ev.target.matches("[data-field=color]")) photoView();
    });
    $("#add-variant").addEventListener("click", () => addVariant());
    $("#add-range").addEventListener("click", () => {
        const color = $("#range-color").value.trim(),
            same = (a, b) => a.toLocaleLowerCase("es") === b.toLocaleLowerCase("es");
        for (let n = 35; n <= 44; n++) {
            if (
                !$$("#variant-rows tr").some(
                    (r) =>
                        r.querySelector("[data-field=label]").value.trim() === String(n) &&
                        same(r.querySelector("[data-field=color]").value.trim(), color),
                )
            )
                addVariant({ label: String(n), color, stock: 0 });
        }
        $$("#variant-rows tr")
            .filter((r) => !r.querySelector("[data-field=label]").value.trim())
            .forEach((r) => r.remove());
        $("#range-color").value = "";
        photoView();
    });
    // Prepara un ingreso, una venta o una corrección de stock.
    function movement(id) {
        moving = state.catalog.products.find((p) => p.id === id);
        moveKey = crypto.randomUUID();
        $("#movement-form").reset();
        $("#movement-product").textContent = moving.name;
        $("#movement-variant").innerHTML = moving.sizes
            .map(
                (s) =>
                    `<option value="${esc(s.id)}">Talle ${esc(s.label)}${s.color ? " · " + esc(s.color) : ""} · ${s.unlimited ? "Sin límite" : s.stock + " pares"}</option>`,
            )
            .join("");
        errorIn("#movement-error", null);
        previewMovement();
        $("#movement").showModal();
    }
    function previewMovement() {
        if (!moving) return;
        const s = moving.sizes.find((s) => String(s.id) === $("#movement-variant").value),
            kind = $("#movement-kind").value,
            n = Number($("#movement-quantity").value);
        $("#quantity-label").textContent =
            kind === "sale"
                ? "Cantidad de pares vendidos"
                : kind === "adjust"
                  ? "Cantidad total que debe quedar"
                  : "Cantidad de pares que ingresan";
        $("#movement-quantity").min = kind === "adjust" ? "0" : "1";
        $("#movement-reason").required = kind === "adjust";
        $("#movement-reason").minLength = kind === "adjust" ? 3 : 0;
        $("#reason-label").textContent =
            kind === "adjust" ? "Motivo del ajuste" : "Referencia opcional";
        const after = kind === "sale" ? s.stock - n : kind === "received" ? s.stock + n : n;
        $("#stock-preview").textContent = s.unlimited
            ? "Esta combinación tiene stock sin límite. Editala para indicar una cantidad."
            : `Stock actual: ${s.stock} → Nuevo stock: ${after} pares`;
        $("#save-movement").disabled = s.unlimited || after < 0;
    }
    ["#movement-variant", "#movement-kind", "#movement-quantity"].forEach((id) =>
        $(id).addEventListener("input", previewMovement),
    );
    $("#movement-form").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        if (busy) return;
        busy = true;
        $("#save-movement").disabled = true;
        errorIn("#movement-error", null);
        try {
            await api(`/api/admin/products/${moving.id}/stock`, {
                method: "POST",
                body: JSON.stringify({
                    requestId: moveKey,
                    version: moving.version,
                    variantId: $("#movement-variant").value,
                    kind: $("#movement-kind").value,
                    quantity: Number($("#movement-quantity").value),
                    reason: $("#movement-reason").value,
                }),
            });
            $("#movement").close();
            await load(true);
            notice("Movimiento guardado. El stock de la tienda quedó actualizado.");
        } catch (error) {
            errorIn("#movement-error", error);
            if (error.status === 409) {
                await load(true);
                errorIn(
                    "#movement-error",
                    new Error(
                        error.message +
                            " Cerrá el movimiento y volvé a abrirlo para usar el stock actual.",
                    ),
                );
            }
        } finally {
            busy = false;
            $("#save-movement").disabled = false;
        }
    });
    $("#category-form").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const button = $("#category-form button[type=submit]");
        button.disabled = true;
        errorIn("#category-error", null);
        try {
            const c = await api("/api/admin/categories", {
                method: "POST",
                body: JSON.stringify({ name: $("#category-name").value }),
            });
            await load(true);
            $("#product-category").innerHTML = options(c.path);
            $("#category-dialog").close();
            notice("Categoría creada. Ya podés usarla en los modelos.");
        } catch (error) {
            errorIn("#category-error", error);
        } finally {
            button.disabled = false;
        }
    });
    function categoryDialog() {
        $("#category-form").reset();
        errorIn("#category-error", null);
        $("#category-dialog").showModal();
    }
    $("#categories-button").addEventListener("click", categoryDialog);
    $("#inline-category").addEventListener("click", categoryDialog);
    $("#new-product").addEventListener("click", () => edit(null));
    $("#refresh").addEventListener("click", () => load());
    ["#admin-search", "#admin-category", "#admin-visibility"].forEach((id) =>
        $(id).addEventListener("input", () => {
            if (state) draw();
        }),
    );
    // Pide confirmación antes de enviar el modelo a la Papelera.
    function confirmRemoval(id) {
        if (busy) return;
        removing = state.catalog.products.find((p) => p.id === id);
        if (!removing) return;
        deleteKey = crypto.randomUUID();
        $("#delete-product-name").textContent = removing.name;
        errorIn("#delete-error", null);
        $("#delete-dialog").showModal();
    }
    $("#delete-form").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        if (busy || !removing) return;
        busy = true;
        $("#confirm-delete").disabled = true;
        errorIn("#delete-error", null);
        try {
            await api("/api/admin/products/" + removing.id, {
                method: "DELETE",
                body: JSON.stringify({ requestId: deleteKey, version: removing.version }),
            });
            $("#delete-dialog").close();
            await load(true);
            notice("Producto eliminado. Podés recuperarlo desde Papelera.");
        } catch (error) {
            errorIn("#delete-error", error);
            if (error.status === 409) {
                await load(true);
                errorIn(
                    "#delete-error",
                    new Error(
                        error.message +
                            " Cerrá esta ventana y actualizá los datos antes de volver a intentarlo.",
                    ),
                );
            }
        } finally {
            busy = false;
            $("#confirm-delete").disabled = false;
        }
    });
    $("#trash-list").addEventListener("click", async (ev) => {
        const button = ev.target.closest("[data-restore]");
        if (!button || busy) return;
        const p = (state.catalog.deletedProducts || []).find(
            (p) => p.id === Number(button.dataset.restore),
        );
        if (!p) return;
        busy = true;
        button.disabled = true;
        button.dataset.requestId = button.dataset.requestId || crypto.randomUUID();
        try {
            await api("/api/admin/products/" + p.id + "/restore", {
                method: "POST",
                body: JSON.stringify({ requestId: button.dataset.requestId, version: p.version }),
            });
            await load(true);
            notice("Producto restaurado como oculto. Podés publicarlo desde Editar.");
        } catch (error) {
            notice(error.message, true);
            if (error.status === 409) await load(true);
        } finally {
            busy = false;
            button.disabled = false;
        }
    });
    $("#product-list").addEventListener("click", (ev) => {
        const editButton = ev.target.closest("[data-edit]"),
            stockButton = ev.target.closest("[data-stock]"),
            deleteButton = ev.target.closest("[data-delete]");
        if (editButton) edit(Number(editButton.dataset.edit));
        if (stockButton) movement(Number(stockButton.dataset.stock));
        if (deleteButton) confirmRemoval(Number(deleteButton.dataset.delete));
    });
    $$("[data-close]").forEach((b) =>
        b.addEventListener("click", () => {
            if (!busy) $("#" + b.dataset.close).close();
        }),
    );
    $$("dialog").forEach((d) =>
        d.addEventListener("cancel", (ev) => {
            if (busy) ev.preventDefault();
        }),
    );
    for (const [tab, panel] of [
        ["products", "products"],
        ["orders", "orders"],
        ["history", "history"],
        ["trash", "trash"],
    ])
        $("#" + tab + "-tab").addEventListener("click", () => {
            for (const n of ["products", "orders", "history", "trash"]) {
                $("#" + n + "-tab").classList.toggle("active", n === tab);
                $("#" + n + "-tab").setAttribute("aria-pressed", String(n === tab));
                $("#" + n + "-panel").hidden = n !== panel;
            }
        });
    load();
})();
