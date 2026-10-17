// Envía mensajes de AVA por WhatsApp Business, Messenger o Instagram.
// - Desde el panel (usuario con permiso «mensajes»): { conversacion_id, texto, adjunto? } o { cola_id }.
//   adjunto = { path, nombre, tipo } de un archivo ya subido al bucket «chat» en la carpeta de la conversación.
// - Desde el cron (cabecera x-cron-secret): envía la cola pendiente si el envío automático está activado.
// - { estado: true }: dice qué integraciones están conectadas (sin mostrar claves).
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2.49.8';

const GRAPH = 'https://graph.facebook.com/' + (Deno.env.get('META_GRAPH_VERSION') || 'v23.0');
const ORIGENES = ['https://avamultiservices.com', 'https://www.avamultiservices.com', 'http://192.0.2.2:8080'];
const VENTANA = 24 * 3600e3;

// Claves de integración: primero los secretos de Supabase, si no las guardadas desde el panel (Vault).
const NOMBRES = ['META_VERIFY_TOKEN', 'META_APP_SECRET', 'WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID', 'META_PAGE_ID', 'META_PAGE_TOKEN', 'WHATSAPP_TEMPLATE', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'];
let K: Record<string, string> = {};
let kHora = 0;
async function cargarClaves(db: any) {
  if (Date.now() - kHora < 60000) return K;
  const { data } = await db.rpc('claves_integracion');
  const v = (data || {}) as Record<string, string>;
  const n: Record<string, string> = {};
  NOMBRES.forEach((x) => { n[x] = Deno.env.get(x) || v[x] || ''; });
  K = n; kHora = Date.now(); pagTok = '';
  return K;
}
// Token de la página: el guardado o, si no, se pide a Meta con el token del usuario del sistema
let pagTok = '';
async function tokenPagina(graph: string) {
  if (K.META_PAGE_TOKEN) return K.META_PAGE_TOKEN;
  if (pagTok) return pagTok;
  if (!K.META_PAGE_ID || !K.WHATSAPP_TOKEN) return '';
  const r = await fetch(`${graph}/${K.META_PAGE_ID}?fields=access_token&access_token=${encodeURIComponent(K.WHATSAPP_TOKEN)}`);
  const j = await r.json().catch(() => ({}));
  pagTok = j.access_token || '';
  return pagTok;
}

function cors(req: Request) {
  const origin = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ORIGENES.includes(origin) ? origin : ORIGENES[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin'
  };
}
const json = (req: Request, status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });
const digitos = (s: string) => (s || '').replace(/\D/g, '');
const telWa = (s: string) => { const d = digitos(s); return d.length === 10 ? '1' + d : d; };

function estado() {
  const e = (k: string) => !!K[k];
  return {
    whatsapp: e('WHATSAPP_TOKEN') && e('WHATSAPP_PHONE_ID'),
    meta: e('META_PAGE_TOKEN') || (e('META_PAGE_ID') && e('WHATSAPP_TOKEN')),
    webhook_meta: e('META_APP_SECRET') && e('META_VERIFY_TOKEN'),
    stripe: e('STRIPE_SECRET_KEY'),
    webhook_stripe: e('STRIPE_WEBHOOK_SECRET'),
    plantilla: K.WHATSAPP_TEMPLATE || 'aviso_ava'
  };
}

type Envio = { ok: boolean; id?: string; error?: string; codigo?: string };

async function graph(path: string, token: string, body: unknown): Promise<Envio> {
  const r = await fetch(`${GRAPH}/${path}`, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: j.error?.message || 'Error de Meta', codigo: String(j.error?.code || r.status) };
  return { ok: true, id: j.messages?.[0]?.id || j.message_id || '' };
}

function waTexto(to: string, texto: string): Promise<Envio> {
  return graph(`${K.WHATSAPP_PHONE_ID}/messages`, K.WHATSAPP_TOKEN, { messaging_product: 'whatsapp', to: telWa(to), type: 'text', text: { body: texto } });
}

// Plantilla aprobada por Meta para escribir fuera de la ventana de 24 h. Cuerpo: «Hola {{1}}, {{2}}».
function waPlantilla(to: string, nombre: string, texto: string): Promise<Envio> {
  const limpio = (s: string) => s.replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim().slice(0, 1000);
  return graph(`${K.WHATSAPP_PHONE_ID}/messages`, K.WHATSAPP_TOKEN, {
    messaging_product: 'whatsapp', to: telWa(to), type: 'template',
    template: { name: K.WHATSAPP_TEMPLATE || 'aviso_ava', language: { code: Deno.env.get('WHATSAPP_TEMPLATE_LANG') || 'es' },
      components: [{ type: 'body', parameters: [{ type: 'text', text: limpio(nombre || 'cliente') }, { type: 'text', text: limpio(texto) }] }] }
  });
}

async function metaTexto(psid: string, texto: string): Promise<Envio> {
  return graph('me/messages', await tokenPagina(GRAPH), { recipient: { id: psid }, messaging_type: 'RESPONSE', message: { text: texto.slice(0, 2000) } });
}

type Adjunto = { path: string; nombre: string; tipo: string };
const esImagen = (t: string) => /^image\/(jpeg|png|gif|webp)$/.test(t);
function tipoMeta(t: string) { return esImagen(t) ? 'image' : /^video\//.test(t) ? 'video' : /^audio\//.test(t) ? 'audio' : 'file'; }

// Meta descarga el archivo desde un enlace temporal firmado (10 min)
async function enviarAdjunto(db: SupabaseClient, c: Record<string, any>, a: Adjunto): Promise<Envio> {
  const f = await db.storage.from('chat').createSignedUrl(a.path, 600);
  if (f.error || !f.data?.signedUrl) return { ok: false, error: 'No se encontró el archivo' };
  const url = f.data.signedUrl;
  if (c.canal === 'whatsapp') {
    const tipo = esImagen(a.tipo) ? 'image' : 'document';
    return graph(`${K.WHATSAPP_PHONE_ID}/messages`, K.WHATSAPP_TOKEN, { messaging_product: 'whatsapp', to: telWa(c.contacto), type: tipo, [tipo]: tipo === 'image' ? { link: url } : { link: url, filename: a.nombre } });
  }
  return graph('me/messages', await tokenPagina(GRAPH), { recipient: { id: c.contacto }, messaging_type: 'RESPONSE', message: { attachment: { type: tipoMeta(a.tipo), payload: { url, is_reusable: false } } } });
}

async function registrar(db: SupabaseClient, convId: string, texto: string, autor: string | null, automatico: boolean, id: string, adjuntos: Adjunto[] = []) {
  await db.from('mensajes_chat').insert({ conversacion_id: convId, direccion: 'saliente', texto: texto.slice(0, 4000), autor, automatico, estado: 'enviado', externo_id: id || null, adjuntos });
  await db.from('conversaciones').update({ ultimo_texto: texto.slice(0, 200), ultimo_at: new Date().toISOString() }).eq('id', convId);
}

async function enviarConversacion(db: SupabaseClient, convId: string, texto: string, autor: string | null, adjunto: Adjunto | null = null): Promise<Envio> {
  const { data: c } = await db.from('conversaciones').select('*').eq('id', convId).maybeSingle();
  if (!c) return { ok: false, error: 'Conversación no encontrada' };
  if (adjunto && !adjunto.path.startsWith(c.id + '/')) return { ok: false, error: 'Archivo no válido' };
  const abierta = c.ultimo_entrante_at && Date.now() - new Date(c.ultimo_entrante_at).getTime() < VENTANA;
  let r: Envio;
  if (c.canal === 'whatsapp') {
    if (!estado().whatsapp) return { ok: false, codigo: 'no_conectado', error: 'WhatsApp no está conectado' };
    if (!abierta) return { ok: false, codigo: 'fuera_ventana', error: 'Pasaron más de 24 h desde su último mensaje' };
    r = texto ? await waTexto(c.contacto, texto) : { ok: true };
  } else if (c.canal === 'messenger' || c.canal === 'instagram') {
    if (!estado().meta) return { ok: false, codigo: 'no_conectado', error: 'Instagram y Messenger no están conectados' };
    if (!abierta) return { ok: false, codigo: 'fuera_ventana', error: 'Pasaron más de 24 h desde su último mensaje' };
    r = texto ? await metaTexto(c.contacto, texto) : { ok: true };
  } else return { ok: false, codigo: 'no_conectado', error: 'Canal sin conexión' };
  if (r.ok && adjunto) {
    if (texto) await registrar(db, c.id, texto, autor, false, r.id || '');
    const ra = await enviarAdjunto(db, c, adjunto);
    if (!ra.ok) return { ok: false, error: 'No se pudo enviar el archivo: ' + (ra.error || ''), codigo: ra.codigo };
    await registrar(db, c.id, esImagen(adjunto.tipo) ? '[Foto]' : '[Archivo] ' + adjunto.nombre, autor, false, ra.id || '', [adjunto]);
    return ra;
  }
  if (r.ok) await registrar(db, c.id, texto, autor, false, r.id || '');
  return r;
}

async function enviarCola(db: SupabaseClient, colaId: string, autor: string | null): Promise<Envio> {
  const { data: m } = await db.from('cola_mensajes').select('*').eq('id', colaId).eq('estado', 'pendiente').maybeSingle();
  if (!m) return { ok: false, error: 'Mensaje no encontrado o ya enviado' };
  if (!estado().whatsapp) return { ok: false, codigo: 'no_conectado', error: 'WhatsApp no está conectado' };
  const tel = digitos(m.telefono || '');
  if (tel.length < 10) {
    await db.from('cola_mensajes').update({ estado: 'error', error: 'Teléfono inválido', intentos: m.intentos + 1 }).eq('id', m.id);
    return { ok: false, error: 'Teléfono inválido' };
  }
  const contacto = tel.length === 10 ? tel : tel.slice(-10);
  const { data: conv } = await db.from('conversaciones').select('id,ultimo_entrante_at').eq('canal', 'whatsapp').in('contacto', [tel, '1' + contacto, contacto]).order('ultimo_at', { ascending: false }).limit(1).maybeSingle();
  const abierta = conv?.ultimo_entrante_at && Date.now() - new Date(conv.ultimo_entrante_at).getTime() < VENTANA;
  const primerNombre = (m.nombre || '').split(' ')[0];
  const r = abierta ? await waTexto(tel, m.texto) : await waPlantilla(tel, primerNombre, m.texto);
  if (!r.ok) {
    const intentos = m.intentos + 1;
    await db.from('cola_mensajes').update({ intentos, error: (r.error || '').slice(0, 300), estado: intentos >= 3 ? 'error' : 'pendiente' }).eq('id', m.id);
    await db.from('integraciones_eventos').insert({ fuente: 'cola', tipo: m.tipo, ok: false, detalle: (r.error || '').slice(0, 500) });
    return r;
  }
  await db.from('cola_mensajes').update({ estado: 'enviado', enviado_at: new Date().toISOString(), error: null }).eq('id', m.id);
  let convId = conv?.id;
  if (!convId) {
    const up = await db.from('conversaciones').upsert({ canal: 'whatsapp', contacto: telWa(tel), nombre: m.nombre, cliente_id: m.cliente_id }, { onConflict: 'canal,contacto' }).select('id').single();
    convId = up.data?.id;
  }
  if (convId) await registrar(db, convId, m.texto, autor, true, r.id || '');
  return r;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'Método no permitido' });
  const url = Deno.env.get('SUPABASE_URL')!;
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  await cargarClaves(db);
  let body: Record<string, any> = {};
  try { body = await req.json(); } catch (_) { /* vacío */ }

  // Cron: envía la cola pendiente
  const dado = req.headers.get('x-cron-secret');
  const cron = dado ? (await db.rpc('cron_secreto')).data : null;
  if (cron && dado === cron) {
    const { data: aj } = await db.from('ajustes').select('valor').eq('clave', 'whatsapp').maybeSingle();
    if (!aj?.valor?.envio_automatico || !estado().whatsapp) return json(req, 200, { enviados: 0, motivo: 'envío automático apagado o WhatsApp sin conectar' });
    const { data: pend } = await db.from('cola_mensajes').select('id').eq('estado', 'pendiente').lte('programado_para', new Date().toISOString()).order('programado_para').limit(40);
    let enviados = 0;
    for (const p of pend || []) if ((await enviarCola(db, p.id, null)).ok) enviados++;
    return json(req, 200, { enviados });
  }

  // Panel: usuario con sesión
  const comoUsuario = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } }, auth: { persistSession: false } });
  const { data: u } = await comoUsuario.auth.getUser();
  if (!u?.user) return json(req, 401, { error: 'Inicia sesión' });
  if (body.estado) return json(req, 200, estado());
  const { data: ok } = await comoUsuario.rpc('puede', { modulo: 'mensajes' });
  if (!ok) return json(req, 403, { error: 'Sin permiso' });

  let r: Envio;
  if (body.cola_id) r = await enviarCola(db, String(body.cola_id), u.user.id);
  else {
    const texto = String(body.texto || '').trim();
    const a = body.adjunto && typeof body.adjunto.path === 'string' ? { path: String(body.adjunto.path).slice(0, 300), nombre: String(body.adjunto.nombre || 'archivo').slice(0, 120), tipo: String(body.adjunto.tipo || 'application/octet-stream').slice(0, 100) } : null;
    if ((!texto && !a) || texto.length > 4000) return json(req, 400, { error: 'Escribe un mensaje' });
    r = await enviarConversacion(db, String(body.conversacion_id || ''), texto, u.user.id, a);
  }
  return json(req, r.ok ? 200 : 400, r);
});
