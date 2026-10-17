// Crea enlaces de pago de Stripe para AVA.
// - Portal del cliente: { tipo: 'saldo' } paga su saldo pendiente con tarjeta.
// - Panel (permiso «cobros»): { tipo: 'monto', cliente_id, monto, descripcion, caso_id? } o { tipo: 'plan', plan_id } (cobro mensual automático).
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2.49.8';

const ORIGENES = ['https://avamultiservices.com', 'https://www.avamultiservices.com', 'http://192.0.2.2:8080'];
const SITIO = 'https://avamultiservices.com';

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

// Stripe usa formularios codificados: { a: { b: 1 } } -> a[b]=1
function form(obj: Record<string, unknown>, pre = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = pre ? `${pre}[${k}]` : k;
    if (typeof v === 'object') form(v as Record<string, unknown>, key, out);
    else out.append(key, String(v));
  }
  return out;
}
async function stripe(path: string, params: Record<string, unknown>) {
  const r = await fetch('https://api.stripe.com/v1/' + path, {
    method: 'POST', headers: { Authorization: 'Bearer ' + K.STRIPE_SECRET_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form(params)
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || 'Error de Stripe');
  return j;
}

async function clienteStripe(db: SupabaseClient, clienteId: string) {
  const { data: c } = await db.from('clientes').select('id,nombre,apellidos,email,telefono,stripe_cliente').eq('id', clienteId).single();
  if (!c) throw new Error('Cliente no encontrado');
  if (c.stripe_cliente) return c.stripe_cliente as string;
  const cu = await stripe('customers', { name: [c.nombre, c.apellidos].filter(Boolean).join(' '), email: c.email || undefined, phone: c.telefono || undefined, metadata: { cliente_id: c.id } });
  await db.from('clientes').update({ stripe_cliente: cu.id }).eq('id', c.id);
  return cu.id as string;
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'Método no permitido' });
  const url = Deno.env.get('SUPABASE_URL')!;
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  await cargarClaves(db);
  if (!K.STRIPE_SECRET_KEY) return json(req, 400, { error: 'Los pagos con tarjeta todavía no están conectados.', codigo: 'no_conectado' });
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
      const s = await stripe('checkout/sessions', {
        mode: 'payment', customer: await clienteStripe(db, id), locale: 'es',
        line_items: { 0: { quantity: 1, price_data: { currency: 'usd', unit_amount: Math.round(monto * 100), product_data: { name: 'Pago a AVA Multiservices' } } } },
        payment_intent_data: { metadata: { cliente_id: id } }, metadata: { cliente_id: id, tipo: 'saldo' },
        success_url: SITIO + '/portal/?pago=ok', cancel_url: SITIO + '/portal/?pago=cancelado'
      });
      return json(req, 200, { url: s.url });
    }

    const { data: ok } = await comoUsuario.rpc('puede', { modulo: 'cobros' });
    if (!ok) return json(req, 403, { error: 'Sin permiso' });

    if (b.tipo === 'monto') {
      const monto = Number(b.monto);
      if (!(monto >= 1 && monto <= 50000)) return json(req, 400, { error: 'Monto inválido' });
      const desc = String(b.descripcion || 'Pago a AVA Multiservices').slice(0, 120);
      const meta = { cliente_id: String(b.cliente_id), caso_id: b.caso_id ? String(b.caso_id) : '', tipo: 'monto' };
      const s = await stripe('checkout/sessions', {
        mode: 'payment', customer: await clienteStripe(db, String(b.cliente_id)), locale: 'es',
        line_items: { 0: { quantity: 1, price_data: { currency: 'usd', unit_amount: Math.round(monto * 100), product_data: { name: desc } } } },
        payment_intent_data: { metadata: meta }, metadata: meta,
        success_url: SITIO + '/portal/?pago=ok', cancel_url: SITIO + '/portal/?pago=cancelado'
      });
      return json(req, 200, { url: s.url });
    }

    if (b.tipo === 'plan') {
      const { data: p } = await db.from('planes').select('*').eq('id', String(b.plan_id)).single();
      if (!p || !p.activo) return json(req, 400, { error: 'Plan no encontrado o inactivo' });
      // Primer cobro el día de cobro del plan (ancla de facturación)
      const hoy = new Date();
      let ancla = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), p.dia_cobro, 15));
      if (ancla.getTime() < Date.now() + 2 * 3600e3) ancla = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + 1, p.dia_cobro, 15));
      const meta = { cliente_id: p.cliente_id, plan_id: p.id, tipo: 'plan' };
      const s = await stripe('checkout/sessions', {
        mode: 'subscription', customer: await clienteStripe(db, p.cliente_id), locale: 'es',
        line_items: { 0: { quantity: 1, price_data: { currency: 'usd', unit_amount: Math.round(Number(p.monto) * 100), recurring: { interval: 'month' }, product_data: { name: p.descripcion || 'Plan mensual AVA' } } } },
        subscription_data: { metadata: meta, billing_cycle_anchor: Math.floor(ancla.getTime() / 1000), proration_behavior: 'none' }, metadata: meta,
        success_url: SITIO + '/portal/?pago=plan', cancel_url: SITIO + '/portal/?pago=cancelado'
      });
      await db.from('planes').update({ estado_cobro: 'pendiente' }).eq('id', p.id);
      return json(req, 200, { url: s.url });
    }
    return json(req, 400, { error: 'Solicitud inválida' });
  } catch (e) {
    return json(req, 400, { error: (e as Error).message });
  }
});
