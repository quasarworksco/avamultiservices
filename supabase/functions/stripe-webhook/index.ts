// Webhook de Stripe para AVA: cuando un cliente paga con un enlace del CRM, el pago aparece solo en Cobros.
// Los pagos hechos en Stripe fuera del CRM y los reembolsos se avisan en Ajustes → Actividad reciente.
// Cobro automático mensual (suscripciones): cada mensualidad cobrada entra a Cobros (invoice.paid); si la tarjeta
// falla, se avisa con una tarea (invoice.payment_failed); si se cancela en Stripe, el plan vuelve a cobro manual.
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2.49.8';

const enc = new TextEncoder();

let secreto = '';
let kHora = 0;
async function cargarClave(db: SupabaseClient) {
  if (Date.now() - kHora < 60000) return secreto;
  const { data } = await db.rpc('claves_integracion');
  secreto = Deno.env.get('STRIPE_WEBHOOK_SECRET') || (data || {}).STRIPE_WEBHOOK_SECRET || '';
  kHora = Date.now();
  return secreto;
}

// Cabecera Stripe-Signature: t=marca,v1=firma (HMAC-SHA256 de «t.cuerpo» con el secreto whsec_…)
async function firmaValida(cuerpo: string, cabecera: string | null) {
  if (!secreto || !cabecera) return false;
  let t = '';
  const firmas: string[] = [];
  cabecera.split(',').forEach((x) => { const i = x.indexOf('='); const k = x.slice(0, i).trim(), v = x.slice(i + 1).trim(); if (k === 't') t = v; if (k === 'v1') firmas.push(v); });
  if (!t || !firmas.length || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(t + '.' + cuerpo)));
  const esperada = Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('');
  return firmas.some((f) => {
    if (f.length !== esperada.length) return false;
    let r = 0;
    for (let i = 0; i < f.length; i++) r |= f.charCodeAt(i) ^ esperada.charCodeAt(i);
    return r === 0;
  });
}

const hoy = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Chicago' });
const dinero = (centavos: number) => '$' + (centavos / 100).toFixed(2);
async function log(db: SupabaseClient, tipo: string, ok: boolean, detalle?: string) {
  await db.from('integraciones_eventos').insert({ fuente: 'stripe', tipo, ok, detalle: detalle?.slice(0, 1000) || null });
}

// El cliente registró su tarjeta para la mensualidad: el plan queda con cobro automático.
// El cobro en sí llega aparte con invoice.paid (así no se registra dos veces).
async function suscripcionActivada(db: SupabaseClient, s: Record<string, any>) {
  const { data: e } = s.payment_link ? await db.from('enlaces_pago').select('*').eq('enlace_id', s.payment_link).maybeSingle() : { data: null };
  const planId = e?.plan_id || s.metadata?.plan_id;
  if (!planId || !s.subscription) return;
  const dia = Math.min(28, Number(new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago', day: 'numeric' })));
  await db.from('planes').update({ stripe_suscripcion: String(s.subscription), estado_cobro: 'activo', dia_cobro: dia }).eq('id', planId);
  if (e && e.estado !== 'pagado') await db.from('enlaces_pago').update({ estado: 'pagado', pagado_at: new Date().toISOString() }).eq('id', e.id);
  await log(db, 'cobro_automatico', true, 'Cobro automático activado' + (e?.concepto ? ': ' + e.concepto : '') + ' · ' + dinero(Number(s.amount_total || 0)) + ' al mes.');
}

// En las versiones nuevas de la API la suscripción viene en invoice.parent.subscription_details
function datosFactura(inv: Record<string, any>) {
  const det = inv.parent?.subscription_details || inv.subscription_details || {};
  const sub = inv.subscription || det.subscription || null;
  return { sub: typeof sub === 'object' && sub ? sub.id : sub, meta: det.metadata || {} };
}
async function planDe(db: SupabaseClient, inv: Record<string, any>) {
  const { sub, meta } = datosFactura(inv);
  if (!sub) return null;
  let { data: pl } = await db.from('planes').select('*, clientes(nombre,apellidos)').eq('stripe_suscripcion', sub).maybeSingle();
  if (!pl && meta.plan_id) pl = (await db.from('planes').select('*, clientes(nombre,apellidos)').eq('id', meta.plan_id).maybeSingle()).data;
  return pl ? { pl, sub: String(sub) } : null;
}
const SERV: Record<string, string> = { contabilidad: 'Contabilidad mensual', plan_irs: 'Plan de pago IRS', otro: 'Mensualidad', credito: 'Mensualidad' };

async function mensualidadPagada(db: SupabaseClient, inv: Record<string, any>) {
  const centavos = Number(inv.amount_paid || 0);
  if (!(centavos > 0) || !datosFactura(inv).sub) return;
  const x = await planDe(db, inv);
  if (!x) { await log(db, 'pago_sin_vincular', true, dinero(centavos) + ' de una suscripción de Stripe que no está en el CRM. Regístralo en Cobros si es de un cliente.'); return; }
  const { pl, sub } = x;
  const ins = await db.from('pagos').insert({
    cliente_id: pl.cliente_id, caso_id: null, monto: centavos / 100, fecha: hoy(), metodo: 'tarjeta',
    nota: ('Mensualidad con tarjeta (cobro automático): ' + (SERV[pl.servicio] || 'Mensualidad') + (pl.descripcion ? ' · ' + pl.descripcion : '')).slice(0, 500), pasarela_id: String(inv.id)
  });
  if (ins.error && ins.error.code !== '23505') throw new Error(ins.error.message);
  await db.from('planes').update({ estado_cobro: 'activo', stripe_suscripcion: sub }).eq('id', pl.id);
  if (!ins.error) await log(db, 'pago', true, dinero(centavos) + ' · mensualidad de ' + [pl.clientes?.nombre, pl.clientes?.apellidos].filter(Boolean).join(' '));
}

async function mensualidadFallida(db: SupabaseClient, inv: Record<string, any>) {
  const x = await planDe(db, inv);
  if (!x) return;
  const { pl } = x;
  const nombre = [pl.clientes?.nombre, pl.clientes?.apellidos].filter(Boolean).join(' ');
  await db.from('planes').update({ estado_cobro: 'fallido' }).eq('id', pl.id);
  await log(db, 'pago_fallido', false, 'No se pudo cobrar la mensualidad de ' + nombre + ' (' + dinero(Number(inv.amount_due || 0)) + '). Stripe lo reintenta solo.');
  // Una tarea por cobro fallido (Stripe reintenta varias veces la misma factura)
  const titulo = ('Tarjeta rechazada: ' + nombre + ' · ' + dinero(Number(inv.amount_due || 0))).slice(0, 200);
  const { data: ya } = await db.from('tareas').select('id').eq('titulo', titulo).eq('hecha', false).limit(1);
  if (ya?.length) return;
  const { data: duena } = await db.from('admins').select('user_id').eq('rol', 'admin').eq('activo', true).order('created_at').limit(1).maybeSingle();
  await db.from('tareas').insert({ titulo, detalle: 'El cobro automático de su mensualidad no pasó. Stripe lo reintenta solo unos días; escríbele para que actualice su tarjeta o pague por otro medio.',
    fecha: hoy(), asignada_a: duena?.user_id || null, cliente_id: pl.cliente_id, enlace: 'clientes/' + pl.cliente_id });
}

async function suscripcionCancelada(db: SupabaseClient, sub: Record<string, any>) {
  const { data: pl } = await db.from('planes').select('id,estado_cobro').eq('stripe_suscripcion', String(sub.id)).maybeSingle();
  if (!pl) return;
  await db.from('planes').update({ estado_cobro: 'cancelado', stripe_suscripcion: null }).eq('id', pl.id);
  await log(db, 'cobro_automatico', false, 'Se canceló un cobro automático en Stripe. El plan vuelve a cobro manual.');
}

async function sesionPagada(db: SupabaseClient, s: Record<string, any>) {
  if (s.mode === 'subscription') { if (s.status === 'complete') await suscripcionActivada(db, s); return; }
  if (s.payment_status !== 'paid') return;
  const centavos = Number(s.amount_total || 0);
  if (!(centavos > 0)) return;
  const ref = String(s.payment_intent || s.id);
  const { data: ya } = await db.from('pagos').select('id').eq('pasarela_id', ref).maybeSingle();
  if (ya) return;
  const { data: e } = s.payment_link ? await db.from('enlaces_pago').select('*').eq('enlace_id', s.payment_link).maybeSingle() : { data: null };
  if (!e) {
    await log(db, 'pago_sin_vincular', true, dinero(centavos) + ' cobrado en Stripe fuera del CRM' + (s.customer_details?.email ? ' · ' + s.customer_details.email : '') + '. Regístralo en Cobros si es de un cliente.');
    return;
  }
  if (e.estado === 'pagado') return;
  const ins = await db.from('pagos').insert({
    cliente_id: e.cliente_id, caso_id: e.caso_id, monto: centavos / 100, fecha: hoy(), metodo: 'tarjeta',
    nota: ('Pago con tarjeta (Stripe)' + (e.concepto ? ': ' + e.concepto : '')).slice(0, 500), pasarela_id: ref
  }).select('id').single();
  if (ins.error) {
    if (ins.error.code === '23505') return; // Stripe avisó dos veces
    throw new Error(ins.error.message);
  }
  await db.from('enlaces_pago').update({ estado: 'pagado', pago_id: ins.data.id, pagado_at: new Date().toISOString() }).eq('id', e.id);
  await log(db, 'pago', true, dinero(centavos) + (e.concepto ? ' · ' + e.concepto : ''));
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Método no permitido', { status: 405 });
  const cuerpo = await req.text();
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  await cargarClave(db);
  if (!(await firmaValida(cuerpo, req.headers.get('stripe-signature')))) return new Response('Firma inválida', { status: 400 });
  let ev: Record<string, any> = {};
  try { ev = JSON.parse(cuerpo); } catch (_) { return new Response('JSON inválido', { status: 400 }); }
  const obj = ev.data?.object || {};
  try {
    if (ev.type === 'checkout.session.completed' || ev.type === 'checkout.session.async_payment_succeeded') await sesionPagada(db, obj);
    else if (ev.type === 'checkout.session.async_payment_failed') await log(db, 'pago_fallido', false, dinero(Number(obj.amount_total || 0)) + ': el pago bancario del cliente no se completó.');
    else if (ev.type === 'invoice.paid') await mensualidadPagada(db, obj);
    else if (ev.type === 'invoice.payment_failed') await mensualidadFallida(db, obj);
    else if (ev.type === 'customer.subscription.deleted') await suscripcionCancelada(db, obj);
    else if (ev.type === 'charge.refunded') await log(db, 'reembolso', true, dinero(Number(obj.amount_refunded || 0)) + ' devuelto en Stripe. Ajusta el pago en Cobros.');
  } catch (e) {
    await log(db, ev.type || 'error', false, (e as Error).message);
    return new Response('Error', { status: 500 }); // Stripe reintenta
  }
  return new Response(JSON.stringify({ recibido: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
