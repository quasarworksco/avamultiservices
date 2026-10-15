// Invita a un cliente al Portal del cliente de AVA. Solo el equipo con permiso de clientes.
import { createClient } from 'npm:@supabase/supabase-js@2.49.8';

const ORIGENES = ['https://avamultiservices.com', 'https://www.avamultiservices.com', 'http://192.0.2.2:8080'];
const REDIRECT = 'https://avamultiservices.com/portal/';

function cors(req: Request) {
  const origin = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ORIGENES.includes(origin) ? origin : ORIGENES[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}
function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'Método no permitido' });
  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const comoUsuario = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } }, auth: { persistSession: false } });
  const { data: ok } = await comoUsuario.rpc('puede', { modulo: 'clientes' });
  if (!ok) return json(req, 403, { error: 'Sin permiso' });

  let clienteId = '';
  try { clienteId = String((await req.json()).cliente_id || ''); } catch (_) { /* */ }
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: c } = await admin.from('clientes').select('id,email').eq('id', clienteId).maybeSingle();
  if (!c || !c.email) return json(req, 400, { error: 'El cliente necesita un correo' });
  const email = String(c.email).trim().toLowerCase();

  const { data: esEquipo } = await admin.from('admin_emails').select('email').eq('email', email).maybeSingle();
  if (esEquipo) return json(req, 400, { error: 'Ese correo pertenece al equipo' });

  let userId = '';
  const inv = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: REDIRECT });
  if (!inv.error && inv.data?.user) {
    userId = inv.data.user.id;
  } else {
    const link = await admin.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: REDIRECT } });
    if (link.error || !link.data?.user) return json(req, 500, { error: 'No se pudo invitar' });
    userId = link.data.user.id;
    await admin.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: REDIRECT } });
  }
  const { error } = await admin.from('portal_accesos').upsert({ user_id: userId, cliente_id: c.id, email }, { onConflict: 'cliente_id' });
  if (error) return json(req, 500, { error: 'No se pudo registrar el acceso' });
  return json(req, 200, { ok: true });
});
