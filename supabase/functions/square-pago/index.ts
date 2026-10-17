// Crea enlaces de pago con tarjeta de Square para AVA.
// - Portal del cliente: { tipo: 'saldo' } paga su saldo pendiente.
// - Panel (permiso «cobros»): { tipo: 'monto', cliente_id, monto, descripcion, caso_id?, plan_id? }.
// Cuando el cliente paga, square-webhook registra el pago en Cobros.
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2.49.8';

const ORIGENES = ['https://avamultiservices.com', 'https://www.avamultiservices.com', 'http://192.0.2.2:8080'];
const SITIO = 'https://avamultiservices.com';

// Claves de integración: primero los secretos de Supabase, si no las guardadas desde el panel (Vault).
const NOMBRES = ['SQUARE_ACCESS_TOKEN', 'SQUARE_LOCATION_ID'];
let K: Record<string, string> = {};
let kHora = 0;
async function cargarClaves(db: SupabaseClient) {
  if (Date.now() - kHora < 60000) return K;
  const { data } = await db.rpc('claves_integracion');
  const v = (data || {}) as Record<string, string>;
  const n: Record<string, string> = {};
  NOMBRES.forEach((x) => { n[x] = Deno.env.get(x) || v[x] || ''; });
  if (n.SQUARE_ACCESS_TOKEN !== K.SQUARE_ACCESS_TOKEN) { base = ''; ubic = ''; }
  K = n; kHora = Date.now();
  return K;
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

// La misma clave sirve para producción o para pruebas (sandbox): se detecta sola la primera vez
let base = '';
async function square(path: string, method = 'GET', body?: unknown) {
  const bases = base ? [base] : ['https://connect.squareup.com', 'https://connect.squareupsandbox.com'];
  for (const b of bases) {
    const r = await fetch(`${b}/v2/${path}`, { method, headers: { Authorization: 'Bearer ' + K.SQUARE_ACCESS_TOKEN, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && !base) continue;
    if (!r.ok) throw new Error(j.errors?.[0]?.detail || 'Error de Square');
    base = b;
    return j;
  }
  throw new Error('La clave de Square no es válida.');
}

// Sucursal de Square donde entra el dinero: la guardada o la primera activa de la cuenta
let ubic = '';
async function ubicacion() {
  if (K.SQUARE_LOCATION_ID) return K.SQUARE_LOCATION_ID;
  if (ubic) return ubic;
  const j = await square('locations');
  const l = (j.locations || []).find((x: Record<string, string>) => x.status === 'ACTIVE') || (j.locations || [])[0];
  if (!l) throw new Error('Tu cuenta de Square no tiene una sucursal activa.');
  ubic = l.id;
  return ubic;
}

function e164(tel: string | null) {
  const d = (tel || '').replace(/\D/g, '');
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  return null;
}

async function saldo(db: SupabaseClient, clienteId: string) {
  const [casos, pagos] = await Promise.all([
    db.from('casos').select('precio').eq('cliente_id', clienteId).neq('estado', 'cancelado'),
    db.from('pagos').select('monto').eq('cliente_id', clienteId)
  ]);
  const total = (casos.data || []).reduce((a, k) => a + Number(k.precio || 0), 0);
  const pagado = (pagos.data || []).reduce((a, p) => a + Number(p.monto), 0);
  return Math.round(Math.max(0, total - pagado) * 100) / 100;
}

type Cobro = { cliente_id: string; caso_id?: string | null; plan_id?: string | null; monto: number; concepto: string; origen: 'panel' | 'portal'; autor: string };
async function crearEnlace(db: SupabaseClient, p: Cobro) {
  const { data: c } = await db.from('clientes').select('id,nombre,apellidos,email,telefono').eq('id', p.cliente_id).maybeSingle();
  if (!c) throw new Error('Cliente no encontrado');
  const meta: Record<string, string> = { cliente_id: c.id };
  if (p.caso_id) meta.caso_id = p.caso_id;
  if (p.plan_id) meta.plan_id = p.plan_id;
  const pre: Record<string, string> = {};
  if (c.email && /@/.test(c.email)) pre.buyer_email = c.email;
  const tel = e164(c.telefono);
  if (tel) pre.buyer_phone_number = tel;
  const j = await square('online-checkout/payment-links', 'POST', {
    idempotency_key: crypto.randomUUID(),
    order: {
      location_id: await ubicacion(), reference_id: c.id, metadata: meta,
      line_items: [{ name: p.concepto.slice(0, 200), quantity: '1', base_price_money: { amount: Math.round(p.monto * 100), currency: 'USD' } }]
    },
    checkout_options: { redirect_url: p.origen === 'portal' ? SITIO + '/portal/?pago=ok' : SITIO + '/pago/', ask_for_shipping_address: false, allow_tipping: false },
    pre_populated_data: Object.keys(pre).length ? pre : undefined,
    payment_note: (p.concepto + ' · ' + [c.nombre, c.apellidos].filter(Boolean).join(' ')).slice(0, 500)
  });
  const l = j.payment_link || {};
  if (!l.url) throw new Error('Square no devolvió el enlace de pago.');
  await db.from('enlaces_pago').insert({ cliente_id: c.id, caso_id: p.caso_id || null, plan_id: p.plan_id || null, monto: p.monto, concepto: p.concepto.slice(0, 200), orden_id: l.order_id, enlace_id: l.id, url: l.url, origen: p.origen, creado_por: p.origen === 'panel' ? p.autor : null });
  return l.url as string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'Método no permitido' });
  const url = Deno.env.get('SUPABASE_URL')!;
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  await cargarClaves(db);
  if (!K.SQUARE_ACCESS_TOKEN) return json(req, 400, { error: 'Los pagos con tarjeta todavía no están conectados.', codigo: 'no_conectado' });
  const comoUsuario = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } }, auth: { persistSession: false } });
  const { data: u } = await comoUsuario.auth.getUser();
  if (!u?.user) return json(req, 401, { error: 'Inicia sesión' });
  let b: Record<string, any> = {};
  try { b = await req.json(); } catch (_) { /* */ }

  try {
    if (b.tipo === 'saldo') {
      const { data: id } = await comoUsuario.rpc('mi_cliente');
      if (!id) return json(req, 403, { error: 'Sin acceso' });
      const monto = await saldo(db, id);
      if (monto < 1) return json(req, 400, { error: 'No tienes saldo pendiente.' });
      return json(req, 200, { url: await crearEnlace(db, { cliente_id: id, monto, concepto: 'Pago a AVA Multiservices', origen: 'portal', autor: u.user.id }) });
    }

    const { data: ok } = await comoUsuario.rpc('puede', { modulo: 'cobros' });
    if (!ok) return json(req, 403, { error: 'Sin permiso' });
    if (b.tipo === 'monto') {
      const monto = Math.round(Number(b.monto) * 100) / 100;
      if (!(monto >= 1 && monto <= 50000)) return json(req, 400, { error: 'Monto inválido' });
      const concepto = String(b.descripcion || 'Pago a AVA Multiservices').trim() || 'Pago a AVA Multiservices';
      return json(req, 200, { url: await crearEnlace(db, { cliente_id: String(b.cliente_id), caso_id: b.caso_id ? String(b.caso_id) : null, plan_id: b.plan_id ? String(b.plan_id) : null, monto, concepto, origen: 'panel', autor: u.user.id }) });
    }
    return json(req, 400, { error: 'Solicitud inválida' });
  } catch (e) {
    return json(req, 400, { error: (e as Error).message });
  }
});
