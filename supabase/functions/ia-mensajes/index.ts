// Asistente con IA (Groq) para la Bandeja: lee la conversación y guarda el servicio que busca,
// qué tan interesado está, sus datos de contacto y una respuesta sugerida. Nunca envía nada solo.
// Antes de analizar, convierte a texto las notas de voz que llegaron (Whisper en Groq).
// - Desde el webhook de Meta (cabecera x-cron-secret) cuando llega un mensaje.
// - Desde el panel (permiso «mensajes»): { conversacion_id } para analizar de nuevo u otra sugerencia.
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2.49.8';

const ORIGENES = ['https://avamultiservices.com', 'https://www.avamultiservices.com', 'http://192.0.2.2:8080'];
// Si Groq retira un modelo se prueba el siguiente
const MODELOS = [Deno.env.get('GROQ_MODEL') || 'llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'llama-3.1-8b-instant'];
const SERVICIOS = ['taxes', 'credito', 'llc', 'inmigracion', 'notaria', 'contabilidad', 'plan_irs', 'franchise_tax', 'otro'];
const TEMPERATURAS = ['caliente', 'tibio', 'frio'];

function cors(req: Request) {
  const origin = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ORIGENES.includes(origin) ? origin : ORIGENES[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin'
  };
}
const json = (req: Request, status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });

const SISTEMA = `Eres el asistente interno de AVA Multiservices, una oficina hispana en Dallas, Texas, que atiende en persona y en línea en todo EE. UU. La dueña es Ana Vargas.
Servicios: documentos migratorios (prepara y revisa formularios de USCIS; no es abogada ni da asesoría legal), taxes (personales, familiares, self-employed y 1099, ITIN, envío electrónico), formación de LLC en Texas (Certificate of Formation, EIN, Operating Agreement), notaría pública (poderes, affidavits, permisos de viaje), reparación de crédito (análisis de reportes, disputas de errores ante los burós, plan de crédito; los resultados varían), contabilidad mensual, planes de pago con el IRS y Franchise Tax de Texas.
Contacto: WhatsApp (786) 816-2430. Citas en línea: avamultiservices.com/citas.

Analiza la conversación y responde SOLO con un objeto JSON con estas claves:
- "servicio": uno de ${JSON.stringify(SERVICIOS)} según lo que busca, o null si no está claro.
- "idioma": "es" o "en", el idioma en que escribe el cliente.
- "temperatura": "caliente" si quiere el servicio pronto (pide precio, cita, requisitos o manda documentos), "tibio" si solo pide información, "frio" si es un saludo sin interés claro, spam o dice que no le interesa.
- "motivo": frase corta (máx. 12 palabras) que explique la temperatura.
- "resumen": 1 o 2 frases con lo que necesita el cliente.
- "nombre": su nombre si lo dijo, o null.
- "telefono": su teléfono si lo escribió, o null.
- "email": su correo si lo escribió, o null.
- "sugerencia": la respuesta que AVA le enviaría ahora mismo.

Reglas para "sugerencia":
- En el idioma del cliente, corta (máximo 4 frases), cálida y profesional, estilo WhatsApp, como mucho 1 emoji.
- Responde a lo último que preguntó el cliente y propone un siguiente paso concreto (agendar cita, enviar documentos o llamar).
- NO inventes precios, plazos ni requisitos. Si pregunta el precio, explica que depende de su caso y ofrece revisarlo o agendar una cita.
- NO des asesoría legal ni garantices resultados.
- No firmes con ningún nombre.`;

// Antes de enviar a la IA se ocultan números sensibles (SSN, ITIN, tarjetas, cuentas)
function ocultar(t: string) {
  return t
    .replace(/\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/g, (m) => (m.replace(/\D/g, '').length === 9 ? '[número oculto]' : m))
    .replace(/\b(?:\d[ -]?){12,19}\b/g, '[número oculto]');
}

// Notas de voz → texto. Se guarda en el adjunto (transcripcion) para mostrarla en el chat.
const WHISPER = ['whisper-large-v3-turbo', 'whisper-large-v3'];
async function transcribir(db: SupabaseClient, convId: string, clave: string) {
  const { data: ms } = await db.from('mensajes_chat').select('id,adjuntos').eq('conversacion_id', convId).eq('direccion', 'entrante')
    .order('created_at', { ascending: false }).limit(20);
  for (const m of ms || []) {
    const adj = (m.adjuntos || []) as Record<string, any>[];
    let cambio = false;
    for (const a of adj) {
      if (!/^audio\//.test(a.tipo || '') || typeof a.transcripcion === 'string' || a.transcripcion_error) continue;
      if ((a.tam || 0) > 24 * 1024 * 1024) { a.transcripcion_error = 'El audio es muy largo para transcribirlo.'; cambio = true; continue; }
      const { data: blob, error } = await db.storage.from('chat').download(a.path);
      if (error || !blob) { a.transcripcion_error = 'No se encontró el audio.'; cambio = true; continue; }
      let hecho = false;
      for (const modelo of WHISPER) {
        const fd = new FormData();
        fd.append('file', new File([blob], a.nombre || 'nota-de-voz.ogg', { type: a.tipo }));
        fd.append('model', modelo); fd.append('response_format', 'json'); fd.append('temperature', '0');
        const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + clave }, body: fd });
        if (r.status === 429) { if (cambio) await db.from('mensajes_chat').update({ adjuntos: adj }).eq('id', m.id); return; } // límite gratuito: se reintenta en el próximo mensaje
        if (r.ok) { const j = await r.json().catch(() => ({})); a.transcripcion = String(j.text || '').trim(); hecho = true; break; }
        if (r.status !== 400 && r.status !== 404) break;
      }
      if (!hecho) a.transcripcion_error = 'No se pudo transcribir.';
      cambio = true;
    }
    if (cambio) await db.from('mensajes_chat').update({ adjuntos: adj }).eq('id', m.id);
  }
}

function texto(v: unknown, max: number) {
  return typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'null' ? v.trim().slice(0, max) : null;
}

async function analizar(db: SupabaseClient, convId: string, clave: string) {
  const { data: c } = await db.from('conversaciones').select('id,canal,nombre,etapa,servicio,cliente_id').eq('id', convId).maybeSingle();
  if (!c) throw new Error('Conversación no encontrada');
  const { data: ms } = await db.from('mensajes_chat').select('direccion,texto,created_at,adjuntos').eq('conversacion_id', convId).order('created_at', { ascending: false }).limit(20);
  const lista = (ms || []).reverse();
  if (!lista.some((m) => m.direccion === 'entrante')) return null;
  const canal = ({ whatsapp: 'WhatsApp', messenger: 'Facebook Messenger', instagram: 'Instagram' } as Record<string, string>)[c.canal] || c.canal;
  const voz = (m: Record<string, any>) => ((m.adjuntos || []) as Record<string, any>[]).filter((a) => a.transcripcion).map((a) => ' (nota de voz: «' + a.transcripcion + '»)').join('');
  const charla = lista.map((m) => (m.direccion === 'entrante' ? 'Cliente: ' : 'AVA: ') + ocultar(String(m.texto || '') + voz(m)).slice(0, 2400)).join('\n');
  const contexto = `Canal: ${canal}. Nombre en el chat: ${c.nombre || 'desconocido'}. ${c.cliente_id ? 'Ya es cliente de AVA.' : 'Todavía no es cliente.'}\n\nConversación (la más reciente al final):\n${charla}`;

  let j: Record<string, any> | null = null;
  let ultimoError = '';
  for (const modelo of MODELOS) {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { Authorization: 'Bearer ' + clave, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelo, temperature: 0.3, max_tokens: 700, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: SISTEMA }, { role: 'user', content: contexto }] })
    });
    const res = await r.json().catch(() => ({}));
    if (r.status === 429) throw new Error('La IA gratuita llegó a su límite por ahora. Intenta de nuevo en unos minutos.');
    if (r.status === 401) throw new Error('La clave de Groq no es válida.');
    if (!r.ok) { ultimoError = res.error?.message || 'Error de la IA'; if (r.status === 400 || r.status === 404) continue; throw new Error(ultimoError); }
    try { j = JSON.parse(res.choices?.[0]?.message?.content || '{}'); break; } catch (_) { ultimoError = 'Respuesta no válida de la IA'; }
  }
  if (!j) throw new Error(ultimoError || 'La IA no respondió');

  const ia = {
    servicio: SERVICIOS.includes(j.servicio) ? j.servicio : null,
    idioma: j.idioma === 'en' ? 'en' : 'es',
    temperatura: TEMPERATURAS.includes(j.temperatura) ? j.temperatura : 'tibio',
    motivo: texto(j.motivo, 140),
    resumen: texto(j.resumen, 400),
    nombre: texto(j.nombre, 120),
    telefono: texto(j.telefono, 40),
    email: texto(j.email, 200) && /@/.test(j.email) ? texto(j.email, 200) : null,
    sugerencia: texto(j.sugerencia, 1200),
    at: new Date().toISOString()
  };
  const cambios: Record<string, unknown> = { ia, temperatura: ia.temperatura, ia_at: ia.at };
  if (!c.servicio && ia.servicio && ia.servicio !== 'otro') cambios.servicio = ia.servicio;
  await db.from('conversaciones').update(cambios).eq('id', convId);
  return ia;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'Método no permitido' });
  const url = Deno.env.get('SUPABASE_URL')!;
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  let b: Record<string, any> = {};
  try { b = await req.json(); } catch (_) { /* */ }

  // Quién llama: el webhook (secreto del cron) o alguien del equipo con permiso «mensajes»
  const dado = req.headers.get('x-cron-secret');
  const interno = !!dado && dado === (await db.rpc('cron_secreto')).data;
  if (!interno) {
    const comoUsuario = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } }, auth: { persistSession: false } });
    const { data: u } = await comoUsuario.auth.getUser();
    if (!u?.user) return json(req, 401, { error: 'Inicia sesión' });
    const { data: ok } = await comoUsuario.rpc('puede', { modulo: 'mensajes' });
    if (!ok) return json(req, 403, { error: 'Sin permiso' });
  }

  const { data: k } = await db.rpc('claves_integracion');
  const clave = Deno.env.get('GROQ_API_KEY') || (k || {}).GROQ_API_KEY || '';
  if (!clave) return json(req, 400, { error: 'El asistente con IA todavía no está conectado.', codigo: 'no_conectado' });
  try {
    await transcribir(db, String(b.conversacion_id || ''), clave).catch(() => null);
    const ia = await analizar(db, String(b.conversacion_id || ''), clave);
    return json(req, 200, { ia });
  } catch (e) {
    return json(req, 400, { error: (e as Error).message });
  }
});
