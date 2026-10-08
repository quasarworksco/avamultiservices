# AVA Multiservices — Sitio web

Sitio estático (HTML + CSS + JS, sin dependencias) para **AVA Multiservices**, Dallas, Texas.
Dominio: https://avamultiservices.dgp-link.com — Diseñado por [DGP Global Group](https://dgpglobalgroup.com).

## Estructura

| Ruta | Descripción |
| --- | --- |
| `index.html` | Sitio principal: Inicio, Servicios, Nosotros, Proceso, FAQ y Contacto (ES/EN) |
| `gracias.html` | Página de agradecimiento a la que redirige el formulario |
| `propuesta/` | Presentación para el cliente (Factura REC-YEXRJM), con `noindex` |
| `404.html` | Página de error |
| `assets/css/styles.css` | Estilos con la identidad de marca: Warm Stone `#D2D1CD`, Sage Taupe `#A4A294`, Heritage Brown `#736251`, Charcoal `#2A2A2A`, Pure White `#FFFFFF` |
| `assets/js/main.js` | Animaciones, menú, idioma ES/EN y validación del formulario |
| `assets/img/` | Wordmark `logo.svg` / `logo-light.svg`, favicons, `og-image.jpg` (1200×630) e `icons.svg` (fuente del sprite) |
| `robots.txt`, `sitemap.xml`, `site.webmanifest` | SEO / PWA |

## Formulario

Envía con [FormSubmit](https://formsubmit.co) a `anavargasdoria@gmail.com` y redirige a `gracias.html`.
El **primer envío** genera un correo de activación que la clienta debe confirmar.
Después de activarlo, se puede reemplazar el correo del `action` por el alias aleatorio que entrega FormSubmit para ocultarlo del código.

## Pendientes del cliente

- Archivos originales del logo (para sustituir `assets/img/logo.svg`).
- Fuente **Bochan Serif** con licencia web: copiar el `.woff2` a `assets/fonts/` y declararla con `@font-face`; la variable `--font-serif` ya la prioriza. Mientras tanto se usa Cormorant Garamond.
- Fotografías del manual de marca (opcional).
- Confirmar la lista de servicios y los textos.

## Íconos

Los íconos están en un sprite SVG en línea al inicio de cada página. `assets/img/icons.svg` es la fuente;
si se agrega un ícono, también hay que copiarlo en el sprite de cada HTML.
