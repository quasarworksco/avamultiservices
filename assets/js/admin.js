/* AVA Multiservices — Panel de solicitudes
   El acceso a los datos lo controla Supabase (RLS): solo las cuentas registradas como administradoras pueden leer. */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://szmkcwtkorsndvmxywai.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_Ri5Pcd0a9dphA8W5qJ2YvQ_veqm7I26';
  var BUCKET = 'documentos';

  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  var ESTADOS = { nuevo: 'Nueva', en_proceso: 'En proceso', completado: 'Completada', archivado: 'Archivada' };
  var DOCS = { licencia: 'Licencia de conducir o ID', factura: 'Factura (bill) a su nombre', 'seguro-social': 'Tarjeta de Seguro Social' };

  var $ = function (id) { return document.getElementById(id); };
  var views = ['view-login', 'view-reset', 'view-denied', 'view-panel'];
  function show(id) { views.forEach(function (v) { $(v).hidden = v !== id; }); }

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'class') n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function msg(id, text, kind) {
    var m = $(id);
    m.textContent = text || '';
    m.className = 'msg ' + (kind || 'error');
    m.hidden = !text;
  }
  function fecha(iso, conHora) {
    if (!iso) return '';
    var d = new Date(iso);
    var opts = { day: '2-digit', month: 'short', year: 'numeric' };
    if (conHora) { opts.hour = '2-digit'; opts.minute = '2-digit'; }
    return d.toLocaleString('es-US', opts);
  }
  function nombre(r) { return [r.nombre, r.apellidos].filter(Boolean).join(' ') || 'Sin nombre'; }

  /* ---------- Sesión ---------- */
  var recovering = false;

  async function route() {
    if (recovering) { show('view-reset'); return; }
    var res = await sb.auth.getSession();
    var session = res.data.session;
    if (!session) { show('view-login'); return; }
    var adm = await sb.rpc('is_admin');
    if (adm.error || !adm.data) { show('view-denied'); return; }
    $('who-email').textContent = session.user.email;
    show('view-panel');
    cargar();
  }

  sb.auth.onAuthStateChange(function (event) {
    if (event === 'PASSWORD_RECOVERY') { recovering = true; show('view-reset'); }
    if (event === 'SIGNED_OUT') show('view-login');
  });

  $('login-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var btn = this.querySelector('button[type=submit]');
    btn.classList.add('loading'); btn.disabled = true;
    msg('login-msg');
    var res = await sb.auth.signInWithPassword({ email: $('l-email').value.trim(), password: $('l-pass').value });
    btn.classList.remove('loading'); btn.disabled = false;
    if (res.error) { msg('login-msg', 'Correo o contraseña incorrectos.'); return; }
    $('l-pass').value = '';
    route();
  });

  $('forgot').addEventListener('click', async function () {
    var email = $('l-email').value.trim();
    if (!email) { msg('login-msg', 'Escribe tu correo arriba y vuelve a tocar «Olvidé mi contraseña».'); return; }
    var res = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/admin/' });
    if (res.error) msg('login-msg', 'No se pudo enviar el correo. Inténtalo en unos minutos.');
    else msg('login-msg', 'Si el correo está registrado, te llegará un enlace para crear una nueva contraseña.', 'ok');
  });

  $('reset-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var res = await sb.auth.updateUser({ password: $('r-pass').value });
    if (res.error) { msg('reset-msg', 'No se pudo guardar: ' + res.error.message); return; }
    recovering = false;
    history.replaceState(null, '', location.pathname);
    route();
  });

  document.querySelectorAll('[data-logout]').forEach(function (b) {
    b.addEventListener('click', async function () { await sb.auth.signOut(); show('view-login'); });
  });

  /* ---------- Lista ---------- */
  var filas = [];
  var filtro = { q: '', estado: '' };

  async function cargar() {
    $('list').innerHTML = '';
    $('list').appendChild(el('div', { class: 'empty', text: 'Cargando…' }));
    var res = await sb.from('solicitudes').select('*').order('created_at', { ascending: false }).limit(1000);
    if (res.error) {
      $('list').innerHTML = '';
      $('list').appendChild(el('div', { class: 'empty', text: 'No se pudieron cargar las solicitudes.' }));
      return;
    }
    filas = res.data || [];
    pintar();
    var id = location.hash.slice(1);
    if (id) { var r = filas.find(function (x) { return x.id === id; }); if (r) abrir(r); }
  }

  function pintar() {
    var c = { nuevo: 0, en_proceso: 0, completado: 0, total: filas.length };
    filas.forEach(function (r) { if (c[r.estado] !== undefined) c[r.estado]++; });
    Object.keys(c).forEach(function (k) { document.querySelector('[data-c="' + k + '"]').textContent = c[k]; });
    document.querySelectorAll('.stat').forEach(function (s) { s.classList.toggle('on', s.dataset.f === filtro.estado); });

    var q = filtro.q.toLowerCase();
    var vis = filas.filter(function (r) {
      if (filtro.estado && r.estado !== filtro.estado) return false;
      if (!q) return true;
      return [nombre(r), r.email, r.telefono, r.empleador, r.ciudad].join(' ').toLowerCase().indexOf(q) !== -1;
    });

    var list = $('list');
    list.innerHTML = '';
    list.appendChild(el('div', { class: 'row head' }, [
      el('span', { text: 'Cliente' }), el('span', { class: 'c-email', text: 'Contacto' }),
      el('span', { class: 'c-obj', text: 'Objetivo' }), el('span', { class: 'c-date', text: 'Recibida' }), el('span', { text: 'Estado' })
    ]));
    if (!vis.length) {
      list.appendChild(el('div', { class: 'empty', text: filas.length ? 'No hay resultados con esos filtros.' : 'Aún no hay solicitudes.' }));
      return;
    }
    vis.forEach(function (r) {
      var row = el('button', { class: 'row', type: 'button' }, [
        el('span', null, [el('div', { class: 'name', text: nombre(r) }), el('div', { class: 'muted', text: r.telefono })]),
        el('span', { class: 'muted c-email', text: r.email }),
        el('span', { class: 'muted c-obj', text: (r.objetivos || []).join(', ') || '—' }),
        el('span', { class: 'muted c-date', text: fecha(r.created_at) }),
        el('span', null, [el('span', { class: 'pill ' + r.estado, text: ESTADOS[r.estado] || r.estado })])
      ]);
      row.addEventListener('click', function () { abrir(r); });
      list.appendChild(row);
    });
  }

  $('q').addEventListener('input', function () { filtro.q = this.value; pintar(); });
  $('f-estado').addEventListener('change', function () { filtro.estado = this.value; pintar(); });
  document.querySelectorAll('.stat').forEach(function (s) {
    s.addEventListener('click', function () { filtro.estado = s.dataset.f; $('f-estado').value = s.dataset.f; pintar(); });
  });
  $('refresh').addEventListener('click', cargar);

  /* ---------- Detalle ---------- */
  var actual = null;

  function secreto(valor) {
    if (!valor) return el('span', { text: '—' });
    var span = el('span', { text: '••••••••' });
    var btn = el('button', { type: 'button', text: 'Mostrar' });
    btn.addEventListener('click', function () {
      var oculto = span.textContent === '••••••••';
      span.textContent = oculto ? valor : '••••••••';
      btn.textContent = oculto ? 'Ocultar' : 'Mostrar';
    });
    return el('span', { class: 'secret' }, [span, btn]);
  }

  function seccion(titulo, pares) {
    var dl = el('dl', { class: 'kv' });
    pares.forEach(function (p) {
      dl.appendChild(el('dt', { text: p[0] }));
      var dd = el('dd');
      if (p[1] instanceof Node) dd.appendChild(p[1]); else dd.textContent = p[1] || '—';
      dl.appendChild(dd);
    });
    return el('section', { class: 'd-sec' }, [el('h3', { text: titulo }), dl]);
  }

  function abrir(r) {
    actual = r;
    location.hash = r.id;
    $('d-name').textContent = nombre(r);
    $('d-meta').textContent = 'Formulario de inicio · ' + fecha(r.created_at, true);
    $('d-estado').value = r.estado;
    $('d-notas').value = r.notas || '';
    msg('d-msg');

    var body = $('d-body');
    body.innerHTML = '';
    body.appendChild(seccion('Objetivo', [['Quiere mejorar su crédito para', (r.objetivos || []).join(', ')]]));
    body.appendChild(seccion('Datos personales', [
      ['Nombre', r.nombre], ['Apellidos', r.apellidos], ['Email', r.email], ['Teléfono', r.telefono],
      ['Fecha de nacimiento', r.fecha_nacimiento], ['Social Security Number', secreto(r.ssn)], ['Empleador', r.empleador]
    ]));
    body.appendChild(seccion('Dirección', [
      ['Dirección', r.direccion], ['Dirección postal', r.direccion_postal], ['Ciudad', r.ciudad],
      ['Estado / región', r.region], ['Código postal', r.codigo_postal], ['País', r.pais]
    ]));
    body.appendChild(seccion('Monitor de crédito', [['Usuario y clave', secreto(r.monitor_credito)]]));

    var docs = el('div', { class: 'docs' });
    var keys = Object.keys(r.documentos || {});
    if (!keys.length) docs.appendChild(el('div', { class: 'doc', text: 'No adjuntó documentos.' }));
    keys.forEach(function (k) {
      var ver = el('button', { class: 'btn btn-dark', type: 'button', text: 'Ver' });
      ver.addEventListener('click', async function () {
        ver.disabled = true;
        var win = window.open('', '_blank');
        var res = await sb.storage.from(BUCKET).createSignedUrl(r.documentos[k], 120);
        ver.disabled = false;
        if (res.error) { if (win) win.close(); msg('d-msg', 'No se pudo abrir el documento.'); return; }
        if (win) win.location = res.data.signedUrl; else location.href = res.data.signedUrl;
      });
      docs.appendChild(el('div', { class: 'doc' }, [el('span', { text: DOCS[k] || k }), ver]));
    });
    body.appendChild(el('section', { class: 'd-sec' }, [el('h3', { text: 'Documentos' }), docs]));
    body.appendChild(seccion('Autorizaciones', [
      ['Revisión de crédito', r.autoriza_credito ? 'Sí' : 'No'],
      ['Mensajes de marketing', r.acepta_marketing ? 'Sí' : 'No']
    ]));

    $('drawer').hidden = false;
    $('drawer-bg').hidden = false;
    body.scrollTop = 0;
  }

  function cerrar() {
    $('drawer').hidden = true;
    $('drawer-bg').hidden = true;
    actual = null;
    history.replaceState(null, '', location.pathname);
  }
  $('d-close').addEventListener('click', cerrar);
  $('drawer-bg').addEventListener('click', cerrar);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && actual) cerrar(); });

  $('d-save').addEventListener('click', async function () {
    if (!actual) return;
    var cambios = { estado: $('d-estado').value, notas: $('d-notas').value.trim() || null };
    var res = await sb.from('solicitudes').update(cambios).eq('id', actual.id).select().single();
    if (res.error) { msg('d-msg', 'No se pudo guardar.'); return; }
    Object.assign(actual, res.data);
    msg('d-msg', 'Cambios guardados.', 'ok');
    pintar();
  });

  $('d-delete').addEventListener('click', async function () {
    if (!actual) return;
    if (!confirm('¿Eliminar la solicitud de ' + nombre(actual) + ' y sus documentos? Esta acción no se puede deshacer.')) return;
    var paths = Object.keys(actual.documentos || {}).map(function (k) { return actual.documentos[k]; });
    if (paths.length) {
      var rs = await sb.storage.from(BUCKET).remove(paths);
      if (rs.error) { msg('d-msg', 'No se pudieron borrar los documentos.'); return; }
    }
    var res = await sb.from('solicitudes').delete().eq('id', actual.id);
    if (res.error) { msg('d-msg', 'No se pudo eliminar.'); return; }
    var id = actual.id;
    filas = filas.filter(function (r) { return r.id !== id; });
    cerrar();
    pintar();
  });

  /* ---------- Exportar (sin SSN ni claves) ---------- */
  $('export').addEventListener('click', function () {
    var cols = [
      ['Recibida', function (r) { return fecha(r.created_at, true); }], ['Estado', function (r) { return ESTADOS[r.estado]; }],
      ['Nombre', 'nombre'], ['Apellidos', 'apellidos'], ['Email', 'email'], ['Teléfono', 'telefono'],
      ['Objetivos', function (r) { return (r.objetivos || []).join(', '); }], ['Empleador', 'empleador'],
      ['Ciudad', 'ciudad'], ['Estado/región', 'region'], ['Código postal', 'codigo_postal'], ['Notas', 'notas']
    ];
    var esc = function (v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var lines = [cols.map(function (c) { return esc(c[0]); }).join(',')];
    filas.forEach(function (r) {
      lines.push(cols.map(function (c) { return esc(typeof c[1] === 'function' ? c[1](r) : r[c[1]]); }).join(','));
    });
    var blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = el('a', { href: URL.createObjectURL(blob), download: 'solicitudes-ava-' + new Date().toISOString().slice(0, 10) + '.csv' });
    document.body.appendChild(a); a.click(); a.remove();
  });

  route();
})();
