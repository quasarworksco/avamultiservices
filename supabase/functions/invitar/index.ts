// Invita a un miembro del equipo al panel de AVA y, con { accion: 'clave' }, le pone una contraseña nueva.
// Solo la dueña (rol admin) puede usarla.
// Desplegada en Supabase como función "invitar" (verify_jwt activo).
import { createClient } from 'npm:@supabase/supabase-js@2.49.8';

const ORIGENES = ['https://avamultiservices.com', 'https://www.avamultiservices.com', 'http://192.0.2.2:8080'];
const REDIRECT = 'https://avamultiservices.com/admin/';

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
  const auth = req.headers.get('Authorization') || '';

  const comoUsuario = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: duena, error: e1 } = await comoUsuario.rpc('es_duena');
  if (e1 || !duena) return json(req, 403, { error: 'Solo la administradora puede invitar usuarios' });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_) { /* cuerpo inválido */ }
  const admin = createClient(url, service, { auth: { persistSession: false } });

  // La administradora le pone una contraseña nueva a alguien del equipo (solo personas del equipo, no clientes del portal)
  if (body.accion === 'clave') {
    const userId = String(body.user_id || '');
    const clave = String(body.clave || '');
    if (clave.length < 10 || clave.length > 72) return json(req, 400, { error: 'La contraseña debe tener entre 10 y 72 caracteres' });
    const { data: miembro } = await admin.from('admins').select('user_id,email,nombre').eq('user_id', userId).maybeSingle();
    if (!miembro) return json(req, 404, { error: 'Esa persona no es del equipo' });
    const { error: e3 } = await admin.auth.admin.updateUserById(userId, { password: clave });
    if (e3) return json(req, 500, { error: 'No se pudo cambiar la contraseña' });
    const { data: yo } = await comoUsuario.auth.getUser();
    const { data: quien } = await admin.from('admins').select('nombre,email').eq('user_id', yo?.user?.id || '').maybeSingle();
    await admin.from('actividad').insert({ user_id: yo?.user?.id || null, usuario: quien?.nombre || quien?.email || null, accion: 'cambió la contraseña de', entidad: 'admins', entidad_id: userId, resumen: miembro.nombre || miembro.email });
    return json(req, 200, { ok: true });
  }

  const email = String(body.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(req, 400, { error: 'Correo inválido' });

  const { data: inv } = await admin.from('admin_emails').select('email').eq('email', email).maybeSingle();
  if (!inv) return json(req, 404, { error: 'Primero agrega el correo al equipo' });

  const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: REDIRECT });
  if (!error) return json(req, 200, { ok: true, estado: 'invitado' });

  // Si la cuenta ya existe, se le da acceso directamente con su contraseña actual
  const { data: alta, error: e2 } = await admin.rpc('alta_miembro_existente', { p_email: email });
  if (!e2 && alta) return json(req, 200, { ok: true, estado: 'existente' });
  return json(req, 500, { error: 'No se pudo enviar la invitación' });
});
