# Pisada · Demo de tienda de zapatillas

Tienda de demostración con una marca inventada (Pisada), un catálogo de 30 modelos reales (Nike, Jordan, adidas, Converse, Vans, Puma y otros) en 6 categorías y fotos libres de Unsplash (licencia Unsplash: uso gratuito, también comercial, sin atribución obligatoria). Seis modelos vienen en varios colores y cada color tiene sus fotos. Algunos colores son fotos recoloreadas solo para la demo: el azul y el verde de la Air Jordan 12, el azul y violeta de la Air Max 1 y el rojo de la Dunk High. Para usarla con un cliente real, reemplazá las fotos de `IMG/`, el catálogo de `SERVIDOR/data/catalog-seed.json` y los datos de contacto.

La carpeta está organizada como tu proyecto de Coderhouse.

```text
web de zapatillas/
├── CSS/
├── IMG/
├── JS/
├── PAGES/
├── SCSS/
├── RECURSOS/
├── SERVIDOR/
├── index.html
├── package.json
└── LEEME.md
```

Empezá por `index.html`. En `SCSS/` tenés los estilos separados por encabezado, inicio, productos, ficha, carrito, contacto y administrador. `CSS/` contiene el resultado compilado. `JS/` contiene los comportamientos e `IMG/` las fotografías.

`RECURSOS/` agrupa las bibliotecas y fuentes de la interfaz. `SERVIDOR/` reúne el acceso privado, la base de datos y el guardado del stock y las fotografías nuevas.

Para probar todo, abrí una terminal en esta carpeta y ejecutá `npm run instalar`, luego `npm run db:local` una sola vez y finalmente `npm run dev`. La dirección local aparece en la terminal. El administrador se abre agregando `/admin` a esa dirección.

Esta tienda utiliza datos del servidor. Los archivos HTML son plantillas que se completan al ejecutar la aplicación.

## Para empezar a leer el código

Abrí toda esta carpeta en Visual Studio Code y empezá por `index.html`.

| Archivo o carpeta | Qué contiene |
| --- | --- |
| `index.html` | Plantilla de la página de inicio |
| `PAGES/productos.html` | Catálogo, buscador y filtros |
| `PAGES/producto.html` | Ficha del modelo, talles, colores y medidas |
| `PAGES/administrador.html` | Panel, formularios, stock, movimientos y Papelera |
| `SCSS/` | Estilos editables, separados en módulos |
| `CSS/` | CSS generado por SASS |
| `JS/main.js` | Carrito y comportamientos de la tienda |
| `JS/catalogo.js` | Búsqueda, filtros y orden de los resultados |
| `JS/administrador.js` | Comportamientos del administrador |
| `IMG/` | Fotografías originales del catálogo |
| `RECURSOS/ui/` | Bibliotecas, fuentes y recursos de la interfaz original |
| `SERVIDOR/data/catalog-seed.json` | Catálogo inicial de 30 modelos, con talles, colores y fotos por color, en 6 categorías |
| `SERVIDOR/lib/catalog-domain.mjs` | Validaciones de productos y stock |
| `SERVIDOR/lib/inventory-service.mjs` | Guardado de datos, movimientos e imágenes nuevas |
| `SERVIDOR/lib/store-renderer.mjs` | Completado de las plantillas con los datos |
| `SERVIDOR/app/[[...slug]]/route.ts` | Rutas públicas y operaciones privadas del servidor |
| `SERVIDOR/app/chatgpt-auth.ts` | Integración actual del acceso con Sites |
| `SERVIDOR/db/` y `SERVIDOR/drizzle/` | Estructura y migración inicial de la base de datos |
| `SERVIDOR/scripts/` | Herramientas para desarrollo y comprobaciones |

Los textos entre dobles guiones bajos, como `__HOME_CARDS__`, son espacios que el servidor completa con información del catálogo. Las rutas del navegador se mantienen como `/productos`, `/running`, la dirección de cada modelo y `/admin`.

## Abrir la web en tu computadora

Necesitás Node.js 22.13 o posterior y acceso a internet para la primera instalación de las dependencias.

1. Extraé el ZIP y abrí la carpeta `web de zapatillas` en Visual Studio Code.
2. Abrí una terminal dentro de esa carpeta y ejecutá `npm run instalar`.
3. Creá la base de datos local una sola vez con `npm run db:local`.
4. Iniciá la aplicación con `npm run dev`.
5. Abrí `http://127.0.0.1:5173`.
6. Para probar el administrador, abrí `http://127.0.0.1:5173/admin` y utilizá el acceso local de prueba. La primera entrada autorizada importa el catálogo inicial.

Si la base local ya está creada, podés pasar directamente a `npm run dev`. Los datos de esa prueba se guardan en `SERVIDOR/.wrangler/state` dentro de tu copia. La aplicación completa se abre con su servidor de desarrollo, porque las páginas consultan una base de datos y utilizan rutas dinámicas.

## Editar los estilos

Modificá los archivos de `SCSS/`. `style.scss` reúne el carrito, la tienda y las adaptaciones de pantalla. `base.scss` reúne la tipografía y los colores heredados de la interfaz. `administrador.scss` reúne el panel.

Ejecutá `npm run sass` para generar el CSS. También podés usar `npm run sass:watch` en otra terminal para regenerarlo cada vez que guardás. Los comandos de desarrollo y compilación ejecutan SASS automáticamente antes de arrancar.

## Qué incluye

- Búsqueda por nombre o categoría desde la lupa, con filtros por talle y stock, orden y paginación.
- Fotografías, descripciones y guías de medidas publicadas. Las medidas faltantes se consultan por WhatsApp.
- Contacto por WhatsApp y correo al pie de página. Los íconos de redes sociales todavía no apuntan a cuentas reales.
- Creación y edición de modelos, categorías y hasta diez fotografías por modelo.
- Cantidades por talle y color, con precio opcional por variante.
- Registro de ingresos, ventas confirmadas y ajustes con historial.
- Publicación, ocultamiento, eliminación recuperable y restauración desde Papelera.
- Controles para evitar que dos ediciones simultáneas se pisen o que un reintento descuente stock dos veces.
- Compra en la web con 3 formas de pago (ver abajo) y pestaña **Pedidos** en el administrador.

## Pagos

| Forma de pago | Cómo funciona |
|---|---|
| Tarjeta de crédito o débito | Paga en Mercado Pago (Checkout Pro), hasta 3 cuotas. Vuelve a `/pedido/...` y el pedido queda pagado solo. |
| Mercado Pago | Igual, con el dinero de la cuenta o las tarjetas guardadas del comprador. |
| Transferencia | 10% OFF. Muestra alias y CBU. El dueño confirma el pago en **Pedidos** y ahí se descuenta el stock. |

- Los precios y el total los calcula siempre el servidor; el navegador no puede cambiarlos.
- Un pago se da por aprobado solo después de consultarlo a la API de Mercado Pago (pedido y monto tienen que coincidir). El stock se descuenta una sola vez.
- **Configuración:** en `SERVIDOR/.dev.vars` pegá `MP_ACCESS_TOKEN=` con el Access Token **de prueba** de Mercado Pago (Mercado Pago Developers → Tus integraciones → Credenciales de prueba). Ahí también van `BANK_ALIAS`, `BANK_CBU`, `BANK_HOLDER` y `BANK_NAME`. Ese archivo no se comparte. Después de editarlo, reiniciá la web.
- Para pagar de prueba usá las tarjetas de prueba de Mercado Pago y un usuario comprador de prueba (no tu cuenta real).
- Publicada en internet (https), Mercado Pago avisa los pagos a `/api/pagos/mercadopago` aunque el comprador cierre la ventana. En la compu ese aviso no llega: el pago se confirma cuando el comprador vuelve a la tienda.
- Para producción: `wrangler secret put MP_ACCESS_TOKEN` con el Access Token real.

## Estado de esta entrega

Esta copia incluye el catálogo inicial capturado el 3 de noviembre de 2026. Los cambios posteriores guardados en la base del sitio publicado, sus movimientos y las imágenes subidas a R2 requieren una exportación de esos datos por separado. El ZIP contiene el código y los recursos originales, sin credenciales ni datos locales de pruebas.

La aplicación usa Vinext sobre Cloudflare Workers, D1 para el catálogo y R2 para nuevas imágenes. El código de servidor amplía los contenidos de HTML y SASS del curso para permitir administración e inventario persistentes.

El acceso de producción sigue integrado con Sites y la cuenta autorizada en `SERVIDOR/app/[[...slug]]/route.ts`. El acceso local es una simulación para desarrollo. Para publicar por cuenta propia en Cloudflare hay que configurar los recursos reales y un inicio de sesión seguro para el dueño que proteja también las operaciones de administración.
El carrito se guarda en el navegador. Los cobros online y el cálculo de envíos todavía quedan por conectar. El stock baja cuando se registra una venta confirmada en el administrador. Agregar productos al carrito o abrir WhatsApp conserva las cantidades disponibles.

La copia es independiente del catálogo de Empretienda y necesita una integración específica si se quiere sincronizar esa plataforma.

La configuración exportada conserva los nombres de las conexiones `DB` y `BUCKET`. No tiene un sitio publicado asignado. Antes de publicar, elegí el dominio o subdominio del negocio y comprobá que el enlace público respete la preferencia de usar el nombre del cliente o uno neutro.

## Comprobaciones

`npm run check` ejecuta las pruebas de búsqueda, filtros, inventario, imágenes, eliminación y restauración.

`npm run build` genera la aplicación en `SERVIDOR/dist/`. Las dependencias se instalan desde `SERVIDOR/package-lock.json`. Las bibliotecas externas conservan sus archivos y avisos de licencia.
