/* AVA Multiservices — Panel CRM: núcleo (sesión, permisos, navegación y utilidades)
   La seguridad real la aplica Supabase (RLS); aquí solo se ocultan las secciones sin permiso. */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://szmkcwtkorsndvmxywai.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_Ri5Pcd0a9dphA8W5qJ2YvQ_veqm7I26';

  // Se lee antes de que Supabase procese el enlace del correo
  var hashInicial = location.hash;
  var esInvitacion = /type=invite/.test(hashInicial);
  // Enlace de invitación enviado por WhatsApp: el código solo se usa cuando la persona guarda su contraseña
  // (así la vista previa de WhatsApp no lo gasta antes de tiempo)
  var codigoInv = (hashInicial.match(/[#&]invitacion=([^&]+)/) || [])[1] || null;
  var enlaceVencido = /error_code=otp_expired|error=access_denied/.test(hashInicial);
  if (codigoInv) { esInvitacion = true; history.replaceState(null, '', location.pathname); }

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
      else if (k === 'html') n.innerHTML = v; // solo con HTML ya escapado (AVA_FORMATO)
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

  /* Borrar con «Deshacer»: se espera 10 segundos antes de borrar de verdad.
     ejecutar() borra; deshacer() vuelve a mostrar lo que se ocultó. Si se cierra la página, se borra en ese momento. */
  var pendientes = [];
  function conDeshacer(texto, ejecutar, deshacer, segundos) {
    segundos = segundos || 10;
    var p = { hecho: false };
    p.correr = function () { if (p.hecho) return; p.hecho = true; clearInterval(p.int); pendientes.splice(pendientes.indexOf(p), 1); if (p.nodo) p.nodo.remove(); return ejecutar(); };
    var cuenta = el('b', { class: 'ud-n', text: String(segundos) });
    var barra = el('i');
    p.nodo = el('div', { class: 'undo', role: 'status' }, [el('span', { class: 'ud-t', text: texto }), cuenta,
      el('button', { type: 'button', text: 'Deshacer', onclick: function () {
        if (p.hecho) return; p.hecho = true; clearInterval(p.int); pendientes.splice(pendientes.indexOf(p), 1); p.nodo.remove();
        if (deshacer) deshacer(); toast('Listo, no se borró.');
      } }), el('span', { class: 'ud-bar' }, [barra])]);
    document.querySelectorAll('.undo').forEach(function (n, i, todos) { if (todos.length > 2) n.remove(); });
    document.body.appendChild(p.nodo);
    barra.style.transitionDuration = segundos + 's';
    requestAnimationFrame(function () { requestAnimationFrame(function () { barra.style.width = '0%'; }); });
    var fin = Date.now() + segundos * 1000;
    p.int = setInterval(function () {
      var r = Math.ceil((fin - Date.now()) / 1000);
      if (r <= 0) { p.correr(); return; }
      cuenta.textContent = String(r);
    }, 250);
    pendientes.push(p);
    return p;
  }
  window.addEventListener('beforeunload', function () { pendientes.slice().forEach(function (p) { p.correr(); }); });

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
    var y = !$('drawer').hidden && o.mantenerScroll ? body.scrollTop : 0;
    body.innerHTML = ''; foot.innerHTML = '';
    (o.cuerpo || []).forEach(function (n) { if (n) body.appendChild(n); });
    (o.pie || []).forEach(function (n) { if (n) foot.appendChild(n); });
    foot.hidden = !(o.pie && o.pie.length);
    drawerAlCerrar = o.alCerrar || null;
    $('drawer').hidden = false; $('drawer-bg').hidden = false;
    body.scrollTop = y;
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
    credito: { label: 'Reparación de crédito', corto: 'Crédito', etapas: ['Contrato', 'Análisis', 'Ronda 1', 'Ronda 2', 'Ronda 3', 'Ronda 4', 'Ronda 5', 'Finalizado'], finales: ['Finalizado'] },
    taxes: { label: 'Taxes', corto: 'Taxes', etapas: ['Documentos pendientes', 'Preparando', 'Revisión', 'Firmado', 'Enviado', 'Aceptado', 'Reembolso', 'Quedó con deuda'], finales: ['Reembolso', 'Quedó con deuda'] },
    plan_irs: { label: 'Plan de pago IRS', corto: 'Plan IRS', etapas: ['Cliente informado', 'Plan solicitado', 'Aprobado', 'En pagos', 'Pagado'], finales: ['Pagado'] },
    contabilidad: { label: 'Contabilidad mensual', corto: 'Contabilidad', etapas: ['Pedir estados de cuenta', 'Conciliar', 'Reporte', 'Enviado'], finales: ['Enviado'] },
    llc: { label: 'Formación de LLC', corto: 'LLC', etapas: ['Datos', 'Registro en Texas', 'EIN', 'Operating Agreement', 'Entregado'], finales: ['Entregado'] },
    franchise_tax: { label: 'Franchise Tax de Texas', corto: 'Franchise Tax', etapas: ['Pedir información', 'Información recibida', 'Preparando', 'Presentado'], finales: ['Presentado'] },
    inmigracion: { label: 'Inmigración', corto: 'Inmigración', etapas: ['Documentos pendientes', 'Preparando', 'Enviado', 'En proceso', 'Resuelto'], finales: ['Resuelto'] },
    otro: { label: 'Otro (notaría y más)', corto: 'Otro', etapas: ['Pendiente', 'En proceso', 'Completado'], finales: ['Completado'] },
    notaria: { label: 'Notaría', corto: 'Notaría', etapas: ['Pendiente', 'En proceso', 'Completado'], finales: ['Completado'], oculto: true }
  };
  function esFinal(servicio, etapa) { var s = SERVICIOS[servicio]; return !!s && s.finales.indexOf(etapa) !== -1; }
  var ORIGENES = { meta_ads: 'Meta Ads', whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', referido: 'Referido', walk_in: 'Walk-in (oficina)', sitio_web: 'Sitio web', formulario: 'Formulario del sitio', google: 'Google', otro: 'Otro' };
  var PERMISOS = [
    ['solicitudes', 'Solicitudes', 'Ver las solicitudes que llegan del sitio'],
    ['sensibles', 'Datos sensibles', 'Ver SSN y claves del monitor de crédito'],
    ['clientes', 'Clientes', 'Crear, editar y eliminar clientes'],
    ['casos', 'Casos', 'Gestionar los casos y mover etapas'],
    ['documentos', 'Documentos', 'Ver y subir documentos de clientes'],
    ['cobros', 'Cobros', 'Registrar pagos y ver ingresos'],
    ['tareas', 'Tareas', 'Crear y asignar tareas del equipo'],
    ['sitio', 'Sitio web', 'Editar precios, anuncios y preguntas del sitio'],
    ['contenido', 'Contenido digital', 'Ver, aprobar y comentar posts y diseños'],
    ['mensajes', 'Mensajes', 'Bandeja de WhatsApp, Instagram y Messenger, y avisos automáticos'],
    ['llamadas', 'Llamadas', 'Llamar desde el CRM, escuchar grabaciones y ver lo que extrae la IA'],
    ['campanas', 'Campañas', 'Crear y enviar campañas por etiqueta'],
    ['citas', 'Citas', 'Ver y gestionar la agenda'],
    ['taxes', 'Solo taxes asignados', 'Ve únicamente los casos de taxes que tú le asignes y esos clientes']
  ];
  var ROLES = {
    completa: { n: 'Compañera (todo menos equipo)', p: ['solicitudes', 'clientes', 'casos', 'documentos', 'cobros', 'tareas', 'mensajes', 'llamadas', 'campanas', 'citas', 'contenido'] },
    redes: { n: 'Redes sociales', p: ['solicitudes', 'mensajes', 'campanas'] },
    taxes: { n: 'Ayudante de temporada de taxes', p: ['taxes', 'tareas'] },
    personal: { n: 'Personalizado', p: [] }
  };

  /* ---------- Sesión y permisos ---------- */
  var me = null;
  function puede(m) {
    if (!me) return false;
    if (!m) return true;
    if (m.indexOf('|') !== -1) return m.split('|').some(puede);
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
    if (!session) {
      show('view-login');
      if (enlaceVencido) { enlaceVencido = false; history.replaceState(null, '', location.pathname); msg($('login-msg'), 'Ese enlace ya se usó o venció. Pide uno nuevo a quien te invitó.'); }
      return;
    }
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
    AVA.contarTareas();
    AVA.contarContenido();
    if (AVA.contarBandeja) AVA.contarBandeja();
    if (AVA.escucharBandeja) AVA.escucharBandeja();
    if (AVA.iniciarLinea) setTimeout(function () { AVA.iniciarLinea(); }, 2500);
    if (AVA.contarCitas) AVA.contarCitas();
    // Precarga en segundo plano lo que usan las ventanas emergentes
    if (puede('clientes|casos|cobros|tareas|documentos|mensajes|citas|taxes')) cargarClientes();
    equipo();
    if (puede('citas')) recordar('config_citas', function () { return sb.rpc('config_citas').then(function (r) { return r.data || {}; }); });
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
    if (codigoInv) {
      var v = await sb.auth.verifyOtp({ token_hash: codigoInv, type: 'invite' });
      if (v.error) { msg($('reset-msg'), 'Este enlace ya se usó o venció. Pide uno nuevo a quien te invitó.'); return; }
      codigoInv = null;
    }
    var res = await sb.auth.updateUser({ password: pass });
    if (res.error) { msg($('reset-msg'), 'No se pudo guardar. Pide un nuevo enlace e inténtalo otra vez.'); return; }
    modoClave = null;
    history.replaceState(null, '', location.pathname);
    entrar();
  });
  /* ---------- Contraseñas ---------- */
  // Campo de contraseña con botón para verla
  function campoClave(id, etiqueta) {
    var inp = el('input', { class: 'input sm', id: id, type: 'password', autocomplete: 'new-password', minlength: 10, maxlength: 72 });
    var ver = el('button', { type: 'button', class: 'mini-btn', text: 'Ver', onclick: function () { inp.type = inp.type === 'password' ? 'text' : 'password'; ver.textContent = inp.type === 'password' ? 'Ver' : 'Ocultar'; } });
    return { inp: inp, nodo: el('div', { class: 'field full' }, [el('label', { for: id, text: etiqueta }), el('div', { style: 'display:flex;gap:8px;align-items:center' }, [inp, ver])]) };
  }
  // Abre una ventana para escribir una contraseña nueva dos veces; alGuardar(clave, aviso) hace el cambio
  function ventanaClave(titulo, texto, alGuardar, conGenerar) {
    var a = campoClave('m-clave1', 'Contraseña nueva (mínimo 10 caracteres)'), b = campoClave('m-clave2', 'Escríbela otra vez');
    var extra = el('div', null, [texto ? el('p', { class: 'muted', style: 'margin-bottom:12px;font-size:13px', text: texto }) : null, el('div', { class: 'grid2' }, [a.nodo, b.nodo]),
      conGenerar ? el('button', { type: 'button', class: 'link-btn', style: 'margin-top:10px', text: 'Generar una contraseña segura', onclick: function () {
        var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789', arr = new Uint32Array(14), v = '';
        crypto.getRandomValues(arr); arr.forEach(function (n) { v += abc[n % abc.length]; });
        a.inp.value = b.inp.value = v; a.inp.type = b.inp.type = 'text';
      } }) : null]);
    modal({ titulo: titulo, ok: 'Guardar contraseña', campos: [], extra: extra, guardar: async function (_, aviso) {
      var v = a.inp.value;
      if (v.length < 10) { msg(aviso, 'La contraseña debe tener al menos 10 caracteres.'); return false; }
      if (v !== b.inp.value) { msg(aviso, 'Las dos contraseñas no coinciden.'); return false; }
      return alGuardar(v, aviso);
    } });
  }
  document.querySelectorAll('[data-mi-clave]').forEach(function (b) {
    b.addEventListener('click', function () {
      ventanaClave('Cambiar mi contraseña', 'La próxima vez que entres usa la contraseña nueva.', async function (v, aviso) {
        var r = await sb.auth.updateUser({ password: v });
        if (r.error) { msg(aviso, /different|same/i.test(r.error.message) ? 'Usa una contraseña distinta a la actual.' : 'No se pudo cambiar. Cierra sesión, entra de nuevo e inténtalo otra vez.'); return false; }
        toast('Listo, tu contraseña cambió.');
      });
    });
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
      var primera = ['inicio', 'solicitudes', 'clientes', 'casos'].filter(function (v) { return vistas[v] && puede(vistas[v].permiso); })[0];
      if (!primera) { $('main').innerHTML = ''; $('main').appendChild(el('div', { class: 'empty' }, [el('b', { text: 'Aún no tienes secciones asignadas' }), 'Pide a la administradora que active tus permisos.'])); return; }
      location.replace('#/' + primera);
      return;
    }
    document.querySelectorAll('.nav-item').forEach(function (a) { a.classList.toggle('on', a.dataset.route === nombre || (a.dataset.alias || '').split(' ').indexOf(nombre) !== -1); });
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

  var integCache = null;

  /* Lista de clientes en memoria para que las ventanas (pago, caso, tarea, cita…) abran al instante.
     Se usa la copia guardada y se actualiza por detrás; si falta el cliente que se necesita, se espera la nueva. */
  var cliCache = null, cliPromesa = null;
  function cargarClientes() {
    if (cliPromesa) return cliPromesa;
    cliPromesa = sb.from('clientes').select('id,nombre,apellidos,telefono,email').order('nombre').limit(5000).then(function (r) {
      if (!r.error) cliCache = r.data || [];
      cliPromesa = null;
      return cliCache || [];
    });
    return cliPromesa;
  }
  async function clientesBasicos(necesito) {
    if (cliCache && (!necesito || cliCache.some(function (c) { return c.id === necesito; }))) { cargarClientes(); return cliCache; }
    return cargarClientes();
  }
  /* Valores que casi no cambian (configuración de citas, etc.) guardados 5 minutos */
  var memo = {};
  function recordar(clave, fn, ms) {
    var m = memo[clave];
    if (m && Date.now() - m.t < (ms || 300000)) return m.p;
    var p = Promise.resolve(fn()).catch(function (e) { delete memo[clave]; throw e; });
    memo[clave] = { t: Date.now(), p: p };
    return p;
  }

  window.AVA = {
    sb: sb, el: el, icon: icon, fecha: fecha, hace: hace, dinero: dinero, iniciales: iniciales, nombreDe: nombreDe,
    hoyISO: hoyISO, soloDigitos: soloDigitos, msg: msg, toast: toast, modal: modal, drawer: drawer, cerrarDrawer: cerrarDrawer,
    ventanaClave: ventanaClave, conDeshacer: conDeshacer, seccion: seccion, cabecera: cabecera, SERVICIOS: SERVICIOS, ORIGENES: ORIGENES, PERMISOS: PERMISOS, ROLES: ROLES, esFinal: esFinal,
    serviciosVisibles: function () { return Object.keys(SERVICIOS).filter(function (k) { return !SERVICIOS[k].oculto; }); },
    puede: puede, yo: function () { return me; }, equipo: equipo, limpiarEquipo: function () { equipoCache = null; },
    clientesBasicos: clientesBasicos,
    nuevoClienteBD: function (d) { cliCache = null; return sb.from('clientes').insert(d); }, limpiarClientes: function () { cliCache = null; }, recordar: recordar, olvidar: function (clave) { delete memo[clave]; },
    // Qué integraciones están conectadas (WhatsApp, Meta, Square, IA, Google Calendar). Se pregunta una vez por sesión.
    integraciones: function () {
      if (!integCache) integCache = Promise.all([
        sb.functions.invoke('enviar-mensaje', { body: { estado: true } }).then(function (r) { return r.data || {}; }).catch(function () { return {}; }),
        sb.rpc('claves_configuradas').then(function (r) { return r.data || {}; }, function () { return {}; }),
        sb.rpc('calendario_estado').then(function (r) { return r.data || {}; }, function () { return {}; }),
        sb.rpc('llamadas_estado').then(function (r) { return r.data || {}; }, function () { return {}; })
      ]).then(function (r) { r[0].ia = !!r[1].GROQ_API_KEY; r[0].calendario = !!r[2].conectado; r[0].calendarioInfo = r[2]; r[0].llamadas = !!r[3].conectado; return r[0]; });
      return integCache;
    },
    limpiarIntegraciones: function () { integCache = null; },
    vista: function (nombre, def) { vistas[nombre] = def; },
    ir: function (ruta) { if (location.hash === '#/' + ruta) navegar(); else location.hash = '#/' + ruta; },
    resumenCaso: function (t) {
      var p = String(t || '').split(' · ');
      if (SERVICIOS[p[0]]) p[0] = SERVICIOS[p[0]].corto;
      return p.join(' · ');
    },
    contarSolicitudes: function () {},
    contarTareas: function () {},
    contarContenido: function () {},
    start: entrar
  };
})();
