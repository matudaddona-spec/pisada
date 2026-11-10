// Copia los archivos visibles de la tienda al directorio público del servidor.
// Las carpetas originales CSS, JS, IMG y RECURSOS son las que se editan.
import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const project = fileURLToPath(new URL("../../", import.meta.url));
const publicDirectory = fileURLToPath(new URL("../public/", import.meta.url));
await mkdir(publicDirectory, { recursive: true });
for (const directory of ["CSS", "JS", "IMG", "RECURSOS"]) {
    await cp(path.join(project, directory), path.join(publicDirectory, directory), {
        recursive: true,
    });
}
