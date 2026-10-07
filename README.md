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
| `assets/css/styles.css` | Estilos (paleta `#1438cc`, `#ffffff`, `#f1f5f9`) |
| `assets/js/main.js` | Animaciones, menú, idioma ES/EN y validación del formulario |
| `assets/img/` | Logo provisional, favicons, `og-image.jpg` (1200×630) e `icons.svg` (fuente del sprite) |
| `robots.txt`, `sitemap.xml`, `site.webmanifest` | SEO / PWA |

## Formulario

Envía con [FormSubmit](https://formsubmit.co) a `anavargasdoria@gmail.com` y redirige a `gracias.html`.
El **primer envío** genera un correo de activación que la clienta debe confirmar.
Después de activarlo, se puede reemplazar el correo del `action` por el alias aleatorio que entrega FormSubmit para ocultarlo del código.

## Pendientes del cliente

- Logo oficial en alta resolución (reemplazar `assets/img/logo-mark.svg` y los favicons, y regenerar `og-image.jpg`).
- Fotos profesionales (opcional).
- Confirmar la lista de servicios y los textos.

## Íconos

Los íconos están en un sprite SVG en línea al inicio de cada página. `assets/img/icons.svg` es la fuente;
si se agrega un ícono, también hay que copiarlo en el sprite de cada HTML.
