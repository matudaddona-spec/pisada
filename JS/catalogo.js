/* CATÁLOGO
 * Funciones compartidas para buscar, filtrar y ordenar productos.
 */
(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory();
    else root.PisadaCatalog = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";
    const normalize = (value) =>
        String(value ?? "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .trim();
    const available = (size) => Boolean(size.unlimited) || Number(size.stock) > 0;
    function search(products, categories, query) {
        const tokens = normalize(query).split(" ").filter(Boolean),
            names = new Map(categories.map((c) => [c.path, c.name]));
        return products.filter((p) => {
            const colors = (p.sizes || [])
                .map((s) => s.color || s.attributes?.Color || "")
                .join(" ");
            const haystack = normalize(
                p.name + " " + (names.get(p.categoryPath) || "") + " " + colors,
            );
            return tokens.every((t) => haystack.includes(t));
        });
    }
    function filter(products, { category = "", sizes = [], inStock = false } = {}) {
        return products.filter(
            (p) =>
                (!category || p.categoryPath === category) &&
                (!inStock || p.sizes.some(available)) &&
                (!sizes.length ||
                    p.sizes.some((s) => sizes.includes(String(s.label)) && available(s))),
        );
    }
    function sort(products, mode = 4) {
        return [...products].sort((a, b) =>
            mode === 0
                ? b.id - a.id
                : mode === 1
                  ? a.id - b.id
                  : mode === 2
                    ? (a.offerPrice || a.price) - (b.offerPrice || b.price)
                    : mode === 3
                      ? (b.offerPrice || b.price) - (a.offerPrice || a.price)
                      : b.order - a.order,
        );
    }
    return { normalize, available, search, filter, sort };
});
