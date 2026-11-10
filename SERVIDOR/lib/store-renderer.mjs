// Completa las plantillas HTML con productos y categorías del catálogo.
import {
    escapeHtml as e,
    measurementMap,
    plainText,
    imagesForColor,
    firstVariant,
} from "./catalog-domain.mjs";
const money = (n) =>
    "$" + Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const replace = (source, values) =>
    Object.entries(values).reduce((s, [k, v]) => s.replaceAll("__" + k + "__", String(v)), source);
const linkClass = "desktop-list-link__text desktop-list-link__text--bold text--primary";
function card(p, home = false) {
    const prefix = home ? "block-products-feed" : "products-feed";
    const slides = p.images
        .map(
            (src, i) =>
                `<div class="product-preview-carrousel__item${i === 0 ? " is-active" : ""}"><a href="${e(p.path)}" class="${prefix}__product-link"><img class="${prefix}__product-image" src="${e(src)}" alt="${e(p.name)} - ${i + 1}" loading="lazy"></a></div>`,
        )
        .join("");
    return `<div class="${prefix}__product${home ? " uk-width-1-4@l uk-width-1-3@m uk-width-1-2" : " uk-width-1-4@xl uk-width-1-3@m uk-width-1-2"}"><div class="${prefix}__product-wrapper"><div class="${prefix}__product-media"><div class="product-preview-carrousel" data-product-preview-carrousel><div class="product-preview-carrousel__items">${slides}</div><a class="product-preview-carrousel__nav product-preview-carrousel__nav--prev" href="#" aria-label="Anterior">‹</a><a class="product-preview-carrousel__nav product-preview-carrousel__nav--next" href="#" aria-label="Siguiente">›</a><ul class="product-preview-carrousel__dotnav">${p.images.map((_, i) => `<li class="${i === 0 ? "is-active" : ""}"><button type="button" aria-label="Imagen ${i + 1}"></button></li>`).join("")}</ul></div></div><div class="uk-flex uk-flex-center uk-flex-column uk-margin-small-top"><div class="${prefix}__product-info uk-text-center"><h3 class="${prefix}__product-name text--primary"><a href="${e(p.path)}">${e(p.name)}</a></h3><p class="${prefix}__product-price text--primary uk-flex uk-flex-center">${money(p.offerPrice || p.price)}</p><p class="${prefix}__product-additional text--primary">${e(p.legend)}</p></div><div class="${prefix}__product-buttons contrast_text--primary"><a href="${e(p.path)}" class="${prefix}__product-buttons-buy btn-buy background--primary contrast_text--primary" data-id="${p.id}">Comprar</a></div></div></div></div>`;
}
export function renderStore(templates, catalog, url) {
    const path = decodeURI(url.pathname).replace(/\/$/, "") || "/",
        p = catalog.products.find((p) => p.path === path),
        category = catalog.categories.find((c) => c.path === path);
    let source,
        title = "Tienda online de Pisada",
        values = {};
    if (path === "/") {
        source = templates.home;
        values.HOME_CARDS = catalog.homeProductIds
            .map((id) => catalog.products.find((p) => p.id === id))
            .filter(Boolean)
            .map((p) => card(p, true))
            .join("");
        values.PRODUCT_COUNT = catalog.products.length;
    } else if (path === "/productos" || path === "/search" || category) {
        source = templates.listing;
        title = (category?.name || "Productos") + " - Pisada";
        values.LISTING_CARDS = catalog.products
            .slice(0, 12)
            .map((p) => card(p))
            .join("");
        values.LISTING_TITLE = e(category?.name || "Todos los modelos");
        values.LISTING_COUNT = "";
        values.CATEGORY_OPTIONS =
            '<option value="">Todas las categorías</option>' +
            catalog.categories
                .map((c) => `<option value="${e(c.path)}">${e(c.name)}</option>`)
                .join("");
        source = source.replace('data-page-path="/productos"', `data-page-path="${e(path)}"`);
        source = source.replace(
            "</body>",
            `<template id="product-card-template">${card(catalog.products[0] || { id: 0, name: "", path: "/productos", price: 0, legend: "", images: [] })}</template></body>`,
        );
    } else if (p) {
        source = templates.product;
        title = p.name + " - Pisada";
        const measures = measurementMap(p),
            whatsapp =
                "https://wa.me/5491128383634?text=" +
                encodeURIComponent("Hola, tengo una consulta por " + p.name);
        values = {
            PRODUCT_ID: p.id,
            PRODUCT_PATH: e(p.path),
            PRODUCT_NAME: e(p.name),
            PRODUCT_PRICE: money(p.offerPrice || p.price),
            PRODUCT_QUALITY: e(p.legend || ""),
            CATEGORY_PATH: e(p.categoryPath),
            CATEGORY_NAME: e(
                catalog.categories.find((c) => c.path === p.categoryPath)?.name || "Productos",
            ),
            PRODUCT_SLIDES: imagesForColor(
                p,
                firstVariant(p).color || firstVariant(p).attributes?.Color || "",
            )
                .map(
                    (src) =>
                        `<li><img src="${e(src)}" alt="${e(p.name)}" class="product-vip__carrousel-image"></li>`,
                )
                .join(""),
            DESCRIPTION_HTML: p.descriptionHtml || "",
            PRODUCT_WHATSAPP: e(whatsapp),
            GUIDE_ROWS: [...new Set(p.sizes.map((s) => s.label))]
                .map(
                    (label) =>
                        `<tr><th scope="row">${e(label)}</th><td>${measures.has(label) ? e(measures.get(label)) + " cm" : `<a href="${e("https://wa.me/5491128383634?text=" + encodeURIComponent("Hola, quiero consultar la medida del talle " + label + " de " + p.name))}" target="_blank" rel="noopener noreferrer">Consultar medida ↗</a>`}</td></tr>`,
                )
                .join(""),
        };
    } else return null;
    const desktop = catalog.categories
        .map(
            (c) =>
                `<ul class="uk-nav uk-navbar-dropdown-nav"><li class="desktop-list__subitem text--primary"><a href="${e(c.path)}" class="${linkClass}">${e(c.name)}</a></li></ul>`,
        )
        .join("");
    const mobile =
        '<li class="mobile-menu-sidenav__list-item"><a href="/productos" class="mobile-menu-sidenav__item-link">Ver todo en Productos</a></li>' +
        catalog.categories
            .map(
                (c) =>
                    `<li class="mobile-menu-sidenav__list-item"><a href="${e(c.path)}" class="mobile-menu-sidenav__item-link">${e(c.name)}</a></li>`,
            )
            .join("");
    return replace(source, {
        ...values,
        PAGE_TITLE: e(title),
        OG_IMAGE: e(
            new URL(p?.images[0] || catalog.products[0]?.images[0] || "/IMG/logo.jpg", url.origin)
                .href,
        ),
        DESKTOP_CATEGORIES: desktop,
        MOBILE_CATEGORIES: mobile,
    });
}
