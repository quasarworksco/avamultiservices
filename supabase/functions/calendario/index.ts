// Calendario de citas en formato .ics para suscribirse desde Google Calendar (o Apple / Outlook).
// GET ?t=<token privado de la persona>. Cada quien saca su enlace en Agenda → «Google Calendar».
// Solo funciona mientras esa persona siga activa en el equipo y tenga permiso de «citas».
import { createClient } from 'npm:@supabase/supabase-js@2.49.8';

const ESTADO: Record<string, string> = { solicitada: 'Por confirmar', confirmada: '', completada: 'Completada', no_asistio: 'No asistió' };

// Texto de iCalendar: escapar y doblar líneas a 75 bytes
function esc(s: string) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
function doblar(linea: string) {
  const bytes = new TextEncoder();
  const out: string[] = [];
  let actual = '';
  for (const ch of linea) {
    if (bytes.encode(actual + ch).length > (out.length ? 74 : 75)) { out.push(actual); actual = ''; }
    actual += ch;
  }
  out.push(actual);
  return out.join('\r\n ');
}
const fechaICS = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Método no permitido', { status: 405 });
  const token = new URL(req.url).searchParams.get('t') || '';
  if (!/^[0-9a-f]{48}$/.test(token)) return new Response('Enlace no válido', { status: 404 });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  const { data: en } = await db.from('calendario_enlaces').select('user_id').eq('token', token).maybeSingle();
  if (!en) return new Response('Enlace no válido', { status: 404 });
  const { data: adm } = await db.from('admins').select('activo,rol,permisos,acceso_hasta').eq('user_id', en.user_id).maybeSingle();
  const hoy = new Date().toISOString().slice(0, 10);
  const ok = adm && adm.activo && (!adm.acceso_hasta || adm.acceso_hasta >= hoy) && (adm.rol === 'admin' || (adm.permisos || []).includes('citas'));
  if (!ok) return new Response('Enlace no válido', { status: 404 });
  db.from('calendario_enlaces').update({ usado_at: new Date().toISOString() }).eq('token', token).then(() => {});

  const desde = new Date(Date.now() - 90 * 864e5).toISOString();
  const hasta = new Date(Date.now() + 400 * 864e5).toISOString();
  const { data: citas } = await db.from('citas').select('id,nombre,telefono,email,servicio,inicio,fin,estado,notas')
    .neq('estado', 'cancelada').gte('inicio', desde).lt('inicio', hasta).order('inicio').limit(2000);

  const ahora = fechaICS(new Date().toISOString());
  const l: string[] = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AVA Multiservices//CRM//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Citas AVA', 'X-WR-TIMEZONE:America/Chicago', 'X-WR-CALDESC:Citas del CRM de AVA Multiservices',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'
  ];
  for (const c of citas || []) {
    const fin = c.fin || new Date(new Date(c.inicio).getTime() + 30 * 60000).toISOString();
    const etiqueta = ESTADO[c.estado] ? ' (' + ESTADO[c.estado] + ')' : '';
    const desc = [c.servicio ? 'Servicio: ' + c.servicio : '', c.telefono ? 'Teléfono: ' + c.telefono : '', c.email ? 'Correo: ' + c.email : '', c.notas ? 'Notas: ' + c.notas : '', 'Abrir en el CRM: https://avamultiservices.com/admin/#/agenda']
      .filter(Boolean).join('\n');
    l.push('BEGIN:VEVENT', 'UID:cita-' + c.id + '@avamultiservices.com', 'DTSTAMP:' + ahora,
      'DTSTART:' + fechaICS(c.inicio), 'DTEND:' + fechaICS(fin),
      'SUMMARY:' + esc('Cita: ' + (c.nombre || 'Cliente') + (c.servicio ? ' · ' + c.servicio : '') + etiqueta),
      'DESCRIPTION:' + esc(desc), 'STATUS:' + (c.estado === 'solicitada' ? 'TENTATIVE' : 'CONFIRMED'),
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc('Cita con ' + (c.nombre || 'cliente')), 'TRIGGER:-PT30M', 'END:VALARM',
      'END:VEVENT');
  }
  l.push('END:VCALENDAR');
  const cuerpo = l.map(doblar).join('\r\n') + '\r\n';
  return new Response(req.method === 'HEAD' ? null : cuerpo, {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="citas-ava.ics"', 'Cache-Control': 'private, max-age=300' }
  });
});
