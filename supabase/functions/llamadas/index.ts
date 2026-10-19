// Llamadas del CRM con Twilio + IA.
// Panel (sesión con permiso «llamadas»), JSON:
//   { accion: 'token' }            → token para llamar desde el navegador (configura la línea la primera vez)
//   { accion: 'procesar', llamada_id } → transcribe la grabación y extrae la información con la IA
// Twilio (firma X-Twilio-Signature), ?evento=:
//   saliente  → TwiML de una llamada que sale del CRM      entrante → llamada que entra al número de AVA
//   aviso     → aviso de grabación que oye el cliente      fin      → cómo terminó (y buzón si nadie contestó)
//   estado    → contestó / terminó                         grabacion → la grabación está lista
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2.49.8';

const ORIGENES = ['https://avamultiservices.com', 'https://www.avamultiservices.com', 'http://192.0.2.2:8080'];
const BASE = 'https://szmkcwtkorsndvmxywai.supabase.co/functions/v1/llamadas';
const AVISO = 'Esta llamada puede ser grabada para darte un mejor servicio.';
const NOMBRES = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_API_KEY_SID', 'TWILIO_API_KEY_SECRET', 'TWILIO_TWIML_APP_SID', 'TWILIO_NUMERO', 'GROQ_API_KEY'];
const MODELOS = ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'llama-3.1-8b-instant'];

function cors(req: Request) {
  const origin = req.headers.get('Origin') || '';
  return { 'Access-Control-Allow-Origin': ORIGENES.includes(origin) ? origin : ORIGENES[0], 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
}
const json = (req: Request, status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });
const xml = (cuerpo: string) => new Response('<?xml version="1.0" encoding="UTF-8"?><Response>' + cuerpo + '</Response>', { headers: { 'Content-Type': 'text/xml' } });
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const decir = (t: string) => `<Say language="es-MX" voice="Polly.Mia">${esc(t)}</Say>`;

let K: Record<string, string> = {}, kHora = 0;
async function claves(db: SupabaseClient) {
  if (Date.now() - kHora < 60000) return K;
  const { data } = await db.rpc('claves_integracion');
  const v = (data || {}) as Record<string, string>;
  const n: Record<string, string> = {};
  NOMBRES.forEach((x) => { n[x] = Deno.env.get(x) || v[x] || ''; });
  K = n; kHora = Date.now();
  return K;
}
const listo = () => !!(K.TWILIO_ACCOUNT_SID && K.TWILIO_AUTH_TOKEN && K.TWILIO_API_KEY_SID && K.TWILIO_API_KEY_SECRET && K.TWILIO_NUMERO);
function e164(t: string | null | undefined) {
  const d = String(t || '').replace(/\D/g, '');
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  return null;
}

/* ---------- Twilio: API, firma y token ---------- */
async function twilio(path: string, metodo = 'GET', datos?: Record<string, string>) {
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${K.TWILIO_ACCOUNT_SID}/${path}`, {
    method: metodo, headers: { Authorization: 'Basic ' + btoa(K.TWILIO_ACCOUNT_SID + ':' + K.TWILIO_AUTH_TOKEN), ...(datos ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: datos ? new URLSearchParams(datos) : undefined
  });
  const j = r.status === 204 ? {} : await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as Record<string, string>).message || 'Error de Twilio');
  return j as Record<string, any>;
}
async function hmac(alg: string, clave: string, texto: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), { name: 'HMAC', hash: alg }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(texto)));
}
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const b64url = (u: Uint8Array | string) => (typeof u === 'string' ? btoa(unescape(encodeURIComponent(u))) : b64(u)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
async function firmaValida(req: Request, params: URLSearchParams) {
  const dada = req.headers.get('X-Twilio-Signature') || '';
  const url = BASE + new URL(req.url).search;
  const datos = [...params.keys()].sort().map((k) => k + params.get(k)).join('');
  const calc = b64(await hmac('SHA-1', K.TWILIO_AUTH_TOKEN, url + datos));
  return dada.length === calc.length && dada === calc;
}
const identidad = (uid: string) => 'ava_' + uid.replace(/-/g, '').slice(0, 20);
async function tokenVoz(uid: string, appSid: string) {
  const ahora = Math.floor(Date.now() / 1000);
  const cab = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT', cty: 'twilio-fpa;v=1' }));
  const cuerpo = b64url(JSON.stringify({ jti: K.TWILIO_API_KEY_SID + '-' + ahora, iss: K.TWILIO_API_KEY_SID, sub: K.TWILIO_ACCOUNT_SID, iat: ahora, exp: ahora + 3600,
    grants: { identity: identidad(uid), voice: { incoming: { allow: true }, outgoing: { application_sid: appSid } } } }));
  return cab + '.' + cuerpo + '.' + b64url(await hmac('SHA-256', K.TWILIO_API_KEY_SECRET, cab + '.' + cuerpo));
}
// La primera vez crea la «TwiML App» del CRM y apunta el número de AVA a esta función
let appSid = '';
async function configurarLinea() {
  if (K.TWILIO_TWIML_APP_SID) return K.TWILIO_TWIML_APP_SID;
  if (appSid) return appSid;
  const apps = await twilio('Applications.json?FriendlyName=' + encodeURIComponent('AVA CRM'));
  const ex = (apps.applications || [])[0];
  appSid = ex ? ex.sid : (await twilio('Applications.json', 'POST', { FriendlyName: 'AVA CRM', VoiceUrl: BASE + '?evento=saliente', VoiceMethod: 'POST' })).sid;
  if (ex && ex.voice_url !== BASE + '?evento=saliente') await twilio(`Applications/${appSid}.json`, 'POST', { VoiceUrl: BASE + '?evento=saliente', VoiceMethod: 'POST' });
  const num = await twilio('IncomingPhoneNumbers.json?PhoneNumber=' + encodeURIComponent(e164(K.TWILIO_NUMERO) || K.TWILIO_NUMERO));
  const n = (num.incoming_phone_numbers || [])[0];
  if (n && n.voice_url !== BASE + '?evento=entrante') await twilio(`IncomingPhoneNumbers/${n.sid}.json`, 'POST', { VoiceUrl: BASE + '?evento=entrante', VoiceMethod: 'POST' });
  return appSid;
}

/* ---------- Clientes de Texas: se graba sin aviso ---------- */
async function clientePorNumero(db: SupabaseClient, numero: string) {
  const d = numero.replace(/\D/g, '').slice(-10);
  if (d.length < 10) return null;
  const { data } = await db.from('clientes').select('id,region').like('tel_digitos', '%' + d).limit(1);
  return (data || [])[0] || null;
}
const deTexas = (region: string | null | undefined) => /^(tx|texas)$/i.test(String(region || '').trim());

/* ---------- IA: transcribir y extraer ---------- */
const SISTEMA = `Eres el asistente interno de AVA Multiservices (Dallas, Texas): taxes, reparación de crédito, LLC, inmigración (formularios de USCIS, sin asesoría legal), notaría, contabilidad, planes de pago con el IRS y Franchise Tax.
Te paso la transcripción de una llamada entre AVA y un cliente o prospecto. Responde SOLO con un objeto JSON con estas claves:
- "resumen": 2 a 4 frases con lo que se habló.
- "necesita": qué necesita el cliente, en una frase.
- "servicio": uno de ["taxes","credito","llc","inmigracion","notaria","contabilidad","plan_irs","franchise_tax","otro"] o null.
- "temperatura": "caliente" si quiere avanzar pronto, "tibio" si solo pidió información, "frio" si no le interesa.
- "datos": lista de objetos {"campo","valor"} con TODOS los datos que dio el cliente tal como los dijo (nombre, teléfono, correo, dirección, fecha de nacimiento, Seguro Social o ITIN, empleador, ingresos, dependientes, cuentas, fechas, montos, números de caso…). No ocultes nada.
- "documentos_pendientes": lista de documentos que el cliente debe enviar o que se le pidieron.
- "proximos_pasos": lista de lo que se acordó hacer y quién.
- "tareas": lista de objetos {"titulo","en_dias"} con tareas concretas para AVA (en_dias: 0 hoy, 1 mañana…).
- "nombre_cliente": el nombre del cliente si se dijo, o null.
Si la llamada no tiene contenido útil (buzón vacío, número equivocado), dilo en "resumen" y deja las listas vacías.`;

async function procesar(db: SupabaseClient, id: string) {
  const { data: l } = await db.from('llamadas').select('id,grabacion_path,cliente_id,numero,direccion').eq('id', id).maybeSingle();
  if (!l || !l.grabacion_path) throw new Error('La llamada no tiene grabación.');
  if (!K.GROQ_API_KEY) { await db.from('llamadas').update({ ia_estado: 'error', ia_error: 'El asistente con IA no está conectado.' }).eq('id', id); throw new Error('El asistente con IA no está conectado.'); }
  await db.from('llamadas').update({ ia_estado: 'procesando', ia_error: null }).eq('id', id);
  try {
    const { data: blob, error } = await db.storage.from('llamadas').download(l.grabacion_path);
    if (error || !blob) throw new Error('No se encontró la grabación.');
    if (blob.size > 25 * 1024 * 1024) throw new Error('La grabación pesa más de 25 MB.');
    let texto = '';
    for (const modelo of ['whisper-large-v3', 'whisper-large-v3-turbo']) {
      const fd = new FormData();
      fd.append('file', new File([blob], l.grabacion_path.split('/').pop() || 'llamada.mp3', { type: blob.type || 'audio/mpeg' }));
      fd.append('model', modelo); fd.append('response_format', 'json'); fd.append('temperature', '0');
      const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + K.GROQ_API_KEY }, body: fd });
      if (r.status === 429) throw new Error('La IA gratuita llegó a su límite. Toca «Procesar de nuevo» en unos minutos.');
      if (r.ok) { texto = String((await r.json()).text || '').trim(); break; }
      if (r.status !== 400 && r.status !== 404) throw new Error('No se pudo transcribir la grabación.');
    }
    await db.from('llamadas').update({ transcripcion: texto }).eq('id', id);
    let ia: Record<string, any> = { resumen: 'La grabación no tiene palabras.', datos: [], documentos_pendientes: [], proximos_pasos: [], tareas: [] };
    if (texto.length > 8) {
      let ok = false, ultimo = '';
      for (const modelo of MODELOS) {
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + K.GROQ_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: modelo, temperature: 0.2, max_tokens: 1800, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: SISTEMA }, { role: 'user', content: 'Llamada ' + (l.direccion === 'entrante' ? 'entrante' : 'saliente') + '. Transcripción:\n' + texto.slice(0, 60000) }] }) });
        const j = await r.json().catch(() => ({}));
        if (r.status === 429) throw new Error('La IA gratuita llegó a su límite. Toca «Procesar de nuevo» en unos minutos.');
        if (!r.ok) { ultimo = j.error?.message || 'Error de la IA'; if (r.status === 400 || r.status === 404) continue; throw new Error(ultimo); }
        try { ia = JSON.parse(j.choices?.[0]?.message?.content || '{}'); ok = true; break; } catch (_) { ultimo = 'Respuesta no válida de la IA'; }
      }
      if (!ok) throw new Error(ultimo || 'La IA no respondió.');
    }
    const lista = (v: unknown) => (Array.isArray(v) ? v : []).slice(0, 40);
    const limpio = {
      resumen: String(ia.resumen || '').slice(0, 1500), necesita: ia.necesita ? String(ia.necesita).slice(0, 400) : null,
      servicio: ia.servicio || null, temperatura: ['caliente', 'tibio', 'frio'].includes(ia.temperatura) ? ia.temperatura : null,
      nombre_cliente: ia.nombre_cliente ? String(ia.nombre_cliente).slice(0, 120) : null,
      datos: lista(ia.datos).filter((d: any) => d && d.campo).map((d: any) => ({ campo: String(d.campo).slice(0, 80), valor: String(d.valor ?? '').slice(0, 500) })),
      documentos_pendientes: lista(ia.documentos_pendientes).map((x: any) => String(x).slice(0, 200)),
      proximos_pasos: lista(ia.proximos_pasos).map((x: any) => String(x).slice(0, 300)),
      tareas: lista(ia.tareas).filter((t: any) => t && t.titulo).map((t: any) => ({ titulo: String(t.titulo).slice(0, 180), en_dias: Math.max(0, Math.min(60, parseInt(t.en_dias, 10) || 0)) })),
      at: new Date().toISOString()
    };
    await db.from('llamadas').update({ ia: limpio, ia_estado: 'listo', ia_error: null }).eq('id', id);
    return limpio;
  } catch (e) {
    await db.from('llamadas').update({ ia_estado: 'error', ia_error: (e as Error).message.slice(0, 300) }).eq('id', id);
    throw e;
  }
}

/* ---------- Webhooks de Twilio ---------- */
const MIN_SEG = 5; // por debajo de esto la llamada se considera cortada
async function twilioEvento(req: Request, db: SupabaseClient, evento: string) {
  const p = new URLSearchParams(await req.text());
  if (!listo() || !(await firmaValida(req, p))) return new Response('Firma no válida', { status: 403 });
  const q = new URL(req.url).searchParams;
  const id = q.get('id') || '';
  const url = (ev: string, extra = '') => esc(BASE + '?evento=' + ev + (id ? '&id=' + id : '') + extra);

  if (evento === 'aviso') return xml(decir(AVISO));

  if (evento === 'saliente') {
    const llamadaId = p.get('llamada') || '';
    const to = e164(p.get('To'));
    const { data: l } = await db.from('llamadas').select('id,con_aviso,estado').eq('id', llamadaId).maybeSingle();
    if (!l || !to || l.estado !== 'iniciando') return xml(decir('No se pudo hacer la llamada.'));
    await db.from('llamadas').update({ estado: 'sonando', proveedor_id: p.get('CallSid'), numero: to }).eq('id', l.id);
    const u = (ev: string) => esc(BASE + '?evento=' + ev + '&id=' + l.id);
    const grabar = l.con_aviso !== null; // null = no grabar
    return xml(`<Dial callerId="${esc(e164(K.TWILIO_NUMERO) || K.TWILIO_NUMERO)}" answerOnBridge="true" timeout="30" action="${u('fin')}"` +
      (grabar ? ` record="record-from-answer-dual" recordingStatusCallback="${u('grabacion')}" recordingStatusCallbackEvent="completed"` : '') + '>' +
      `<Number statusCallbackEvent="answered" statusCallback="${u('estado')}"` + (l.con_aviso ? ` url="${u('aviso')}"` : '') + `>${esc(to)}</Number></Dial>`);
  }

  if (evento === 'entrante') {
    const desde = e164(p.get('From')) || p.get('From') || '';
    const c = await clientePorNumero(db, desde);
    const conAviso = !(c && deTexas(c.region));
    const { data: l } = await db.from('llamadas').insert({ direccion: 'entrante', canal: 'telefono', numero: desde, cliente_id: c?.id || null, usuario: null, estado: 'sonando', proveedor_id: p.get('CallSid'), con_aviso: conAviso }).select('id').single();
    const { data: eq } = await db.from('admins').select('user_id,rol,permisos').eq('activo', true);
    const quienes = (eq || []).filter((a) => a.rol === 'admin' || (a.permisos || []).includes('llamadas')).slice(0, 10);
    const u = (ev: string) => esc(BASE + '?evento=' + ev + '&id=' + (l?.id || ''));
    return xml((conAviso ? decir(AVISO) : '') +
      `<Dial timeout="25" answerOnBridge="true" action="${u('fin')}" record="record-from-answer-dual" recordingStatusCallback="${u('grabacion')}" recordingStatusCallbackEvent="completed">` +
      quienes.map((a) => `<Client>${identidad(a.user_id)}</Client>`).join('') + '</Dial>');
  }

  if (evento === 'estado') {
    if (id && p.get('CallStatus') === 'in-progress') await db.from('llamadas').update({ estado: 'en_curso', inicio: new Date().toISOString() }).eq('id', id);
    return xml('');
  }

  if (evento === 'fin') {
    const st = p.get('DialCallStatus') || '';
    const estado = ({ completed: 'completada', answered: 'completada', 'no-answer': 'sin_respuesta', busy: 'ocupado', failed: 'fallida', canceled: 'cancelada' } as Record<string, string>)[st] || 'completada';
    const dur = parseInt(p.get('DialCallDuration') || '0', 10) || null;
    const cambios: Record<string, unknown> = { estado, duracion_seg: dur };
    if (estado !== 'completada' || (dur || 0) < MIN_SEG) cambios.ia_estado = 'sin_grabacion';
    const { data: l } = id ? await db.from('llamadas').update(cambios).eq('id', id).select('direccion').maybeSingle() : { data: null };
    // Nadie contestó una llamada entrante: buzón de voz (también se transcribe)
    if (l?.direccion === 'entrante' && estado !== 'completada') {
      return xml(decir('Gracias por llamar a AVA Multiservices. En este momento no podemos atenderte. Deja tu nombre, tu número y tu mensaje después del tono, y te llamamos pronto.') +
        `<Record maxLength="180" playBeep="true" timeout="6" recordingStatusCallback="${url('grabacion', '&buzon=1')}" recordingStatusCallbackEvent="completed" action="${url('colgar')}"/>`);
    }
    return xml('');
  }
  if (evento === 'colgar') return xml('<Hangup/>');

  if (evento === 'grabacion') {
    const rsid = p.get('RecordingSid') || '';
    const rurl = p.get('RecordingUrl') || '';
    if (!id || !rsid || !/^https:\/\/api\.twilio\.com\//.test(rurl)) return xml('');
    // Llamadas que se cortaron (menos de 5 s) o buzón vacío: no se guarda la grabación ni la procesa la IA
    const segs = parseInt(p.get('RecordingDuration') || '0', 10) || 0;
    if (segs < MIN_SEG) {
      await db.from('llamadas').update(q.get('buzon') ? { ia_estado: 'sin_grabacion', notas: 'Colgó sin dejar mensaje' } : { ia_estado: 'sin_grabacion' }).eq('id', id);
      twilio(`Recordings/${rsid}.json`, 'DELETE').catch(() => null);
      return xml('');
    }
    const r = await fetch(rurl + '.mp3', { headers: { Authorization: 'Basic ' + btoa(K.TWILIO_ACCOUNT_SID + ':' + K.TWILIO_AUTH_TOKEN) } });
    if (!r.ok) return xml('');
    const path = id + '/' + rsid + '.mp3';
    const up = await db.storage.from('llamadas').upload(path, new Uint8Array(await r.arrayBuffer()), { contentType: 'audio/mpeg', upsert: true });
    if (up.error) return xml('');
    const cambios: Record<string, unknown> = { grabacion_path: path, ia_estado: 'pendiente' };
    if (q.get('buzon')) { cambios.notas = 'Mensaje de buzón de voz'; cambios.duracion_seg = parseInt(p.get('RecordingDuration') || '0', 10) || null; }
    await db.from('llamadas').update(cambios).eq('id', id);
    // La grabación ya está guardada en el CRM: se borra de Twilio
    twilio(`Recordings/${rsid}.json`, 'DELETE').catch(() => null);
    const tarea = procesar(db, id).catch(() => null);
    // @ts-ignore EdgeRuntime existe en Supabase
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(tarea); else await tarea;
    return xml('');
  }
  return xml('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'Método no permitido' });
  const url = Deno.env.get('SUPABASE_URL')!;
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  await claves(db);
  const evento = new URL(req.url).searchParams.get('evento');
  if (evento) return twilioEvento(req, db, evento);

  const comoUsuario = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } }, auth: { persistSession: false } });
  const { data: u } = await comoUsuario.auth.getUser();
  if (!u?.user) return json(req, 401, { error: 'Inicia sesión' });
  const { data: ok } = await comoUsuario.rpc('puede', { modulo: 'llamadas' });
  if (!ok) return json(req, 403, { error: 'Sin permiso' });
  let b: Record<string, any> = {};
  try { b = await req.json(); } catch (_) { /* */ }
  try {
    if (b.accion === 'token') {
      if (!listo()) return json(req, 400, { error: 'La línea de llamadas todavía no está conectada.', codigo: 'no_conectado' });
      const app = await configurarLinea();
      return json(req, 200, { token: await tokenVoz(u.user.id, app), identidad: identidad(u.user.id), numero: e164(K.TWILIO_NUMERO) || K.TWILIO_NUMERO });
    }
    if (b.accion === 'procesar') return json(req, 200, { ia: await procesar(db, String(b.llamada_id || '')) });
    return json(req, 400, { error: 'Solicitud inválida' });
  } catch (e) {
    return json(req, 400, { error: (e as Error).message });
  }
});
