// Crea enlaces de pago con tarjeta de Stripe (Payment Links) para AVA.
// - Portal del cliente: { tipo: 'saldo' } paga su saldo pendiente.
// - Panel (permiso «cobros»): { tipo: 'monto', cliente_id, monto, descripcion, caso_id?, plan_id? }.
// - Página pública de la factura: { tipo: 'factura', token } crea (o reutiliza) el enlace de tarjeta de esa factura.
//   Así las cuotas programadas también se pagan con tarjeta, y al pagar el cliente vuelve a su factura.
// - Panel: { tipo: 'suscripcion', plan_id } enlace para que el cliente registre su tarjeta y la mensualidad se cobre sola;
//   { tipo: 'cancelar_suscripcion', plan_id } la cancela en Stripe.
// - { tipo: 'cancelar', id }: desactiva en Stripe el enlace y lo marca cancelado.
// - { tipo: 'verificar', cliente_id? }: pregunta a Stripe por los enlaces pendientes y registra los pagados
//   (respaldo por si el webhook no llega). El cron lo llama cada 10 minutos con x-cron-secret.
// Cuando el cliente paga, stripe-webhook registra el pago en Cobros.
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2.49.8';

const ORIGENES = ['https://avamultiservices.com', 'https://www.avamultiservices.com', 'http://192.0.2.2:8080'];
const SITIO = 'https://avamultiservices.com';

// Claves de integración: primero los secretos de Supabase, si no las guardadas desde el panel (Vault).
const NOMBRES = ['STRIPE_SECRET_KEY'];
let K: Record<string, string> = {};
let kHora = 0;
async function cargarClaves(db: SupabaseClient) {
  if (Date.now() - kHora < 60000) return K;
  const { data } = await db.rpc('claves_integracion');
  const v = (data || {}) as Record<string, string>;
  const n: Record<string, string> = {};
  NOMBRES.forEach((x) => { n[x] = Deno.env.get(x) || v[x] || ''; });
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

// La API de Stripe recibe formularios con claves anidadas: a[b][0][c]=valor
function formulario(obj: Record<string, unknown>, pre = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const clave = pre ? `${pre}[${k}]` : k;
    if (typeof v === 'object') formulario(v as Record<string, unknown>, clave, out);
    else out.append(clave, String(v));
  }
  return out;
}
async function stripe(path: string, method = 'GET', body?: Record<string, unknown>) {
  const r = await fetch('https://api.stripe.com/v1/' + path, {
    method, headers: { Authorization: 'Bearer ' + K.STRIPE_SECRET_KEY, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-06-20' },
    body: body ? formulario(body).toString() : undefined
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) throw new Error('La clave de Stripe no es válida.');
  if (!r.ok) throw new Error(j.error?.message || 'Error de Stripe');
  return j;
}

// Stripe no permite cobrar reparación de crédito: el saldo con tarjeta deja fuera esos casos y sus pagos
async function saldo(db: SupabaseClient, clienteId: string) {
  const [casos, pagos] = await Promise.all([
    db.from('casos').select('id,precio,servicio').eq('cliente_id', clienteId).neq('estado', 'cancelado'),
    db.from('pagos').select('monto,caso_id').eq('cliente_id', clienteId)
  ]);
  const credito = new Set((casos.data || []).filter((k) => k.servicio === 'credito').map((k) => k.id));
  const total = (casos.data || []).filter((k) => k.servicio !== 'credito').reduce((a, k) => a + Number(k.precio || 0), 0);
  const pagado = (pagos.data || []).filter((p) => !credito.has(p.caso_id)).reduce((a, p) => a + Number(p.monto), 0);
  return Math.round(Math.max(0, total - pagado) * 100) / 100;
}

type Cobro = { cliente_id: string; caso_id?: string | null; plan_id?: string | null; monto: number; concepto: string; origen: 'panel' | 'portal'; autor: string | null;
  retorno?: string; recurrente?: boolean };
async function crearEnlace(db: SupabaseClient, p: Cobro) {
  const { data: c } = await db.from('clientes').select('id,nombre,apellidos,email').eq('id', p.cliente_id).maybeSingle();
  if (!c) throw new Error('Cliente no encontrado');
  const meta: Record<string, string> = { cliente_id: c.id, origen: 'ava_crm' };
  if (p.caso_id) meta.caso_id = p.caso_id;
  if (p.plan_id) meta.plan_id = p.plan_id;
  const nombre = [c.nombre, c.apellidos].filter(Boolean).join(' ');
  const descripcion = (p.concepto + (nombre ? ' · ' + nombre : '')).slice(0, 500);
  const precio = await stripe('prices', 'POST', { currency: 'usd', unit_amount: Math.round(p.monto * 100), product_data: { name: p.concepto.slice(0, 200) },
    recurring: p.recurrente ? { interval: 'month' } : undefined });
  const l = await stripe('payment_links', 'POST', {
    line_items: [{ price: precio.id, quantity: 1 }],
    metadata: meta,
    // Mensualidad: Stripe crea la suscripción y cobra solo cada mes; los cobros llegan por el webhook (invoice.paid)
    ...(p.recurrente ? { subscription_data: { metadata: meta, description: descripcion } } : { payment_intent_data: { metadata: meta, description: descripcion } }),
    after_completion: { type: 'redirect', redirect: { url: p.retorno || (p.origen === 'portal' ? SITIO + '/portal/?pago=ok' : SITIO + '/pago/') } },
    // Un solo pago por enlace: después de pagarlo deja de funcionar
    restrictions: { completed_sessions: { limit: 1 } }
  });
  if (!l.url) throw new Error('Stripe no devolvió el enlace de pago.');
  const url = c.email && /@/.test(c.email) ? l.url + '?prefilled_email=' + encodeURIComponent(c.email) : l.url;
  const ins = await db.from('enlaces_pago').insert({ cliente_id: c.id, caso_id: p.caso_id || null, plan_id: p.plan_id || null, monto: p.monto, concepto: p.concepto.slice(0, 200), proveedor: 'stripe', enlace_id: l.id, url, origen: p.origen, creado_por: p.origen === 'panel' ? p.autor : null, recurrente: !!p.recurrente }).select('id').single();
  // Sin el registro, el pago no se podría unir a su cliente: se desactiva el enlace en Stripe
  if (ins.error) { await stripe('payment_links/' + l.id, 'POST', { active: false }).catch(() => {}); throw new Error('No se pudo guardar el enlace de pago.'); }
  return { url, id: ins.data.id as string };
}

// Enlace de tarjeta de una factura, desde su página pública. Reutiliza el que ya tiene si sigue vigente y es del mismo monto.
async function enlaceFactura(db: SupabaseClient, token: string) {
  const { data: f } = await db.from('facturas').select('id,numero,token,cliente_id,caso_id,concepto,monto,metodos,estado,enlace_id,casos(servicio)').eq('token', token).maybeSingle();
  if (!f || f.estado !== 'pendiente' || !(f.metodos || []).includes('tarjeta')) throw new Error('Esta factura no se puede pagar con tarjeta.');
  if ((f.casos as { servicio?: string } | null)?.servicio === 'credito') throw new Error('Este servicio no se puede pagar con tarjeta. Paga por Zelle o en la oficina.');
  if (f.enlace_id) {
    const { data: e } = await db.from('enlaces_pago').select('id,url,monto,estado,enlace_id').eq('id', f.enlace_id).maybeSingle();
    if (e?.estado === 'pendiente' && Number(e.monto) === Number(f.monto)) return e.url;
    if (e?.estado === 'pagado') throw new Error('Esta factura ya se pagó.');
    if (e?.estado === 'pendiente') {
      await stripe('payment_links/' + e.enlace_id, 'POST', { active: false });
      await db.from('enlaces_pago').update({ estado: 'cancelado' }).eq('id', e.id);
    }
  }
  const n = await crearEnlace(db, { cliente_id: f.cliente_id, caso_id: f.caso_id, monto: Number(f.monto), concepto: 'Factura #' + f.numero + ' · ' + f.concepto, origen: 'portal', autor: null,
    retorno: SITIO + '/factura/?t=' + f.token + '&pago=ok' });
  await db.from('facturas').update({ enlace_id: n.id }).eq('id', f.id);
  return n.url;
}

// Mismo registro que hace stripe-webhook: pago en Cobros (con recibo) y enlace marcado como pagado
const hoy = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Chicago' });
async function registrarPago(db: SupabaseClient, e: Record<string, any>, s: Record<string, any>) {
  const centavos = Number(s.amount_total || 0);
  const ref = String(s.payment_intent || s.id);
  if (!(centavos > 0)) return false;
  const { data: ya } = await db.from('pagos').select('id').eq('pasarela_id', ref).maybeSingle();
  let pagoId = ya?.id;
  if (!pagoId) {
    const ins = await db.from('pagos').insert({
      cliente_id: e.cliente_id, caso_id: e.caso_id, monto: centavos / 100, fecha: hoy(), metodo: 'tarjeta',
      nota: ('Pago con tarjeta (Stripe)' + (e.concepto ? ': ' + e.concepto : '')).slice(0, 500), pasarela_id: ref
    }).select('id').single();
    if (ins.error && ins.error.code !== '23505') throw new Error(ins.error.message);
    pagoId = ins.data?.id || (await db.from('pagos').select('id').eq('pasarela_id', ref).maybeSingle()).data?.id;
    await db.from('integraciones_eventos').insert({ fuente: 'stripe', tipo: 'pago', ok: true, detalle: ('$' + (centavos / 100).toFixed(2) + (e.concepto ? ' · ' + e.concepto : '') + ' (verificado con Stripe)').slice(0, 1000) });
  }
  await db.from('enlaces_pago').update({ estado: 'pagado', pago_id: pagoId || null, pagado_at: new Date().toISOString() }).eq('id', e.id);
  return true;
}
async function verificarPendientes(db: SupabaseClient, clienteId?: string) {
  let q = db.from('enlaces_pago').select('*').eq('estado', 'pendiente').eq('proveedor', 'stripe').eq('recurrente', false).not('enlace_id', 'is', null)
    .gte('created_at', new Date(Date.now() - 45 * 864e5).toISOString()).order('created_at', { ascending: false }).limit(50);
  if (clienteId) q = q.eq('cliente_id', clienteId);
  const { data: pend } = await q;
  let registrados = 0;
  for (const e of pend || []) {
    try {
      const j = await stripe('checkout/sessions?status=complete&limit=3&payment_link=' + encodeURIComponent(e.enlace_id));
      const s = (j.data || []).find((x: Record<string, any>) => x.payment_status === 'paid');
      if (s && await registrarPago(db, e, s)) registrados++;
    } catch (err) {
      if (/clave/.test((err as Error).message)) throw err; // clave inválida: no tiene caso seguir
    }
  }
  return registrados;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'Método no permitido' });
  const url = Deno.env.get('SUPABASE_URL')!;
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  await cargarClaves(db);
  if (!K.STRIPE_SECRET_KEY) return json(req, 400, { error: 'Los pagos con tarjeta todavía no están conectados.', codigo: 'no_conectado' });
  // Cron: verifica todos los enlaces pendientes
  const dado = req.headers.get('x-cron-secret');
  if (dado && dado === (await db.rpc('cron_secreto')).data) {
    try { return json(req, 200, { registrados: await verificarPendientes(db) }); } catch (e) { return json(req, 400, { error: (e as Error).message }); }
  }
  let b: Record<string, any> = {};
  try { b = await req.json(); } catch (_) { /* */ }
  if (b.tipo === 'factura') {
    if (!/^[0-9a-f-]{36}$/i.test(String(b.token || ''))) return json(req, 400, { error: 'Factura no válida' });
    try { return json(req, 200, { url: await enlaceFactura(db, String(b.token)) }); } catch (e) { return json(req, 400, { error: (e as Error).message }); }
  }
  const comoUsuario = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } }, auth: { persistSession: false } });
  const { data: u } = await comoUsuario.auth.getUser();
  if (!u?.user) return json(req, 401, { error: 'Inicia sesión' });

  try {
    if (b.tipo === 'saldo') {
      const { data: id } = await comoUsuario.rpc('mi_cliente');
      if (!id) return json(req, 403, { error: 'Sin acceso' });
      const monto = await saldo(db, id);
      if (monto < 1) return json(req, 400, { error: 'No tienes saldo pendiente para pagar con tarjeta. Los pagos de reparación de crédito se hacen por Zelle o en la oficina.' });
      return json(req, 200, { url: (await crearEnlace(db, { cliente_id: id, monto, concepto: 'Pago a AVA Multiservices', origen: 'portal', autor: u.user.id })).url });
    }

    const { data: ok } = await comoUsuario.rpc('puede', { modulo: 'cobros' });
    if (!ok) return json(req, 403, { error: 'Sin permiso' });
    if (b.tipo === 'verificar') return json(req, 200, { registrados: await verificarPendientes(db, b.cliente_id ? String(b.cliente_id) : undefined) });
    if (b.tipo === 'cancelar') {
      const { data: e } = await db.from('enlaces_pago').select('id,estado,proveedor,enlace_id').eq('id', String(b.id)).maybeSingle();
      if (!e) return json(req, 404, { error: 'Enlace no encontrado' });
      if (e.estado !== 'pendiente') return json(req, 200, { ok: true });
      if (e.proveedor === 'stripe' && e.enlace_id) await stripe('payment_links/' + e.enlace_id, 'POST', { active: false });
      await db.from('enlaces_pago').update({ estado: 'cancelado' }).eq('id', e.id);
      return json(req, 200, { ok: true });
    }
    if (b.tipo === 'monto') {
      if (b.caso_id) {
        const { data: k } = await db.from('casos').select('servicio').eq('id', String(b.caso_id)).maybeSingle();
        if (k?.servicio === 'credito') return json(req, 400, { error: 'Stripe no permite cobrar reparación de crédito con tarjeta. Usa Zelle o efectivo.' });
      }
      if (b.plan_id) {
        const { data: pl } = await db.from('planes').select('servicio').eq('id', String(b.plan_id)).maybeSingle();
        if (pl?.servicio === 'credito') return json(req, 400, { error: 'Stripe no permite cobrar reparación de crédito con tarjeta. Usa Zelle o efectivo.' });
      }
      const monto = Math.round(Number(b.monto) * 100) / 100;
      if (!(monto >= 1 && monto <= 50000)) return json(req, 400, { error: 'Monto inválido' });
      const concepto = String(b.descripcion || 'Pago a AVA Multiservices').trim() || 'Pago a AVA Multiservices';
      // Desde una factura: al pagar, el cliente vuelve a su factura y la ve pagada
      const ft = /^[0-9a-f-]{36}$/i.test(String(b.factura_token || '')) ? String(b.factura_token) : '';
      const n = await crearEnlace(db, { cliente_id: String(b.cliente_id), caso_id: b.caso_id ? String(b.caso_id) : null, plan_id: b.plan_id ? String(b.plan_id) : null, monto, concepto, origen: 'panel', autor: u.user.id,
        retorno: ft ? SITIO + '/factura/?t=' + ft + '&pago=ok' : undefined });
      return json(req, 200, { url: n.url, id: n.id });
    }
    if (b.tipo === 'suscripcion' || b.tipo === 'cancelar_suscripcion') {
      const { data: pl } = await db.from('planes').select('*').eq('id', String(b.plan_id)).maybeSingle();
      if (!pl) return json(req, 404, { error: 'Plan no encontrado' });
      if (b.tipo === 'cancelar_suscripcion') {
        if (pl.stripe_suscripcion) {
          try { await stripe('subscriptions/' + pl.stripe_suscripcion, 'DELETE'); } catch (e) { if (!/No such subscription|canceled/i.test((e as Error).message)) throw e; }
        }
        // Enlaces para activar que nadie usó
        const { data: pend } = await db.from('enlaces_pago').select('id,enlace_id').eq('plan_id', pl.id).eq('recurrente', true).eq('estado', 'pendiente');
        for (const e of pend || []) {
          await stripe('payment_links/' + e.enlace_id, 'POST', { active: false }).catch(() => {});
          await db.from('enlaces_pago').update({ estado: 'cancelado' }).eq('id', e.id);
        }
        await db.from('planes').update({ estado_cobro: 'cancelado', stripe_suscripcion: null }).eq('id', pl.id);
        return json(req, 200, { ok: true });
      }
      if (pl.servicio === 'credito') return json(req, 400, { error: 'Stripe no permite cobrar reparación de crédito con tarjeta. Usa Zelle o efectivo.' });
      if (!pl.activo) return json(req, 400, { error: 'El plan está pausado.' });
      if (pl.estado_cobro === 'activo' && pl.stripe_suscripcion) return json(req, 400, { error: 'Este plan ya se cobra solo con tarjeta.' });
      // Al reenviar, el enlace anterior sin usar deja de funcionar (así no se suscribe dos veces)
      const { data: viejos } = await db.from('enlaces_pago').select('id,enlace_id').eq('plan_id', pl.id).eq('recurrente', true).eq('estado', 'pendiente');
      for (const e of viejos || []) {
        await stripe('payment_links/' + e.enlace_id, 'POST', { active: false }).catch(() => {});
        await db.from('enlaces_pago').update({ estado: 'cancelado' }).eq('id', e.id);
      }
      const SERV: Record<string, string> = { contabilidad: 'Contabilidad mensual', plan_irs: 'Plan de pago IRS', otro: 'Mensualidad' };
      const concepto = ((SERV[pl.servicio] || 'Mensualidad') + (pl.descripcion ? ' · ' + pl.descripcion : '')).slice(0, 200);
      const n = await crearEnlace(db, { cliente_id: pl.cliente_id, plan_id: pl.id, monto: Number(pl.monto), concepto, origen: 'panel', autor: u.user.id, recurrente: true,
        retorno: SITIO + '/pago/?mensual=1' });
      await db.from('planes').update({ estado_cobro: 'pendiente' }).eq('id', pl.id);
      return json(req, 200, { url: n.url });
    }
    return json(req, 400, { error: 'Solicitud inválida' });
  } catch (e) {
    return json(req, 400, { error: (e as Error).message });
  }
});
