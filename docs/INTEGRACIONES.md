# Integraciones del CRM de AVA

El código ya está publicado en Supabase. Cada integración se activa sola en cuanto se guardan sus claves en
**Supabase → Edge Functions → Secrets**. Las claves nunca van en el código ni en el sitio.

| Función | Para qué | URL |
|---|---|---|
| `meta-webhook` | Recibe WhatsApp, Instagram, Messenger y leads de Meta Ads | `https://szmkcwtkorsndvmxywai.supabase.co/functions/v1/meta-webhook` |
| `enviar-mensaje` | Envía desde el panel y, cada 10 min, la cola «Por enviar» (si está activado) | — |
| `stripe-pago` | Crea enlaces de pago de Stripe (saldo del portal, cobro único, factura y mensualidad de un plan) | — |
| `stripe-webhook` | Registra en Cobros los pagos con tarjeta de Stripe | `https://szmkcwtkorsndvmxywai.supabase.co/functions/v1/stripe-webhook` |

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

## 3. Stripe (pagos con tarjeta)

1. Entrar a [dashboard.stripe.com](https://dashboard.stripe.com) con la cuenta de Stripe de AVA (modo **Live**, no *Test*).
2. **Developers → API keys** → copiar la **Secret key** (`sk_live_…`). También sirve una *Restricted key* (`rk_live_…`)
   con permiso de escritura en *Prices*, *Products*, *Payment Links* y de lectura en *Checkout Sessions*.
3. **Developers → Webhooks → Add endpoint**:
   - URL: la de `stripe-webhook` (arriba).
   - Eventos: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
     `checkout.session.async_payment_failed`, `charge.refunded`.
   - Guardar y copiar el **Signing secret** (`whsec_…`).
4. Pegar ambas en el panel → **Ajustes → Claves de integración**.

| Nombre | Valor |
|---|---|
| `STRIPE_SECRET_KEY` | Secret key (o restricted key) de modo Live |
| `STRIPE_WEBHOOK_SECRET` | Signing secret del webhook |

Cómo funciona: el panel o el portal crean un **Payment Link** de Stripe de un solo uso. Cuando el cliente paga,
Stripe avisa al webhook, que registra el pago en Cobros con su número de recibo y marca el enlace (y su factura) como pagados.
Si el aviso no llega, el cron `ava-verificar-pagos` pregunta a Stripe cada 10 minutos por los enlaces pendientes.
Cancelar un enlace en el CRM lo desactiva también en Stripe. Los pagos cobrados en Stripe fuera del CRM y los
reembolsos aparecen en Ajustes → Actividad reciente para registrarlos.
Stripe no permite cobrar reparación de crédito: el CRM no deja crear enlaces de tarjeta para esos casos.

## Comprobar

En el panel → **Ajustes → Integraciones** cada una pasa a «Activo» y abajo aparece la actividad reciente
(mensajes recibidos, pagos, errores). En **Mensajes → Automatizaciones** se enciende el envío automático.

## Pendientes (siguiente etapa)

- **Google Calendar** y **QuickBooks**: necesitan iniciar sesión con la cuenta de Ana (OAuth) para autorizar el acceso.
