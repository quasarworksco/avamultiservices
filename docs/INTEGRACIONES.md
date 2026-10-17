# Integraciones del CRM de AVA

El código ya está publicado en Supabase. Cada integración se activa sola en cuanto se guardan sus claves en
**Supabase → Edge Functions → Secrets**. Las claves nunca van en el código ni en el sitio.

| Función | Para qué | URL |
|---|---|---|
| `meta-webhook` | Recibe WhatsApp, Instagram, Messenger y leads de Meta Ads | `https://szmkcwtkorsndvmxywai.supabase.co/functions/v1/meta-webhook` |
| `enviar-mensaje` | Envía desde el panel y, cada 10 min, la cola «Por enviar» (si está activado) | — |
| `square-pago` | Crea enlaces de pago de Square (saldo del portal, cobro único y mensualidad de un plan) | — |
| `square-webhook` | Registra en Cobros los pagos con tarjeta de Square | `https://szmkcwtkorsndvmxywai.supabase.co/functions/v1/square-webhook` |

## 1. WhatsApp Business (API oficial de Meta)

1. En [business.facebook.com](https://business.facebook.com) verificar el negocio (Meta Business Manager).
2. En [developers.facebook.com](https://developers.facebook.com) crear una app tipo **Business** y agregar el producto **WhatsApp**.
3. Agregar el número de AVA (deja de funcionar en la app normal de WhatsApp; se puede usar uno nuevo).
4. Crear un **usuario del sistema** con permiso `whatsapp_business_messaging` y generar un token permanente.
5. Crear la plantilla de mensaje **`aviso_ava`** (categoría *Utilidad*, idioma *Español*) con este cuerpo:
   `Hola {{1}}, {{2}}`
   Se usa para avisos a clientes que no han escrito en las últimas 24 horas (regla de Meta).
6. En la app → WhatsApp → Configuración → **Webhook**: URL de `meta-webhook`, token de verificación = el valor de
   `META_VERIFY_TOKEN`, y suscribir el campo **messages**.

Secrets:

| Nombre | Valor |
|---|---|
| `WHATSAPP_TOKEN` | Token permanente del usuario del sistema |
| `WHATSAPP_PHONE_ID` | *Phone number ID* (no el número) |
| `META_APP_SECRET` | App → Configuración → Básica → Clave secreta |
| `META_VERIFY_TOKEN` | Una palabra secreta que tú inventes (la misma que pones en Meta) |
| `WHATSAPP_TEMPLATE` | Opcional, si la plantilla no se llama `aviso_ava` |

## 2. Instagram, Messenger y leads de Meta Ads

1. La página de Facebook y la cuenta de Instagram deben estar conectadas al mismo Business Manager.
2. En la misma app agregar **Messenger** e **Instagram** y suscribir la página a: `messages`, `leadgen`.
   Para Instagram suscribir `messages`.
3. Generar un **token de página** permanente con permisos `pages_messaging`, `instagram_manage_messages`,
   `leads_retrieval`, `pages_manage_metadata`, `pages_show_list`.

| Nombre | Valor |
|---|---|
| `META_PAGE_TOKEN` | Token permanente de la página |

Los leads entran a **Solicitudes → Mensajes de contacto** con la etiqueta «Meta Ads».

## 3. Square (pagos con tarjeta)

1. Entrar a [developer.squareup.com](https://developer.squareup.com) con la cuenta de Square de AVA → **Create an app** («AVA CRM»).
2. En la app → **Credentials** → pestaña **Production** → copiar el **Production Access token**.
3. En la app → **Webhooks → Subscriptions** → **Add subscription** (pestaña Production):
   - URL: la de `square-webhook` (arriba).
   - Eventos: `payment.created`, `payment.updated`, `refund.updated`.
   - Guardar y copiar la **Signature key**.
4. Pegar ambas en el panel → **Ajustes → Claves de integración**.

| Nombre | Valor |
|---|---|
| `SQUARE_ACCESS_TOKEN` | Production access token |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | Signature key del webhook |
| `SQUARE_LOCATION_ID` | Opcional: solo si hay varias sucursales (si no, se usa la primera activa) |

Cómo funciona: el panel o el portal crean un enlace de pago de Square (Checkout API). Cuando el cliente paga,
Square avisa al webhook, que registra el pago en Cobros con su número de recibo y marca el enlace como pagado.
Los pagos cobrados en Square fuera del CRM aparecen en Ajustes → Actividad reciente para registrarlos.
Los mensuales se cobran enviando el enlace del mes desde la ficha del cliente.

## Comprobar

En el panel → **Ajustes → Integraciones** cada una pasa a «Activo» y abajo aparece la actividad reciente
(mensajes recibidos, pagos, errores). En **Mensajes → Automatizaciones** se enciende el envío automático.

## Pendientes (siguiente etapa)

- **Google Calendar** y **QuickBooks**: necesitan iniciar sesión con la cuenta de Ana (OAuth) para autorizar el acceso.
