/* AVA Multiservices — Portal del cliente (solo ve su propia información; lo controla Supabase con RLS) */
(function () {
  'use strict';
  var sb = window.supabase.createClient('https://szmkcwtkorsndvmxywai.supabase.co', 'sb_publishable_Ri5Pcd0a9dphA8W5qJ2YvQ_veqm7I26', {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  var $ = function (id) { return document.getElementById(id); };
  var ETAPAS = {
    credito: ['Reparación de crédito', ['Contrato', 'Análisis', 'Ronda 1', 'Ronda 2', 'Ronda 3', 'Ronda 4', 'Ronda 5', 'Finalizado']],
    taxes: ['Taxes', ['Documentos pendientes', 'Preparando', 'Revisión', 'Firmado', 'Enviado', 'Aceptado', 'Reembolso']],
    plan_irs: ['Plan de pago IRS', ['Cliente informado', 'Plan solicitado', 'Aprobado', 'En pagos', 'Pagado']],
    contabilidad: ['Contabilidad mensual', ['Pedir estados de cuenta', 'Conciliar', 'Reporte', 'Enviado']],
    llc: ['Formación de LLC', ['Datos', 'Registro en Texas', 'EIN', 'Operating Agreement', 'Entregado']],
    franchise_tax: ['Franchise Tax de Texas', ['Pedir información', 'Información recibida', 'Preparando', 'Presentado']],
    inmigracion: ['Trámite migratorio', ['Documentos pendientes', 'Preparando', 'Enviado', 'En proceso', 'Resuelto']],
    notaria: ['Notaría', ['Pendiente', 'En proceso', 'Completado']],
    otro: ['Trámite', ['Pendiente', 'En proceso', 'Completado']]
  };
  function show(id) { ['v-login', 'v-sin', 'v-portal'].forEach(function (v) { $(v).hidden = v !== id; }); $('salir').hidden = id === 'v-login'; }
  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }
  function dinero(n) { return Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' }); }
  function fecha(v) { return new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? v + 'T12:00:00' : v).toLocaleDateString('es-US', { day: 'numeric', month: 'short', year: 'numeric' }); }
  function msg(id, t, k) { var m = $(id); m.textContent = t; m.className = 'msg ' + (k || 'error'); m.hidden = !t; }

  $('login').addEventListener('submit', async function (e) {
    e.preventDefault();
    var email = $('email').value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg('lmsg', 'Escribe un correo válido.'); return; }
    await sb.auth.signInWithOtp({ email: email, options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname } });
    msg('lmsg', 'Si tu correo está registrado, te llegó un enlace para entrar. Revisa también la carpeta de spam.', 'ok');
  });
  $('salir').addEventListener('click', async function () { await sb.auth.signOut(); show('v-login'); });

  async function entrar() {
    var s = (await sb.auth.getSession()).data.session;
    if (!s) { show('v-login'); return; }
    var mc = await sb.rpc('mi_cliente');
    if (mc.error || !mc.data) { show('v-sin'); return; }
    var id = mc.data;
    show('v-portal');
    $('fecha').textContent = new Date().toLocaleDateString('es-US', { weekday: 'long', day: 'numeric', month: 'long' });
    var r = await Promise.all([
      sb.from('clientes').select('id,nombre').eq('id', id).single(),
      sb.from('casos').select('id,servicio,titulo,etapa,estado,precio,fecha_entrega').eq('cliente_id', id).neq('estado', 'cancelado').order('created_at', { ascending: false }),
      sb.from('pagos').select('monto,fecha,caso_id,metodo').eq('cliente_id', id).order('fecha', { ascending: false }),
      sb.from('contratos').select('titulo,estado,token,firmado_at').eq('cliente_id', id).order('created_at', { ascending: false }),
      sb.from('citas').select('inicio,servicio,estado').eq('cliente_id', id).gte('inicio', new Date().toISOString()).in('estado', ['solicitada', 'confirmada']).order('inicio'),
      sb.rpc('portal_info'),
      sb.functions.invoke('enviar-mensaje', { body: { estado: true } })
    ]);
    var pago = new URLSearchParams(location.search).get('pago');
    if (pago) {
      var aviso = { ok: ['¡Gracias! Recibimos tu pago. Puede tardar unos minutos en aparecer aquí.', 'ok'], plan: ['¡Listo! Tu tarjeta quedó registrada para el cobro mensual.', 'ok'], cancelado: ['El pago se canceló. Puedes intentarlo de nuevo cuando quieras.', 'error'] }[pago];
      if (aviso) msg('pmsg', aviso[0], aviso[1]);
      history.replaceState(null, '', location.pathname);
    }
    $('nombre').textContent = (r[0].data && r[0].data.nombre) || '';
    // Casos
    var cb = $('casos'); cb.innerHTML = '';
    (r[1].data || []).forEach(function (k) {
      var e = ETAPAS[k.servicio] || ETAPAS.otro, etapas = e[1].slice(), i = etapas.indexOf(k.etapa);
      if (i === -1) { etapas.push(k.etapa); i = etapas.length - 1; }
      var box = el('div', 'pt-caso'); box.appendChild(el('b', null, k.titulo || e[0]));
      box.appendChild(el('div', 'et', (k.estado === 'completado' ? 'Completado · ' : 'Etapa actual: ') + k.etapa + (k.fecha_entrega && k.estado === 'activo' ? ' · entrega estimada ' + fecha(k.fecha_entrega) : '')));
      var steps = el('div', 'pt-steps'); etapas.forEach(function (_, j) { var b = el('i', j <= i ? 'on' : ''); b.style.animationDelay = (j * 80) + 'ms'; steps.appendChild(b); });
      box.appendChild(steps); cb.appendChild(box);
    });
    if (!(r[1].data || []).length) cb.appendChild(el('p', null, 'Aún no tienes trámites activos.'));
    // Pagos
    var total = (r[1].data || []).reduce(function (a, k) { return a + (k.precio ? Number(k.precio) : 0); }, 0);
    var pagado = (r[2].data || []).reduce(function (a, p) { return a + Number(p.monto); }, 0);
    var pb = $('pagos'); pb.innerHTML = '';
    pb.appendChild(el('div', null, 'Saldo pendiente'));
    pb.appendChild(el('div', 'saldo-big', dinero(Math.max(0, total - pagado))));
    var info = r[5].data || {};
    if (total - pagado > 0) {
      var how = el('p', null, 'Puedes pagar en la oficina' + (info.zelle ? ' o por Zelle a ' + info.zelle : '') + '. ');
      how.style.cssText = 'margin-top:10px;font-size:14px;color:var(--muted)'; pb.appendChild(how);
      var conTarjeta = !!(r[6].data && r[6].data.stripe);
      var card = el('button', conTarjeta ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm', conTarjeta ? 'Pagar con tarjeta' : 'Pagar con tarjeta (muy pronto)');
      card.disabled = !conTarjeta; card.style.marginTop = '8px';
      card.onclick = async function () {
        card.disabled = true; card.textContent = 'Abriendo pago seguro…';
        var s = await sb.functions.invoke('stripe-pago', { body: { tipo: 'saldo' } });
        if (s.data && s.data.url) { location.href = s.data.url; return; }
        var e = {}; try { e = await s.error.context.json(); } catch (_) { /* */ }
        msg('pmsg', e.error || 'No se pudo abrir el pago. Intenta de nuevo.');
        card.disabled = false; card.textContent = 'Pagar con tarjeta';
      };
      pb.appendChild(card);
    }
    (r[2].data || []).slice(0, 8).forEach(function (p) { var row = el('div', 'pt-row'); row.appendChild(el('span', null, fecha(p.fecha))); row.appendChild(el('b', null, dinero(p.monto))); pb.appendChild(row); });
    // Contratos
    var cs = r[3].data || [];
    $('ccard').hidden = !cs.length;
    $('contratos').innerHTML = '';
    cs.forEach(function (k) {
      var row = el('div', 'pt-row'); row.appendChild(el('span', null, k.titulo));
      var a = el('a', k.estado === 'enviado' ? 'btn btn-primary btn-sm' : 'link-btn', k.estado === 'enviado' ? 'Firmar' : 'Ver firmado'); a.href = '../firmar/?t=' + k.token;
      row.appendChild(a); $('contratos').appendChild(row);
    });
    // Citas
    var ci = r[4].data || [];
    $('citcard').hidden = !ci.length; $('citas').innerHTML = '';
    ci.forEach(function (c) { var row = el('div', 'pt-row'); row.appendChild(el('span', null, c.servicio || 'Cita')); row.appendChild(el('b', null, new Date(c.inicio).toLocaleString('es-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chicago' }))); $('citas').appendChild(row); });
    pintarDocs(id);
    $('archivo').onchange = function () { subir(id, Array.prototype.slice.call(this.files)); this.value = ''; };
  }

  async function pintarDocs(id) {
    var r = await sb.from('documentos').select('nombre,created_at').eq('cliente_id', id).order('created_at', { ascending: false });
    var box = $('docs'); box.innerHTML = '';
    (r.data || []).forEach(function (d) { var row = el('div', 'pt-row'); row.appendChild(el('span', null, d.nombre)); row.appendChild(el('span', null, fecha(d.created_at))); box.appendChild(row); });
    if (!(r.data || []).length) box.appendChild(el('p', null, 'Todavía no has subido documentos.'));
  }
  async function subir(id, files) {
    var ok = 0;
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (f.size > 10 * 1024 * 1024) { msg('dmsg', f.name + ' supera 10 MB.'); continue; }
      msg('dmsg', 'Subiendo ' + f.name + '…', 'ok');
      var path = 'clientes/' + id + '/portal/' + Date.now() + '-' + f.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '-').slice(-80);
      var up = await sb.storage.from('documentos').upload(path, f, { contentType: f.type });
      if (up.error) { msg('dmsg', 'No se pudo subir ' + f.name + '.'); continue; }
      var ins = await sb.from('documentos').insert({ cliente_id: id, nombre: f.name.slice(0, 200), path: path, tipo: f.type, tamano: f.size });
      if (!ins.error) ok++;
    }
    if (ok) msg('dmsg', ok === 1 ? '¡Documento recibido! Gracias.' : ok + ' documentos recibidos. ¡Gracias!', 'ok');
    pintarDocs(id);
  }

  sb.auth.onAuthStateChange(function (ev) { if (ev === 'SIGNED_IN') entrar(); });
  entrar();
})();
