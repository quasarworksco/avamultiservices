// Webhook de Meta para AVA: WhatsApp Business, Messenger, Instagram y formularios de Meta Ads.
// Meta llama a esta URL; se valida la firma con META_APP_SECRET y todo se guarda en el CRM.
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2.49.8';

const GRAPH = 'https://graph.facebook.com/' + (Deno.env.get('META_GRAPH_VERSION') || 'v23.0');
const enc = new TextEncoder();

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

async function firmaValida(cuerpo: string, firma: string | null) {
  const secreto = K.META_APP_SECRET;
  if (!secreto || !firma || !firma.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(cuerpo)));
  const hex = Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('');
  const dada = firma.slice(7);
  if (hex.length !== dada.length) return false;
  let r = 0;
  for (let i = 0; i < hex.length; i++) r |= hex.charCodeAt(i) ^ dada.charCodeAt(i);
  return r === 0;
}

const digitos = (s: string) => (s || '').replace(/\D/g, '');
const ultimos10 = (s: string) => digitos(s).slice(-10);

async function log(db: SupabaseClient, fuente: string, tipo: string, ok: boolean, detalle?: string) {
  await db.from('integraciones_eventos').insert({ fuente, tipo, ok, detalle: detalle ? detalle.slice(0, 1000) : null });
}

async function clientePorTelefono(db: SupabaseClient, tel: string) {
  const d = ultimos10(tel);
  if (d.length < 7) return null;
  const { data } = await db.from('clientes').select('id,nombre,apellidos,telefono').ilike('telefono', '%' + d.slice(-4)).limit(50);
  return (data || []).find((c) => ultimos10(c.telefono || '') === d) || null;
}

function textoDe(m: Record<string, any>): string {
  switch (m.type) {
    case 'text': return m.text?.body || '';
    case 'button': return m.button?.text || '';
    case 'interactive': return m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '[Respuesta]';
    case 'image': return '[Foto]' + (m.image?.caption ? ' ' + m.image.caption : '');
    case 'document': return '[Documento] ' + (m.document?.filename || '');
    case 'audio': return '[Nota de voz]';
    case 'video': return '[Video]';
    case 'location': return '[Ubicación]';
    case 'sticker': return '[Sticker]';
    default: return '[' + (m.type || 'Mensaje') + ']';
  }
}

// ¿Está fuera del horario configurado? (hora de Dallas)
function fueraDeHorario(horario: Record<string, string[]> | undefined) {
  if (!horario || !Object.keys(horario).length) return false;
  const ahora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const dia = String(((ahora.getDay() + 6) % 7) + 1); // 1 = lunes
  const h = horario[dia];
  if (!h) return true;
  const min = ahora.getHours() * 60 + ahora.getMinutes();
  const [a, b] = h.map((x) => { const [hh, mm] = x.split(':').map(Number); return hh * 60 + mm; });
  return min < a || min >= b;
}

async function enviarWhatsApp(to: string, texto: string) {
  const token = K.WHATSAPP_TOKEN, phoneId = K.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) return null;
  const r = await fetch(`${GRAPH}/${phoneId}/messages`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: texto } })
  });
  const j = await r.json().catch(() => ({}));
  return r.ok ? (j.messages?.[0]?.id || '') : null;
}

async function guardarEntrante(db: SupabaseClient, canal: string, contacto: string, nombre: string | null, texto: string, externoId: string, fecha: Date) {
  let clienteId: string | null = null, nombreCliente: string | null = null;
  if (canal === 'whatsapp') {
    const c = await clientePorTelefono(db, contacto);
    if (c) { clienteId = c.id; nombreCliente = [c.nombre, c.apellidos].filter(Boolean).join(' '); }
  }
  // En el panel un número puede estar guardado sin el 1 de EE. UU.; se reutiliza esa conversación.
  const posibles = canal === 'whatsapp' ? [contacto, ultimos10(contacto)] : [contacto];
  const { data: prevs } = await db.from('conversaciones').select('id,contacto,no_leidos,cliente_id,nombre,auto_fuera_at').eq('canal', canal).in('contacto', posibles).limit(1);
  const prev = prevs?.[0];
  const fila = {
    canal, contacto: prev?.contacto || contacto,
    nombre: (prev?.nombre || nombreCliente || nombre || null)?.slice(0, 120) || null,
    cliente_id: prev?.cliente_id || clienteId,
    ultimo_texto: texto.slice(0, 200), ultimo_at: fecha.toISOString(), ultimo_entrante_at: fecha.toISOString(),
    no_leidos: (prev?.no_leidos || 0) + 1, estado: 'abierta'
  };
  const { data: conv, error } = await db.from('conversaciones').upsert(fila, { onConflict: 'canal,contacto' }).select('id,auto_fuera_at').single();
  if (error || !conv) throw new Error('conversación: ' + (error?.message || ''));
  const ins = await db.from('mensajes_chat').insert({ conversacion_id: conv.id, direccion: 'entrante', texto: texto.slice(0, 4000), estado: 'entregado', externo_id: externoId, created_at: fecha.toISOString() });
  if (ins.error && ins.error.code !== '23505') throw new Error('mensaje: ' + ins.error.message);
  return { conv, duplicado: ins.error?.code === '23505' };
}

async function respuestaFueraDeHorario(db: SupabaseClient, conv: { id: string; auto_fuera_at: string | null }, to: string) {
  const { data: aj } = await db.from('ajustes').select('valor').eq('clave', 'whatsapp').maybeSingle();
  const cfg = aj?.valor?.fuera_horario;
  if (!cfg?.activo || !cfg.mensaje || !fueraDeHorario(cfg.horario)) return;
  if (conv.auto_fuera_at && Date.now() - new Date(conv.auto_fuera_at).getTime() < 12 * 3600e3) return; // una vez cada 12 h
  const id = await enviarWhatsApp(to, cfg.mensaje);
  if (id === null) return;
  await db.from('mensajes_chat').insert({ conversacion_id: conv.id, direccion: 'saliente', texto: cfg.mensaje.slice(0, 4000), automatico: true, estado: 'enviado', externo_id: id || null });
  await db.from('conversaciones').update({ auto_fuera_at: new Date().toISOString() }).eq('id', conv.id);
}

async function procesarWhatsApp(db: SupabaseClient, value: Record<string, any>) {
  const nombres: Record<string, string> = {};
  (value.contacts || []).forEach((c: any) => { nombres[c.wa_id] = c.profile?.name; });
  for (const m of value.messages || []) {
    const contacto = digitos(m.from);
    const texto = textoDe(m);
    const r = await guardarEntrante(db, 'whatsapp', contacto, nombres[m.from] || null, texto, m.id, new Date(Number(m.timestamp) * 1000));
    if (!r.duplicado) await respuestaFueraDeHorario(db, r.conv, contacto);
    await log(db, 'whatsapp', 'mensaje', true, contacto.slice(-4));
  }
  for (const s of value.statuses || []) {
    const estado = ({ sent: 'enviado', delivered: 'entregado', read: 'leido', failed: 'error' } as Record<string, string>)[s.status];
    if (estado) await db.from('mensajes_chat').update({ estado }).eq('externo_id', s.id);
    if (s.status === 'failed') await log(db, 'whatsapp', 'fallo', false, JSON.stringify(s.errors || []).slice(0, 500));
  }
}

async function nombrePerfil(id: string) {
  const token = await tokenPagina(GRAPH);
  if (!token) return null;
  const r = await fetch(`${GRAPH}/${id}?fields=name,username&access_token=${encodeURIComponent(token)}`);
  if (!r.ok) return null;
  const j = await r.json();
  return j.name || (j.username ? '@' + j.username : null);
}

async function procesarMensajeria(db: SupabaseClient, canal: 'messenger' | 'instagram', ev: Record<string, any>) {
  const m = ev.message;
  if (!m || m.is_echo) return;
  const contacto = String(ev.sender?.id || '');
  if (!contacto) return;
  const texto = m.text || (m.attachments?.length ? '[' + (m.attachments[0].type === 'image' ? 'Foto' : 'Archivo') + ']' : '[Mensaje]');
  const { data: existe } = await db.from('conversaciones').select('id').eq('canal', canal).eq('contacto', contacto).maybeSingle();
  const nombre = existe ? null : await nombrePerfil(contacto);
  await guardarEntrante(db, canal, contacto, nombre, texto, m.mid, new Date(ev.timestamp || Date.now()));
  await log(db, canal, 'mensaje', true);
}

async function procesarLead(db: SupabaseClient, v: Record<string, any>) {
  const token = await tokenPagina(GRAPH);
  const id = String(v.leadgen_id || '');
  if (!token || !id) { await log(db, 'meta_ads', 'lead', false, 'Falta el token de la página (META_PAGE_ID o META_PAGE_TOKEN)'); return; }
  const r = await fetch(`${GRAPH}/${id}?fields=field_data,ad_name,form_id,created_time&access_token=${encodeURIComponent(token)}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { await log(db, 'meta_ads', 'lead', false, JSON.stringify(j.error || j).slice(0, 500)); return; }
  const campos: Record<string, string> = {};
  (j.field_data || []).forEach((f: any) => { campos[String(f.name).toLowerCase()] = (f.values || []).join(', '); });
  const nombre = campos.full_name || [campos.first_name, campos.last_name].filter(Boolean).join(' ') || 'Lead de Meta Ads';
  const telefono = campos.phone_number || campos.phone || '';
  const extra = Object.entries(campos).filter(([k]) => !['full_name', 'first_name', 'last_name', 'email', 'phone_number', 'phone'].includes(k)).map(([k, val]) => k.replace(/_/g, ' ') + ': ' + val);
  const ins = await db.from('mensajes_web').insert({
    nombre: nombre.slice(0, 120).padEnd(2, '.'), telefono: (telefono || 'Sin teléfono').slice(0, 40), email: campos.email?.slice(0, 200) || null,
    servicio: (campos.servicio || campos.service || '').slice(0, 60) || null, idioma: 'Español',
    mensaje: (['Anuncio: ' + (j.ad_name || '—')].concat(extra)).join('\n').slice(0, 3000),
    origen: 'meta_ads', externo_id: id, estado: 'nuevo'
  });
  if (ins.error && ins.error.code !== '23505') { await log(db, 'meta_ads', 'lead', false, ins.error.message); return; }
  await log(db, 'meta_ads', 'lead', true, nombre.slice(0, 60));
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  await cargarClaves(db);
  // Verificación inicial de Meta
  if (req.method === 'GET') {
    const ok = url.searchParams.get('hub.mode') === 'subscribe' && !!K.META_VERIFY_TOKEN && url.searchParams.get('hub.verify_token') === K.META_VERIFY_TOKEN;
    return ok ? new Response(url.searchParams.get('hub.challenge') || '', { status: 200 }) : new Response('Prohibido', { status: 403 });
  }
  if (req.method !== 'POST') return new Response('Método no permitido', { status: 405 });
  const cuerpo = await req.text();
  if (!(await firmaValida(cuerpo, req.headers.get('X-Hub-Signature-256')))) return new Response('Firma inválida', { status: 401 });

  let p: Record<string, any> = {};
  try { p = JSON.parse(cuerpo); } catch (_) { return new Response('JSON inválido', { status: 400 }); }

  try {
    for (const entry of p.entry || []) {
      if (p.object === 'whatsapp_business_account') {
        for (const ch of entry.changes || []) if (ch.field === 'messages') await procesarWhatsApp(db, ch.value || {});
      } else if (p.object === 'page' || p.object === 'instagram') {
        const canal = p.object === 'instagram' ? 'instagram' : 'messenger';
        for (const ev of entry.messaging || []) await procesarMensajeria(db, canal, ev);
        for (const ch of entry.changes || []) if (ch.field === 'leadgen') await procesarLead(db, ch.value || {});
      }
    }
  } catch (e) {
    await log(db, 'whatsapp', 'error', false, String((e as Error).message || e));
  }
  // Meta reintenta si no recibe 200, así que siempre se confirma.
  return new Response('EVENT_RECEIVED', { status: 200 });
});
