// Webhook de Stripe para AVA: registra en Cobros los pagos con tarjeta y los cobros mensuales.
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2.49.8';

const enc = new TextEncoder();

async function firmaValida(cuerpo: string, cabecera: string | null) {
  const secreto = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!secreto || !cabecera) return false;
  const partes: Record<string, string[]> = {};
  cabecera.split(',').forEach((x) => { const [k, v] = x.split('='); (partes[k] = partes[k] || []).push(v); });
  const t = partes.t?.[0];
  if (!t || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${cuerpo}`)));
  const hex = Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('');
  return (partes.v1 || []).some((v) => {
    if (v.length !== hex.length) return false;
    let r = 0;
    for (let i = 0; i < hex.length; i++) r |= hex.charCodeAt(i) ^ v.charCodeAt(i);
    return r === 0;
  });
}

const hoy = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Chicago' });
async function log(db: SupabaseClient, tipo: string, ok: boolean, detalle?: string) {
  await db.from('integraciones_eventos').insert({ fuente: 'stripe', tipo, ok, detalle: detalle?.slice(0, 1000) || null });
}
async function registrarPago(db: SupabaseClient, p: { cliente_id: string; caso_id?: string | null; monto: number; nota: string; stripe_id: string }) {
  const ins = await db.from('pagos').insert({ cliente_id: p.cliente_id, caso_id: p.caso_id || null, monto: p.monto, fecha: hoy(), metodo: 'tarjeta', nota: p.nota.slice(0, 500), stripe_id: p.stripe_id });
  if (ins.error && ins.error.code !== '23505') throw new Error(ins.error.message);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Método no permitido', { status: 405 });
  const cuerpo = await req.text();
  if (!(await firmaValida(cuerpo, req.headers.get('Stripe-Signature')))) return new Response('Firma inválida', { status: 400 });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const ev = JSON.parse(cuerpo);
  const o = ev.data?.object || {};
  try {
    switch (ev.type) {
      case 'checkout.session.completed': {
        const m = o.metadata || {};
        if (o.mode === 'payment' && o.payment_status === 'paid' && m.cliente_id) {
          await registrarPago(db, { cliente_id: m.cliente_id, caso_id: m.caso_id || null, monto: o.amount_total / 100, nota: 'Pago con tarjeta (Stripe)', stripe_id: String(o.payment_intent || o.id) });
          await log(db, 'pago', true, '$' + (o.amount_total / 100).toFixed(2));
        } else if (o.mode === 'subscription' && m.plan_id) {
          await db.from('planes').update({ stripe_suscripcion: o.subscription, estado_cobro: 'activo' }).eq('id', m.plan_id);
          await log(db, 'plan_activado', true);
        }
        break;
      }
      case 'invoice.paid': {
        const sub = o.subscription || o.parent?.subscription_details?.subscription;
        if (!sub || !(o.amount_paid > 0)) break;
        const { data: p } = await db.from('planes').select('id,cliente_id,descripcion').eq('stripe_suscripcion', sub).maybeSingle();
        const meta = o.subscription_details?.metadata || o.parent?.subscription_details?.metadata || {};
        const plan = p || (meta.plan_id ? (await db.from('planes').select('id,cliente_id,descripcion').eq('id', meta.plan_id).maybeSingle()).data : null);
        if (!plan) { await log(db, 'cobro_mensual', false, 'Suscripción sin plan: ' + sub); break; }
        if (!p) await db.from('planes').update({ stripe_suscripcion: sub }).eq('id', plan.id);
        await registrarPago(db, { cliente_id: plan.cliente_id, monto: o.amount_paid / 100, nota: 'Cobro mensual con tarjeta: ' + (plan.descripcion || 'plan'), stripe_id: o.id });
        await db.from('planes').update({ estado_cobro: 'activo' }).eq('id', plan.id);
        await log(db, 'cobro_mensual', true, '$' + (o.amount_paid / 100).toFixed(2));
        break;
      }
      case 'invoice.payment_failed': {
        const sub = o.subscription || o.parent?.subscription_details?.subscription;
        if (sub) await db.from('planes').update({ estado_cobro: 'fallido' }).eq('stripe_suscripcion', sub);
        await log(db, 'cobro_fallido', false, o.customer_email || '');
        break;
      }
      case 'customer.subscription.deleted':
        await db.from('planes').update({ estado_cobro: 'cancelado' }).eq('stripe_suscripcion', o.id);
        await log(db, 'plan_cancelado', true);
        break;
    }
  } catch (e) {
    await log(db, ev.type || 'error', false, (e as Error).message);
    return new Response('Error', { status: 500 }); // Stripe reintenta
  }
  return new Response(JSON.stringify({ recibido: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
