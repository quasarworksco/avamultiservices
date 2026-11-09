// Webhook de Stripe para AVA: cuando un cliente paga con un enlace del CRM, el pago aparece solo en Cobros.
// Los pagos hechos en Stripe fuera del CRM y los reembolsos se avisan en Ajustes → Actividad reciente.
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

async function sesionPagada(db: SupabaseClient, s: Record<string, any>) {
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
    else if (ev.type === 'charge.refunded') await log(db, 'reembolso', true, dinero(Number(obj.amount_refunded || 0)) + ' devuelto en Stripe. Ajusta el pago en Cobros.');
  } catch (e) {
    await log(db, ev.type || 'error', false, (e as Error).message);
    return new Response('Error', { status: 500 }); // Stripe reintenta
  }
  return new Response(JSON.stringify({ recibido: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
