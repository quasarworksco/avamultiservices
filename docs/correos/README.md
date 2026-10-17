# Correos de AVA (acceso al panel y al portal)

Plantillas con la marca de AVA para reemplazar los correos genéricos de Supabase.

Supabase → proyecto AVA → **Authentication → Emails → Templates**. En cada plantilla pega el asunto y el HTML:

| Plantilla de Supabase | Asunto | Archivo |
|---|---|---|
| Invite user | `{{ if eq .RedirectTo "https://avamultiservices.com/portal/" }}Tu portal de AVA Multiservices está listo{{ else }}Tu acceso al panel de AVA Multiservices{{ end }}` | `invitacion.html` |
| Magic link | `Tu enlace para entrar a AVA Multiservices` | `enlace-magico.html` |
| Reset password | `Cambia tu contraseña de AVA Multiservices` | `restablecer.html` |

La invitación sirve para los dos casos: si va al portal (cliente) o al panel (equipo), cambia el texto sola.

## Remitente propio (recomendado)

Supabase → **Authentication → Emails → SMTP Settings → Enable custom SMTP**, con Google Workspace:

| Campo | Valor |
|---|---|
| Sender email | `anavargas@avamultiservices.com` (o `no-reply@` si se crea) |
| Sender name | `AVA Multiservices` |
| Host | `smtp.gmail.com` |
| Port | `465` |
| Username | el mismo correo |
| Password | una **contraseña de aplicación** de Google (Cuenta de Google → Seguridad → Verificación en 2 pasos → Contraseñas de aplicaciones) |

Sin SMTP propio, Supabase envía desde su dirección genérica, con un límite muy bajo de correos por hora.
