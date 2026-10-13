/* AVA Multiservices — Panel CRM: núcleo (sesión, permisos, navegación y utilidades)
   La seguridad real la aplica Supabase (RLS); aquí solo se ocultan las secciones sin permiso. */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://szmkcwtkorsndvmxywai.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_Ri5Pcd0a9dphA8W5qJ2YvQ_veqm7I26';

  // Se lee antes de que Supabase procese el enlace del correo
  var hashInicial = location.hash;
  var esInvitacion = /type=invite/.test(hashInicial);

  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- Utilidades de interfaz ---------- */
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'text') n.textContent = v;
      else if (k === 'class') n.className = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (k === 'value') n.value = v;
      else n.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach(function (c) { if (c != null && c !== false) n.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c); });
    return n;
  }
  function icon(id, cls) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('class', 'icon ' + (cls || ''));
    var u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    u.setAttribute('href', '#' + id);
    s.appendChild(u);
    return s;
  }
  function fecha(v, conHora) {
    if (!v) return '';
    var d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T12:00:00') : new Date(v);
    var o = { day: '2-digit', month: 'short', year: 'numeric' };
    if (conHora) { o.hour = '2-digit'; o.minute = '2-digit'; }
    return d.toLocaleString('es-US', o);
  }
  function hace(v) {
    var s = (Date.now() - new Date(v).getTime()) / 1000;
    if (s < 60) return 'hace un momento';
    if (s < 3600) return 'hace ' + Math.round(s / 60) + ' min';
    if (s < 86400) return 'hace ' + Math.round(s / 3600) + ' h';
    if (s < 86400 * 7) return 'hace ' + Math.round(s / 86400) + ' d';
    return fecha(v);
  }
  function dinero(n) {
    if (n == null || n === '') return '';
    return Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: Number(n) % 1 ? 2 : 0 });
  }
  function iniciales(t) {
    return String(t || '?').trim().split(/\s+/).slice(0, 2).map(function (p) { return p[0]; }).join('').toUpperCase();
  }
  function nombreDe(r) { return [r.nombre, r.apellidos].filter(Boolean).join(' ') || 'Sin nombre'; }
  function hoyISO() { var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
  function soloDigitos(t) { return String(t || '').replace(/\D/g, ''); }

  function msg(node, text, kind) {
    node.textContent = text || '';
    node.className = 'msg ' + (kind || 'error');
    node.hidden = !text;
  }
  var toastTimer;
  function toast(text, kind) {
    var t = document.querySelector('.toast');
    if (t) t.remove();
    clearTimeout(toastTimer);
    t = el('div', { class: 'toast ' + (kind || ''), role: 'status', text: text });
    document.body.appendChild(t);
    toastTimer = setTimeout(function () { t.remove(); }, 3200);
  }

  /* Modal con formulario. campos: [{k, label, type, options, full, required, value, placeholder}] */
  function modal(o) {
    var form = el('form', { class: 'modal-card', novalidate: true });
    var bg = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, [form]);
    var aviso = el('div', { class: 'msg', hidden: true });
    var body = el('div', { class: 'modal-body' }, [aviso]);
    var grid = el('div', { class: 'grid2' });
    var inputs = {};
    (o.campos || []).forEach(function (c) {
      var id = 'm-' + c.k, inp;
      if (c.type === 'select') {
        inp = el('select', { class: 'input sm', id: id }, c.options.map(function (op) {
          return el('option', { value: op[0], text: op[1] });
        }));
      } else if (c.type === 'textarea') {
        inp = el('textarea', { class: 'input', id: id, placeholder: c.placeholder || '', maxlength: c.max || 10000 });
      } else {
        inp = el('input', { class: 'input sm', id: id, type: c.type || 'text', placeholder: c.placeholder || '', maxlength: c.max || 200, step: c.step, min: c.min, autocomplete: 'off' });
      }
      if (c.value != null) inp.value = c.value;
      inputs[c.k] = inp;
      grid.appendChild(el('div', { class: 'field' + (c.full ? ' full' : '') }, [
        el('label', { for: id, text: c.label + (c.required ? ' *' : '') }), inp
      ]));
    });
    body.appendChild(grid);
    if (o.extra) body.appendChild(o.extra);
    var guardar = el('button', { class: 'btn btn-dark btn-sm', type: 'submit' }, [el('span', { text: o.ok || 'Guardar' })]);
    form.appendChild(el('div', { class: 'modal-head' }, [
      el('h2', { text: o.titulo }),
      el('button', { class: 'x', type: 'button', 'aria-label': 'Cerrar', onclick: cerrar }, [icon('i-x', 'icon-sm')])
    ]));
    form.appendChild(body);
    var foot = el('div', { class: 'modal-foot' }, [
      o.borrar ? el('button', { class: 'link-btn danger', type: 'button', style: 'margin-right:auto', text: o.borrarTexto || 'Eliminar', onclick: async function () {
        if (!confirm(o.borrarConfirm || '¿Eliminar? Esta acción no se puede deshacer.')) return;
        var ok = await o.borrar();
        if (ok !== false) cerrar();
      } }) : null,
      el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Cancelar', onclick: cerrar }),
      guardar
    ]);
    form.appendChild(foot);
    function cerrar() { bg.remove(); document.removeEventListener('keydown', esc); }
    function esc(e) { if (e.key === 'Escape') cerrar(); }
    document.addEventListener('keydown', esc);
    bg.addEventListener('mousedown', function (e) { if (e.target === bg) cerrar(); });
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var datos = {};
      Object.keys(inputs).forEach(function (k) {
        var c = o.campos.filter(function (x) { return x.k === k; })[0];
        var v = inputs[k].value.trim();
        datos[k] = v === '' ? null : (c.type === 'number' ? Number(v) : v);
      });
      var falta = o.campos.filter(function (c) { return c.required && !datos[c.k]; })[0];
      if (falta) { msg(aviso, 'Completa: ' + falta.label + '.'); inputs[falta.k].focus(); return; }
      guardar.disabled = true;
      var r = await o.guardar(datos, aviso);
      guardar.disabled = false;
      if (r !== false) cerrar();
    });
    document.body.appendChild(bg);
    var primero = form.querySelector('input,select,textarea');
    if (primero && window.innerWidth > 760) primero.focus();
    return { cerrar: cerrar, inputs: inputs, aviso: aviso };
  }

  /* Panel lateral de detalle */
  var drawerAlCerrar = null;
  function drawer(o) {
    $('d-name').textContent = o.titulo;
    $('d-meta').textContent = o.meta || '';
    var body = $('d-body'), foot = $('d-foot');
    body.innerHTML = ''; foot.innerHTML = '';
    (o.cuerpo || []).forEach(function (n) { if (n) body.appendChild(n); });
    (o.pie || []).forEach(function (n) { if (n) foot.appendChild(n); });
    foot.hidden = !(o.pie && o.pie.length);
    drawerAlCerrar = o.alCerrar || null;
    $('drawer').hidden = false; $('drawer-bg').hidden = false;
    body.scrollTop = 0;
  }
  function cerrarDrawer() {
    if ($('drawer').hidden) return;
    $('drawer').hidden = true; $('drawer-bg').hidden = true;
    var f = drawerAlCerrar; drawerAlCerrar = null;
    if (f) f();
  }
  $('d-close').addEventListener('click', cerrarDrawer);
  $('drawer-bg').addEventListener('click', cerrarDrawer);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !document.querySelector('.modal')) cerrarDrawer(); });

  function seccion(titulo, pares) {
    var dl = el('dl', { class: 'kv' });
    pares.forEach(function (p) {
      dl.appendChild(el('dt', { text: p[0] }));
      var dd = el('dd');
      if (p[1] instanceof Node) dd.appendChild(p[1]); else dd.textContent = (p[1] == null || p[1] === '') ? '—' : p[1];
      dl.appendChild(dd);
    });
    return el('section', { class: 'd-sec' }, [el('h3', { text: titulo }), dl]);
  }

  function cabecera(kicker, titulo, cursiva, acciones) {
    return el('div', { class: 'ph' }, [
      el('div', null, [el('div', { class: 'kicker', text: kicker }), el('h1', null, [titulo + ' ', el('span', { class: 'serif', text: cursiva })])]),
      el('div', { class: 'acts' }, acciones || [])
    ]);
  }

  /* ---------- Catálogos ---------- */
  var SERVICIOS = {
    credito: { label: 'Reparación de crédito', corto: 'Crédito', etapas: ['Contrato', 'Análisis', 'Disputas R1', 'Disputas R2', 'Disputas R3', 'Seguimiento', 'Completado'] },
    taxes: { label: 'Taxes', corto: 'Taxes', etapas: ['Docs pendientes', 'En preparación', 'Revisión', 'Enviado al IRS', 'Aceptado', 'Reembolso'] },
    inmigracion: { label: 'Documentos migratorios', corto: 'Inmigración', etapas: ['Consulta', 'Documentos', 'Preparación', 'Enviado', 'Seguimiento', 'Completado'] },
    llc: { label: 'Formación de LLC', corto: 'LLC', etapas: ['Datos', 'Registro en Texas', 'EIN', 'Operating Agreement', 'Entregado'] },
    notaria: { label: 'Notaría', corto: 'Notaría', etapas: ['Agendado', 'Firmado', 'Entregado'] },
    otro: { label: 'Otro servicio', corto: 'Otro', etapas: ['Pendiente', 'En proceso', 'Completado'] }
  };
  var ORIGENES = { sitio_web: 'Sitio web', formulario: 'Formulario de inicio', whatsapp: 'WhatsApp', redes: 'Redes sociales', referido: 'Referido', visita: 'Visita a la oficina', otro: 'Otro' };
  var PERMISOS = [
    ['solicitudes', 'Solicitudes', 'Ver las solicitudes que llegan del sitio'],
    ['sensibles', 'Datos sensibles', 'Ver SSN y claves del monitor de crédito'],
    ['clientes', 'Clientes', 'Crear, editar y eliminar clientes'],
    ['casos', 'Casos', 'Gestionar los casos y mover etapas'],
    ['documentos', 'Documentos', 'Ver y subir documentos de clientes']
  ];

  /* ---------- Sesión y permisos ---------- */
  var me = null;
  function puede(m) {
    if (!me) return false;
    if (me.rol === 'admin') return true;
    if (m === 'equipo') return false;
    return (me.permisos || []).indexOf(m) !== -1;
  }

  var authViews = ['view-login', 'view-reset', 'view-denied', 'view-panel'];
  function show(id) { authViews.forEach(function (v) { $(v).hidden = v !== id; }); }
  var modoClave = esInvitacion ? 'invite' : null;

  function pantallaClave(tipo) {
    modoClave = tipo;
    $('reset-title').textContent = tipo === 'invite' ? 'Bienvenida al panel' : 'Nueva contraseña';
    $('reset-lead').textContent = tipo === 'invite' ? 'Crea tu contraseña para entrar. Usa al menos 10 caracteres.' : 'Elige una contraseña de al menos 10 caracteres.';
    show('view-reset');
  }

  async function entrar() {
    if (modoClave) { pantallaClave(modoClave); return; }
    var res = await sb.auth.getSession();
    var session = res.data.session;
    if (!session) { show('view-login'); return; }
    var r = await sb.from('admins').select('user_id,email,nombre,rol,permisos,activo').eq('user_id', session.user.id).maybeSingle();
    if (r.error || !r.data || !r.data.activo) { show('view-denied'); return; }
    me = r.data;
    $('me-name').textContent = me.nombre || me.email;
    $('me-rol').textContent = me.rol === 'admin' ? 'Administradora' : 'Equipo';
    $('me-ini').textContent = iniciales(me.nombre || me.email);
    document.querySelectorAll('[data-perm]').forEach(function (n) { n.hidden = !puede(n.dataset.perm); });
    show('view-panel');
    navegar();
    AVA.contarSolicitudes();
  }

  sb.auth.onAuthStateChange(function (event) {
    if (event === 'PASSWORD_RECOVERY') pantallaClave('recovery');
    if (event === 'SIGNED_OUT') { me = null; show('view-login'); }
  });

  $('login-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var btn = this.querySelector('button[type=submit]');
    btn.classList.add('loading'); btn.disabled = true;
    msg($('login-msg'));
    var res = await sb.auth.signInWithPassword({ email: $('l-email').value.trim(), password: $('l-pass').value });
    btn.classList.remove('loading'); btn.disabled = false;
    if (res.error) { msg($('login-msg'), 'Correo o contraseña incorrectos.'); return; }
    entrar();
  });
  $('forgot').addEventListener('click', async function () {
    var email = $('l-email').value.trim();
    if (!email) { msg($('login-msg'), 'Escribe tu correo arriba y vuelve a pulsar «Olvidé mi contraseña».'); return; }
    await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    msg($('login-msg'), 'Si el correo está registrado, te llegará un enlace para crear una nueva contraseña.', 'ok');
  });
  $('reset-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var pass = $('r-pass').value;
    if (pass.length < 10) { msg($('reset-msg'), 'Usa al menos 10 caracteres.'); return; }
    var res = await sb.auth.updateUser({ password: pass });
    if (res.error) { msg($('reset-msg'), 'No se pudo guardar. Pide un nuevo enlace e inténtalo otra vez.'); return; }
    modoClave = null;
    history.replaceState(null, '', location.pathname);
    entrar();
  });
  document.querySelectorAll('[data-logout]').forEach(function (b) {
    b.addEventListener('click', async function () { await sb.auth.signOut(); show('view-login'); });
  });

  /* ---------- Navegación ---------- */
  var vistas = {};
  function navegar() {
    if (!me) return;
    var h = location.hash;
    if (h.slice(0, 2) !== '#/') h = '';
    var partes = h.slice(2).split('/').filter(Boolean);
    var nombre = partes[0];
    if (!nombre || !vistas[nombre] || !puede(vistas[nombre].permiso)) {
      var primera = ['solicitudes', 'clientes', 'casos'].filter(function (v) { return puede(vistas[v].permiso); })[0];
      if (!primera) { $('main').innerHTML = ''; $('main').appendChild(el('div', { class: 'empty' }, [el('b', { text: 'Aún no tienes secciones asignadas' }), 'Pide a la administradora que active tus permisos.'])); return; }
      location.replace('#/' + primera);
      return;
    }
    document.querySelectorAll('.nav-item').forEach(function (a) { a.classList.toggle('on', a.dataset.route === nombre); });
    cerrarDrawer();
    var main = $('main');
    main.innerHTML = '';
    var cont = el('div', { class: 'view' });
    main.appendChild(cont);
    window.scrollTo(0, 0);
    vistas[nombre].render(cont, partes.slice(1));
  }
  window.addEventListener('hashchange', navegar);

  /* Equipo (para asignar responsables) */
  var equipoCache = null;
  async function equipo() {
    if (equipoCache) return equipoCache;
    var r = await sb.rpc('equipo_basico');
    equipoCache = r.data || [];
    return equipoCache;
  }

  window.AVA = {
    sb: sb, el: el, icon: icon, fecha: fecha, hace: hace, dinero: dinero, iniciales: iniciales, nombreDe: nombreDe,
    hoyISO: hoyISO, soloDigitos: soloDigitos, msg: msg, toast: toast, modal: modal, drawer: drawer, cerrarDrawer: cerrarDrawer,
    seccion: seccion, cabecera: cabecera, SERVICIOS: SERVICIOS, ORIGENES: ORIGENES, PERMISOS: PERMISOS,
    puede: puede, yo: function () { return me; }, equipo: equipo, limpiarEquipo: function () { equipoCache = null; },
    vista: function (nombre, def) { vistas[nombre] = def; },
    ir: function (ruta) { if (location.hash === '#/' + ruta) navegar(); else location.hash = '#/' + ruta; },
    resumenCaso: function (t) {
      var p = String(t || '').split(' · ');
      if (SERVICIOS[p[0]]) p[0] = SERVICIOS[p[0]].corto;
      return p.join(' · ');
    },
    contarSolicitudes: function () {},
    start: entrar
  };
})();
