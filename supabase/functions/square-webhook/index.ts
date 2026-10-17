// Webhook de Square para AVA: cuando un cliente paga con un enlace del CRM, el pago aparece solo en Cobros.
// Los pagos hechos en Square fuera del CRM (en la oficina) se avisan en Ajustes → Actividad reciente.
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2.49.8';

// Debe ser exactamente la URL registrada en Square → Webhooks (la firma se calcula con ella)
const URL_WEBHOOK = 'https://szmkcwtkorsndvmxywai.supabase.co/functions/v1/square-webhook';
const enc = new TextEncoder();

let firmaKey = '';
let kHora = 0;
async function cargarClave(db: SupabaseClient) {
  if (Date.now() - kHora < 60000) return firmaKey;
  const { data } = await db.rpc('claves_integracion');
  firmaKey = Deno.env.get('SQUARE_WEBHOOK_SIGNATURE_KEY') || (data || {}).SQUARE_WEBHOOK_SIGNATURE_KEY || '';
  kHora = Date.now();
  return firmaKey;
}

async function firmaValida(cuerpo: string, firma: string | null) {
  if (!firmaKey || !firma) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(firmaKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(URL_WEBHOOK + cuerpo)));
  const esperada = btoa(String.fromCharCode(...mac));
  if (esperada.length !== firma.length) return false;
  let r = 0;
  for (let i = 0; i < esperada.length; i++) r |= esperada.charCodeAt(i) ^ firma.charCodeAt(i);
  return r === 0;
}

const hoy = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Chicago' });
const dinero = (centavos: number) => '$' + (centavos / 100).toFixed(2);
async function log(db: SupabaseClient, tipo: string, ok: boolean, detalle?: string) {
  await db.from('integraciones_eventos').insert({ fuente: 'square', tipo, ok, detalle: detalle?.slice(0, 1000) || null });
}

async function pagoCompletado(db: SupabaseClient, p: Record<string, any>) {
  const centavos = Number(p.amount_money?.amount || 0);
  if (!(centavos > 0)) return;
  const { data: ya } = await db.from('pagos').select('id').eq('pasarela_id', p.id).maybeSingle();
  if (ya) return;
  const { data: e } = p.order_id ? await db.from('enlaces_pago').select('*').eq('orden_id', p.order_id).maybeSingle() : { data: null };
  if (!e) {
    await log(db, 'pago_sin_vincular', true, dinero(centavos) + ' cobrado en Square fuera del CRM' + (p.buyer_email_address ? ' · ' + p.buyer_email_address : '') + '. Regístralo en Cobros si es de un cliente.');
    return;
  }
  if (e.estado === 'pagado') return;
  const ins = await db.from('pagos').insert({
    cliente_id: e.cliente_id, caso_id: e.caso_id, monto: centavos / 100, fecha: hoy(), metodo: 'tarjeta',
    nota: ('Pago con tarjeta (Square)' + (e.concepto ? ': ' + e.concepto : '')).slice(0, 500), pasarela_id: p.id
  }).select('id').single();
  if (ins.error) {
    if (ins.error.code === '23505') return; // Square avisó dos veces
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
  if (!(await firmaValida(cuerpo, req.headers.get('x-square-hmacsha256-signature')))) return new Response('Firma inválida', { status: 403 });
  let ev: Record<string, any> = {};
  try { ev = JSON.parse(cuerpo); } catch (_) { return new Response('JSON inválido', { status: 400 }); }
  const obj = ev.data?.object || {};
  try {
    if ((ev.type === 'payment.created' || ev.type === 'payment.updated') && obj.payment?.status === 'COMPLETED') await pagoCompletado(db, obj.payment);
    else if (ev.type === 'refund.updated' && obj.refund?.status === 'COMPLETED') await log(db, 'reembolso', true, dinero(Number(obj.refund.amount_money?.amount || 0)) + ' devuelto en Square. Ajusta el pago en Cobros.');
  } catch (e) {
    await log(db, ev.type || 'error', false, (e as Error).message);
    return new Response('Error', { status: 500 }); // Square reintenta
  }
  return new Response(JSON.stringify({ recibido: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
