/* TIENDA
 * Carrito local, selección de talles y colores, filtros y navegación.
 * Los productos y el stock se consultan al servidor mediante /catalog.json.
 */
/* Catalogue browsing, filters and local preview cart for Pisada. */
(() => {
    "use strict";
    const $ = (s, r = document) => r.querySelector(s),
        $$ = (s, r = document) => [...r.querySelectorAll(s)];
    const money = (n) =>
        "$" +
        Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const text = (s) =>
        String(s ?? "").replace(
            /[&<>"']/g,
            (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
        );
    const path = decodeURI(location.pathname).replace(/\/$/, "") || "/";
    let catalog,
        products,
        product,
        variant,
        quantity = 1,
        cart = [];
    try {
        cart = JSON.parse(localStorage.getItem("pisada-carrito") || "[]");
        if (!Array.isArray(cart)) cart = [];
    } catch {
        cart = [];
    }
    function note(container, message) {
        let el = $(".replica-feedback", container);
        if (!el) {
            el = document.createElement("p");
            el.className = "replica-feedback";
            el.setAttribute("role", "status");
            container.append(el);
        }
        el.textContent = message;
    }
    function showCart() {
        renderCart();
        UIkit.offcanvas("#cart-sidenav").show();
    }
    function storeCart() {
        try {
            localStorage.setItem("pisada-carrito", JSON.stringify(cart));
        } catch {}
        renderCart();
    }
    // Fotos de un color: las marcadas con ese color y las que sirven para todos.
    function photosFor(p, color) {
        if (!p) return [];
        const tags = p.imageColors || {};
        const chosen = p.images.filter((src) => !tags[src] || tags[src] === color);
        return chosen.length ? chosen : p.images;
    }
    // Cambia la galería de la ficha a las fotos del color elegido.
    let galleryColor = null;
    function showGallery(color) {
        const slider = $("#product-vip__carrousel"),
            list = slider && $(".uk-slider-items", slider);
        if (!list || color === galleryColor) return;
        const first = galleryColor === null;
        galleryColor = color;
        const images = photosFor(product, color);
        const current = $$("img", list).map((img) => img.getAttribute("src"));
        if (first && current.join() === images.join()) return;
        list.innerHTML = images
            .map(
                (src) =>
                    `<li><img src="${text(src)}" alt="${text(product.name)}${color ? " - " + text(color) : ""}" class="product-vip__carrousel-image"></li>`,
            )
            .join("");
        if (window.UIkit) {
            UIkit.update(slider);
            UIkit.slider(slider)?.show(0);
        }
    }
    function available(p, s) {
        return s?.unlimited ? 999 : Math.max(0, Number(s?.stock ?? 0));
    }
    function inCart(id, variantId) {
        return cart
            .filter((x) => x.id === id && String(x.variantId) === String(variantId))
            .reduce((s, x) => s + x.qty, 0);
    }
    // Dibuja el carrito guardado en este navegador.
    function renderCart() {
        const count = cart.reduce((s, x) => s + x.qty, 0);
        $$(
            '.desktop-list__cart-count,.mobile__actions-cart-count,.cart-count,[class*="cart-quantity"],[class*="cart-counter"]',
        ).forEach((el) => (el.textContent = count));
        $$('a[uk-toggle*="cart-sidenav"]').forEach((a) => {
            const sp = $("span", a);
            if (sp && !sp.querySelector("svg")) sp.textContent = count;
        });
        const list = $(".cart-sidenav__content");
        if (!list) return;
        if (!cart.length) {
            list.innerHTML = '<li class="replica-cart-empty">El carrito de compras está vacio</li>';
            return;
        }
        list.innerHTML =
            cart
                .map((line, i) => {
                    const p = products.get(line.id);
                    if (!p) return "";
                    return `<li class="replica-cart-line"><a href="${p.path}"><img src="${text(photosFor(p, line.color || "")[0])}" alt="${text(p.name)}"></a><div><p><a href="${p.path}">${text(p.name)}</a></p><p>Talle: ${text(line.size)}${line.color ? " · " + text(line.color) : ""}</p><p>${money(line.price)}</p><div class="replica-cart-controls"><button type="button" data-cart-minus="${i}" aria-label="Quitar una unidad">−</button><span>${line.qty}</span><button type="button" data-cart-plus="${i}" aria-label="Sumar una unidad">+</button></div></div><button type="button" data-cart-remove="${i}" aria-label="Eliminar ${text(p.name)}">×</button></li>`;
                })
                .join("") +
            `<li class="replica-cart-summary"><div class="total"><span>Total</span><span>${money(cart.reduce((s, x) => s + x.price * x.qty, 0))}</span></div><button type="button" id="replica-start-checkout" class="button button--full background--primary contrast_text--primary uk-button uk-button-normal">Iniciar compra</button><a href="#" class="keep-shopping" data-close-cart>Seguir comprando</a></li>`;
    }
    // Talles y colores disponibles del modelo seleccionado.
    function renderVariants() {
        const wrap = $("#product-vip__attributes");
        if (!wrap || !product) return;
        variant = product.sizes.find((s) => available(product, s) > 0) || product.sizes[0];
        const colorOf = (s) => s.color || s.attributes?.Color || "";
        const colors = [...new Set(product.sizes.map(colorOf))];
        function draw() {
            const activeColor = colorOf(variant || {});
            showGallery(activeColor);
            const colorMarkup = colors.some(Boolean)
                ? `<div><p class="product-vip__attribute-name text--primary">Color</p><div class="product-vip__attribute-items">${colors.map((color, i) => `<a href="#" data-color="${i}" class="product-vip__attribute-item-default product-vip__attribute-item--${color === activeColor ? "selected" : "available"}" aria-label="Color ${text(color || "Sin especificar")}">${text(color || "Sin especificar")}</a>`).join("")}</div></div>`
                : "";
            wrap.innerHTML =
                colorMarkup +
                `<div><div class="product-vip__attribute"><p class="product-vip__attribute-name text--primary">Talle</p><div class="product-vip__attribute-items">${product.sizes.map((s, i) => (colorOf(s) !== activeColor ? "" : `<a href="#" data-variant="${i}" class="product-vip__attribute-item-default product-vip__attribute-item--${s === variant ? "selected" : available(product, s) > 0 ? "available" : "not-available"}" aria-label="Talle ${text(s.label)}" ${available(product, s) === 0 ? 'aria-disabled="true"' : ""}>${text(s.label)}</a>`)).join("")}</div></div></div>`;
            const price = $(".product-vip__price-value");
            if (price)
                price.textContent = money(variant?.price || product.offerPrice || product.price);
            const btn = $("#add_to_cart-btn");
            if (btn) {
                btn.disabled = !variant || available(product, variant) === 0;
                btn.textContent = btn.disabled ? "SIN STOCK" : "Agregar al carrito";
            }
        }
        wrap.addEventListener("click", (e) => {
            const color = e.target.closest("[data-color]");
            if (color) {
                e.preventDefault();
                const selected = colors[Number(color.dataset.color)];
                variant =
                    product.sizes.find(
                        (s) => colorOf(s) === selected && available(product, s) > 0,
                    ) || product.sizes.find((s) => colorOf(s) === selected);
                quantity = 1;
                drawQuantity();
                draw();
                return;
            }
            const a = e.target.closest("[data-variant]");
            if (!a) return;
            e.preventDefault();
            const s = product.sizes[Number(a.dataset.variant)];
            if (available(product, s) === 0) return;
            variant = s;
            quantity = 1;
            drawQuantity();
            draw();
        });
        draw();
    }
    function drawQuantity() {
        const n = $(".product-vip__quantity-value");
        if (n) n.textContent = quantity;
        const hidden = $("#quantity");
        if (hidden) hidden.value = quantity;
        const minus = $('[data-action="remove"]');
        if (minus) minus.classList.toggle("product-vip__quantity-button--disabled", quantity === 1);
    }
    function initCarousels() {
        $$("[data-product-preview-carrousel]").forEach((w) => {
            if (w.dataset.localReady) return;
            w.dataset.localReady = "1";
            const slides = $$(".product-preview-carrousel__item", w),
                dots = $$(".product-preview-carrousel__dotnav li", w);
            let n = 0;
            const go = (i) => {
                n = (i + slides.length) % slides.length;
                slides.forEach((s, j) => s.classList.toggle("is-active", j === n));
                dots.forEach((s, j) => s.classList.toggle("is-active", j === n));
            };
            w.addEventListener("click", (e) => {
                const nav = e.target.closest(".product-preview-carrousel__nav"),
                    dot = e.target.closest(".product-preview-carrousel__dotnav li");
                if (nav) {
                    e.preventDefault();
                    e.stopPropagation();
                    go(
                        n +
                            (nav.classList.contains("product-preview-carrousel__nav--prev")
                                ? -1
                                : 1),
                    );
                } else if (dot) {
                    e.preventDefault();
                    e.stopPropagation();
                    go(dots.indexOf(dot));
                }
            });
            let start;
            w.addEventListener("touchstart", (e) => (start = e.changedTouches[0].clientX), {
                passive: true,
            });
            w.addEventListener(
                "touchend",
                (e) => {
                    if (start === undefined) return;
                    const dx = e.changedTouches[0].clientX - start;
                    if (Math.abs(dx) > 45) go(n + (dx < 0 ? 1 : -1));
                    start = undefined;
                },
                { passive: true },
            );
        });
    }
    function makeCard(p, template) {
        const c = template.cloneNode(true);
        c.dataset.productId = p.id;
        $$("a", c).forEach((a) => {
            if (
                !a.classList.contains("product-preview-carrousel__nav") &&
                !a.classList.contains("btn-buy")
            )
                a.setAttribute("href", p.path);
        });
        const title = $(".products-feed__product-name a", c);
        if (title) title.textContent = p.name;
        const price = $(".products-feed__product-price", c);
        if (price) price.textContent = money(p.offerPrice || p.price);
        const legend = $(".products-feed__product-additional", c);
        if (legend) legend.textContent = p.legend;
        const items = $(".product-preview-carrousel__items", c);
        if (items)
            items.innerHTML = p.images
                .map(
                    (src, i) =>
                        `<div class="product-preview-carrousel__item${i === 0 ? " is-active" : ""}"><a class="products-feed__product-link" href="${p.path}"><img class="products-feed__product-image" src="${src}" loading="lazy" alt="${text(p.name)} - ${i}"></a></div>`,
                )
                .join("");
        const dots = $(".product-preview-carrousel__dotnav", c);
        if (dots)
            dots.innerHTML = p.images
                .map(
                    (_, i) =>
                        `<li class="${i === 0 ? "is-active" : ""}"><button type="button" aria-label="Imagen ${i + 1}"></button></li>`,
                )
                .join("");
        const carousel = $("[data-product-preview-carrousel]", c);
        if (carousel) delete carousel.dataset.localReady;
        const buy = $(".btn-buy", c);
        if (buy) buy.dataset.id = p.id;
        $$(".products-feed__product-out-stock,.products-feed__product-offer", c).forEach((e) =>
            e.remove(),
        );
        return c;
    }
    // Búsqueda y filtros del listado completo de productos.
    function initListing() {
        const first =
            $(".products-feed__products .products-feed__product") ||
            $("#product-card-template")?.content.firstElementChild;
        if (!first) return;
        const parent = $(".products-feed__products"),
            template = first.cloneNode(true),
            next = $("#products_feed-btn");
        let limit = 12;
        const q =
            path === "/search" ? (new URLSearchParams(location.search).get("q") || "").trim() : "";
        const core = window.PisadaCatalog,
            selectedSizes = new Set(),
            categorySelect = $("#category-filter"),
            stockFilter = $("#stock-filter");
        const initialCategory = catalog.categories.some((c) => c.path === path) ? path : "";
        if (categorySelect) categorySelect.value = initialCategory;
        $$('input[name="q"]').forEach((i) => (i.value = q));
        const rows = core.search(catalog.products, catalog.categories, q),
            sort = $("#product_order");
        function draw() {
            const filtered = core.filter(rows, {
                category: categorySelect?.value || "",
                sizes: [...selectedSizes],
                inStock: stockFilter?.checked || false,
            });
            const ordered = core.sort(filtered, Number(sort?.value ?? 4));
            const title = $(".browse-title"),
                count = $(".browse-count");
            if (title)
                title.textContent = q
                    ? `Resultados para “${q}”`
                    : catalog.categories.find((c) => c.path === categorySelect?.value)?.name ||
                      "Todos los modelos";
            if (count)
                count.textContent = `${ordered.length} modelo${ordered.length === 1 ? "" : "s"}${selectedSizes.size ? " · Talle " + [...selectedSizes].join(", ") : ""}`;
            parent.replaceChildren(...ordered.slice(0, limit).map((p) => makeCard(p, template)));
            if (!ordered.length) {
                const msg = document.createElement("div");
                msg.className = "replica-result-empty";
                msg.innerHTML =
                    '<h2>No encontramos modelos con esa selección.</h2><p>Probá otro talle o limpiá los filtros para seguir explorando.</p><a class="pisada-text-link" href="/productos">Ver todo el catálogo ↗</a>';
                parent.append(msg);
            }
            if (next) {
                next.hidden = ordered.length <= limit;
                next.style.display = ordered.length <= limit ? "none" : "";
            }
            initCarousels();
            UIkit.update(parent);
        }
        sort?.addEventListener("change", () => {
            limit = 12;
            draw();
        });
        next?.addEventListener("click", () => {
            limit += 12;
            draw();
        });
        categorySelect?.addEventListener("change", () => {
            limit = 12;
            draw();
        });
        stockFilter?.addEventListener("change", () => {
            limit = 12;
            draw();
        });
        $$("[data-size-filter]").forEach((b) =>
            b.addEventListener("click", () => {
                const size = b.dataset.sizeFilter;
                selectedSizes.has(size) ? selectedSizes.delete(size) : selectedSizes.add(size);
                b.setAttribute("aria-pressed", String(selectedSizes.has(size)));
                limit = 12;
                draw();
            }),
        );
        $("#clear-filters")?.addEventListener("click", () => {
            selectedSizes.clear();
            $$("[data-size-filter]").forEach((b) => b.setAttribute("aria-pressed", "false"));
            if (categorySelect) categorySelect.value = initialCategory;
            if (stockFilter) stockFilter.checked = false;
            limit = 12;
            draw();
        });
        if (matchMedia("(max-width: 959px)").matches) {
            const filters = $(".pisada-filters details");
            if (filters) filters.open = false;
        }
        draw();
    }
    /* CHECKOUT
     * Datos de contacto, entrega y forma de pago. Al confirmar, el servidor guarda el pedido
     * con los precios reales: tarjeta y Mercado Pago se pagan en Mercado Pago, y la
     * transferencia muestra los datos bancarios. El total final lo calcula siempre el servidor.
     */
    const ENVIO_COSTO = 9900;
    const PAGOS = {
        tarjeta: {
            titulo: "Tarjeta de crédito o débito",
            detalle: "Hasta 3 cuotas sin interés · Pago seguro con Mercado Pago",
            descuento: 0,
            cuotas: 3,
        },
        mercadopago: {
            titulo: "Mercado Pago",
            detalle: "Con el dinero de tu cuenta o tus tarjetas guardadas",
            descuento: 0,
        },
        transferencia: {
            titulo: "Transferencia bancaria",
            detalle: "10% OFF · Te mostramos el alias al confirmar",
            descuento: 0.1,
        },
    };
    const checkout = { entrega: "envio", pago: "tarjeta", datos: {}, enviando: false };
    function totales() {
        const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);
        const pares = cart.reduce((s, l) => s + l.qty, 0);
        const pago = PAGOS[checkout.pago];
        const descuento = Math.round(subtotal * pago.descuento);
        const envio = checkout.entrega === "retiro" || pares >= 2 ? 0 : ENVIO_COSTO;
        const total = subtotal - descuento + envio;
        return { subtotal, pares, descuento, envio, total, pago };
    }
    function radio(name, value, titulo, detalle, checked, disabled) {
        return `<label class="pisada-option${checked ? " is-checked" : ""}${disabled ? " is-disabled" : ""}"><input type="radio" name="${name}" value="${value}"${checked ? " checked" : ""}${disabled ? " disabled" : ""}><span><strong>${titulo}</strong><small>${detalle}</small></span></label>`;
    }
    function campo(id, label, attrs = "", valor = "") {
        return `<label class="pisada-field" for="co-${id}"><span>${label}</span><input id="co-${id}" name="${id}" value="${text(valor)}" ${attrs}></label>`;
    }
    function drawCheckout() {
        const body = $("#replica-checkout-body");
        if (!body) return;
        const t = totales();
        const d = checkout.datos;
        const cuota = t.pago.cuotas ? Math.ceil(t.total / t.pago.cuotas) : 0;
        body.innerHTML = `<form class="pisada-checkout" novalidate>
<div class="pisada-checkout__steps">
<fieldset><legend><b>1</b> Tus datos</legend>
<div class="pisada-checkout__grid">${campo("nombre", "Nombre y apellido", 'autocomplete="name" required minlength="3"', d.nombre)}${campo("telefono", "WhatsApp", 'type="tel" autocomplete="tel" required inputmode="tel" placeholder="11 2345-6789"', d.telefono)}</div>
${campo("email", "Correo electrónico", 'type="email" autocomplete="email" required placeholder="nombre@correo.com"', d.email)}
</fieldset>
<fieldset><legend><b>2</b> Entrega</legend>
<div class="pisada-options">${radio("entrega", "envio", "Envío a domicilio", t.pares >= 2 ? "Gratis por llevar 2 pares o más" : "A todo el país · " + money(ENVIO_COSTO) + " · Gratis desde 2 pares", checkout.entrega === "envio")}${radio("entrega", "retiro", "Retiro sin cargo", "Punto de entrega a coordinar en CABA", checkout.entrega === "retiro")}</div>
${
    checkout.entrega === "envio"
        ? `<div class="pisada-checkout__grid pisada-checkout__grid--3">${campo("direccion", "Calle y número", 'autocomplete="street-address" required', d.direccion)}${campo("localidad", "Localidad", 'autocomplete="address-level2" required', d.localidad)}${campo("cp", "Código postal", 'inputmode="numeric" autocomplete="postal-code" required pattern="[0-9A-Za-z]{4,8}"', d.cp)}</div>`
        : ""
}
</fieldset>
<fieldset><legend><b>3</b> Forma de pago</legend>
<div class="pisada-options">${Object.entries(PAGOS)
            .map(([k, p]) => radio("pago", k, p.titulo, p.detalle, checkout.pago === k))
            .join("")}</div>
</fieldset>
</div>
<aside class="pisada-checkout__summary">
<p class="pisada-checkout__title">Tu pedido</p>
<ul>${cart
            .map((l) => {
                const p = products.get(l.id);
                return `<li><img src="${text(photosFor(p, l.color || "")[0] || "")}" alt=""><span>${text(p?.name)}<small>Talle ${text(l.size)}${l.color ? " · " + text(l.color) : ""} · ${l.qty} ${l.qty === 1 ? "par" : "pares"}</small></span><b>${money(l.price * l.qty)}</b></li>`;
            })
            .join("")}</ul>
<div class="summary-row"><span>Subtotal</span><span>${money(t.subtotal)}</span></div>
${t.descuento ? `<div class="summary-row is-discount"><span>Descuento ${t.pago.titulo.toLowerCase()}</span><span>−${money(t.descuento)}</span></div>` : ""}
<div class="summary-row"><span>Envío</span><span>${t.envio ? money(t.envio) : "Gratis"}</span></div>
<div class="summary-row is-total"><span>Total</span><span>${money(t.total)}</span></div>
${cuota ? `<p class="pisada-checkout__cuotas">o 3 cuotas sin interés de <b>${money(cuota)}</b></p>` : ""}
<p class="pisada-checkout__error" role="alert"></p>
<button type="submit" class="pisada-button pisada-checkout__submit"${checkout.enviando ? " disabled" : ""}>${checkout.enviando ? "Procesando…" : checkout.pago === "transferencia" ? '<i class="fas fa-university" aria-hidden="true"></i> Confirmar y ver datos para transferir' : `<i class="fas fa-lock" aria-hidden="true"></i> Pagar ${money(t.total)}`}</button>
<p class="pisada-checkout__note">${checkout.pago === "transferencia" ? "Guardamos tu pedido y te mostramos el alias y el CBU para transferir." : "Vas a pagar en la página segura de Mercado Pago y volvés a la tienda con tu compra confirmada."}</p>
</aside>
</form>`;
    }
    // Envía el pedido al servidor y lleva al comprador a pagar o a los datos de transferencia.
    async function enviarPedido() {
        const d = checkout.datos;
        checkout.enviando = true;
        drawCheckout();
        try {
            const r = await fetch("/api/pedidos", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Pisada-Tienda": "1" },
                body: JSON.stringify({
                    method: checkout.pago,
                    delivery: checkout.entrega,
                    customer: {
                        name: d.nombre,
                        email: d.email,
                        phone: d.telefono,
                        address: d.direccion,
                        city: d.localidad,
                        zip: d.cp,
                    },
                    items: cart.map((l) => ({ id: l.id, variantId: l.variantId, qty: l.qty })),
                }),
            });
            const data = await r.json().catch(() => ({}));
            if (!r.ok || !data.redirect) throw new Error(data.error || "No pudimos confirmar el pedido. Volvé a intentar.");
            location.href = data.redirect;
        } catch (e) {
            checkout.enviando = false;
            drawCheckout();
            const box = $("#replica-checkout .pisada-checkout__error");
            if (box) box.textContent = e.message;
        }
    }
    function summary() {
        let modal = $("#replica-checkout");
        if (!modal) {
            modal = document.createElement("div");
            modal.id = "replica-checkout";
            modal.className = "pisada-checkout-modal";
            modal.setAttribute("uk-modal", "");
            modal.innerHTML =
                '<div class="modal__dialog uk-modal-dialog uk-margin-auto-vertical replica-checkout"><div class="modal__header uk-modal-header"><button class="uk-modal-close-default text--primary" type="button" uk-close aria-label="Cerrar"></button><p class="modal__title uk-modal-title text--primary">Finalizar compra</p></div><div class="modal__body uk-modal-body" id="replica-checkout-body"></div></div>';
            document.body.append(modal);
            modal.addEventListener("input", (e) => {
                if (e.target.matches(".pisada-field input"))
                    checkout.datos[e.target.name] = e.target.value;
            });
            modal.addEventListener("change", (e) => {
                if (e.target.name === "entrega" || e.target.name === "pago") {
                    checkout[e.target.name] = e.target.value;
                    drawCheckout();
                }
            });
            modal.addEventListener("submit", (e) => {
                e.preventDefault();
                if (checkout.enviando) return;
                const form = e.target;
                const error = $(".pisada-checkout__error", form);
                const invalid = [...form.querySelectorAll("input[required]")].find(
                    (i) => !i.checkValidity() || !i.value.trim(),
                );
                const telefono = (checkout.datos.telefono || "").replace(/\D/g, "");
                if (invalid || telefono.length < 8) {
                    const campoMal = invalid || $("#co-telefono", form);
                    error.textContent =
                        campoMal.id === "co-telefono"
                            ? "Ingresá un número de WhatsApp válido."
                            : "Completá " + $("span", campoMal.closest("label")).textContent.toLowerCase() + ".";
                    campoMal.focus();
                    return;
                }
                if (!cart.length) {
                    error.textContent = "Tu carrito está vacío.";
                    return;
                }
                enviarPedido();
            });
        }
        drawCheckout();
        UIkit.offcanvas("#cart-sidenav").hide();
        UIkit.modal(modal).show();
    }
    document.addEventListener(
        "click",
        (e) => {
            const contact = e.target.closest('a[href="#contacto"]');
            if (!contact) return;
            e.preventDefault();
            e.stopPropagation();
            const go = () => {
                if (location.hash !== "#contacto") history.pushState(null, "", "#contacto");
                $("#contacto")?.scrollIntoView({
                    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                        ? "auto"
                        : "smooth",
                    block: "start",
                });
            };
            const menu = contact.closest("#mobile-menu-sidenav");
            if (menu && menu.classList.contains("uk-open")) {
                menu.addEventListener("hidden", go, { once: true });
                UIkit.offcanvas(menu).hide();
            } else go();
        },
        true,
    );
    document.addEventListener("click", (e) => {
        const q = e.target.closest(".product-vip__quantity-button");
        if (q) {
            e.preventDefault();
            quantity = Math.min(
                Math.max(1, quantity + (q.dataset.action === "add" ? 1 : -1)),
                Math.max(1, available(product, variant) - inCart(product.id, variant?.id)),
            );
            drawQuantity();
        }
        const buy = e.target.closest(".btn-buy");
        if (buy) {
            e.preventDefault();
            const p = products?.get(Number(buy.dataset.id));
            if (p) location.href = p.path;
        }
        const remove = e.target.closest("[data-cart-remove]"),
            plus = e.target.closest("[data-cart-plus]"),
            minus = e.target.closest("[data-cart-minus]");
        if (remove) {
            cart.splice(Number(remove.dataset.cartRemove), 1);
            storeCart();
        }
        if (plus) {
            const l = cart[Number(plus.dataset.cartPlus)],
                p = products.get(l.id),
                s = p.sizes.find((s) => String(s.id) === String(l.variantId));
            if (l.qty < available(p, s)) l.qty++;
            storeCart();
        }
        if (minus) {
            const i = Number(minus.dataset.cartMinus);
            if (cart[i].qty > 1) cart[i].qty--;
            else cart.splice(i, 1);
            storeCart();
        }
        if (e.target.closest("[data-close-cart]")) {
            e.preventDefault();
            UIkit.offcanvas("#cart-sidenav").hide();
        }
        if (e.target.closest("#replica-start-checkout")) summary();
    });
    document.addEventListener("submit", (e) => {
        const form = e.target;
        if (form.action && new URL(form.action).pathname === "/search") return;
        e.preventDefault();
        if (form.id === "add_to_cart-form") {
            if (!variant || available(product, variant) === 0) return;
            const existing = cart.find(
                (l) => l.id === product.id && String(l.variantId) === String(variant.id),
            );
            if (inCart(product.id, variant.id) + quantity > available(product, variant)) {
                note(
                    $("#add_to_cart-msg"),
                    "No hay suficiente stock para la cantidad seleccionada.",
                );
                return;
            }
            if (existing) existing.qty += quantity;
            else
                cart.push({
                    id: product.id,
                    variantId: String(variant.id),
                    size: variant.label,
                    color: variant.color || "",
                    qty: quantity,
                    price: variant.price || product.offerPrice || product.price,
                });
            storeCart();
            showCart();
        } else if (form.id === "shipment_cost-form") {
            const code = $("#shipment_cost-cp").value.trim();
            note(
                $(".product-vip__shipping-results"),
                /^\d{4}$/.test(code)
                    ? "El cálculo de envíos no está conectado en esta copia de prueba."
                    : "Ingrese un código postal válido",
            );
        } else if (
            form.id === "login-form" ||
            form.id === "register-form" ||
            form.id === "recover-form"
        ) {
            note(
                $(".modal__body", form),
                "Esta copia de prueba no está conectada a las cuentas de clientes de Empretienda.",
            );
            $$('input[type="password"]', form).forEach((i) => (i.value = ""));
        } else
            note(
                $(".modal__body", form) || form,
                "Este formulario no envía información desde la copia de prueba.",
            );
    });
    // Solicita el catálogo y actualiza la información visible.
    fetch("/catalog.json")
        .then((r) => {
            if (!r.ok) throw new Error("catalog");
            return r.json();
        })
        .then((data) => {
            catalog = data;
            products = new Map(data.products.map((p) => [p.id, p]));
            cart = cart.flatMap((l) => {
                const p = products.get(l.id),
                    s = p?.sizes.find((s) =>
                        l.variantId ? String(s.id) === String(l.variantId) : s.label === l.size,
                    );
                return s && Number.isInteger(l.qty) && l.qty > 0 && available(p, s) > 0
                    ? [
                          {
                              ...l,
                              variantId: String(s.id),
                              color: s.color || "",
                              price: s.price || p.price,
                              qty: Math.min(l.qty, available(p, s)),
                          },
                      ]
                    : [];
            });
            product = products.get(Number(document.body.dataset.productId));
            renderCart();
            renderVariants();
            drawQuantity();
            initListing();
            initCarousels();
        })
        .catch(() => {
            const m = $("main") || $("section") || document.body;
            note(m, "No se pudo cargar el catálogo. Recargá la página para volver a intentarlo.");
        });
})();
