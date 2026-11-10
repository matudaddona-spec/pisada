// Pruebas de las fotos por color de cada modelo.
import assert from "node:assert/strict";
import { normalizeProduct, imagesForColor, firstVariant } from "../lib/catalog-domain.mjs";
import seed from "../data/catalog-seed.json" with { type: "json" };

const categories = [{ path: "/basquet" }];
const base = {
    name: "Prueba",
    categoryPath: "/basquet",
    price: 1000,
    images: ["/IMG/a.jpg", "/IMG/b.jpg", "/IMG/c.jpg"],
    sizes: [
        { label: "40", color: "Rojo", stock: 0 },
        { label: "40", color: "Azul", stock: 2 },
    ],
};

// Las fotos guardan su color sin importar mayúsculas.
const p = normalizeProduct(
    { ...base, imageColors: { "/IMG/a.jpg": "rojo", "/IMG/b.jpg": "Azul", "/IMG/otra.jpg": "Azul" } },
    categories,
);
assert.deepEqual(p.imageColors, { "/IMG/a.jpg": "Rojo", "/IMG/b.jpg": "Azul" });

// Un color que no existe en los talles se rechaza.
assert.throws(() => normalizeProduct({ ...base, imageColors: { "/IMG/a.jpg": "Verde" } }, categories));

// Sin marcas, el modelo funciona igual que antes.
assert.deepEqual(normalizeProduct(base, categories).imageColors, {});

// La tienda muestra las fotos del color y las que sirven para todos.
assert.deepEqual(imagesForColor(p, "Azul"), ["/IMG/b.jpg", "/IMG/c.jpg"]);
assert.deepEqual(imagesForColor(p, "Rojo"), ["/IMG/a.jpg", "/IMG/c.jpg"]);
assert.deepEqual(imagesForColor({ images: ["/IMG/x.jpg"], imageColors: { "/IMG/x.jpg": "Rojo" } }, "Azul"), ["/IMG/x.jpg"]);
assert.equal(firstVariant(p).color, "Azul", "arranca en el primer color con stock");

// Los modelos de demostración con colores tienen fotos para cada color.
const colored = seed.products.filter((x) => Object.keys(x.imageColors || {}).length);
assert.ok(colored.length >= 2);
for (const x of colored) {
    const colors = new Set(x.sizes.map((s) => s.attributes.Color));
    assert.ok(colors.size >= 2, x.name);
    for (const c of colors) assert.ok(x.images.some((src) => x.imageColors[src] === c), x.name + " " + c);
}

console.log(JSON.stringify({ photoColorsSaved: true, unknownColorRejected: true, galleryByColor: true, demoModels: colored.map((x) => x.name) }));
