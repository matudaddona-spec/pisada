const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const sandbox = { module: { exports: {} } };
require("node:vm").runInNewContext(
    fs.readFileSync(path.join(root, "public/JS/catalogo.js"), "utf8"),
    sandbox,
);
const core = sandbox.module.exports;
const data = JSON.parse(fs.readFileSync(path.join(root, "data/catalog-seed.json"), "utf8"));

// Búsqueda por categoría: "running" encuentra todos los modelos de esa categoría.
const running = core.search(data.products, data.categories, "Running");
const expected = data.products.filter((p) => p.categoryPath === "/running");
assert(expected.length > 0);
assert.equal(running.length, expected.length);
assert.deepEqual(new Set(running.map((p) => p.id)), new Set(expected.map((p) => p.id)));
assert(running.some((p) => p.path === "/running/nike-free-rn-flyknit"));

// La búsqueda ignora mayúsculas y tildes.
const basquet = data.products.filter((p) => p.categoryPath === "/basquet").length;
assert.equal(core.search(data.products, data.categories, "BASQUET").length, basquet);
assert.equal(core.search(data.products, data.categories, "básquet").length, basquet);
// También busca por color: "lona naranja" encuentra la Converse que viene en naranja.
const lonaNaranja = core.search(data.products, data.categories, "lona naranja");
assert.deepEqual(lonaNaranja.map((p) => p.path), ["/lona/converse-chuck-70-hi"]);
assert(core.search(data.products, data.categories, "jordan rojo").some((p) => p.path === "/basquet/air-jordan-12-retro"));
assert.equal(core.search(data.products, data.categories, "modelo-inexistente-xyz").length, 0);

const synthetic = [
    {
        categoryPath: "/running",
        sizes: [
            { label: "40", stock: 0 },
            { label: "41", stock: 2 },
        ],
    },
    { categoryPath: "/lona", sizes: [{ label: "40", unlimited: true }] },
];
assert.equal(core.filter(synthetic, { sizes: ["40"] }).length, 1);
assert.equal(core.filter(synthetic, { category: "/running", sizes: ["40"] }).length, 0);
assert.equal(core.filter(synthetic, { category: "/running", sizes: ["41"] }).length, 1);
assert.equal(core.filter(synthetic, { sizes: ["40", "41"] }).length, 2);

const size40 = core.filter(running, { sizes: ["40"] });
const size40Expected = running.filter((p) =>
    p.sizes.some((s) => s.label === "40" && (s.unlimited || s.stock > 0)),
);
assert.equal(size40.length, size40Expected.length);
assert(size40.every((p) => p.sizes.some((s) => s.label === "40" && core.available(s))));

const sorted = core.sort(running, 2);
assert(
    sorted.every(
        (p, i) =>
            !i || (p.offerPrice || p.price) >= (sorted[i - 1].offerPrice || sorted[i - 1].price),
    ),
);
console.log(
    JSON.stringify({
        runningResults: running.length,
        talle40: size40.length,
        categoryFound: true,
        accentInsensitive: true,
        sizeAvailability: true,
        multipleSizes: true,
        priceOrdering: true,
    }),
);
