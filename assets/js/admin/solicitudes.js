/* Panel CRM — Solicitudes del formulario de inicio */
(function () {
  'use strict';
  var A = window.AVA, el = A.el, sb = A.sb;
  var BUCKET = 'documentos';
  var COLS = 'id,created_at,estado,objetivos,nombre,apellidos,email,telefono,fecha_nacimiento,empleador,direccion,direccion_postal,pais,region,ciudad,codigo_postal,documentos,autoriza_credito,acepta_marketing,notas';
  var ESTADOS = { nuevo: 'Nueva', en_proceso: 'En proceso', completado: 'Completada', archivado: 'Archivada' };
  var DOCS = { licencia: 'Licencia de conducir o ID', factura: 'Factura (bill) a su nombre', 'seguro-social': 'Tarjeta de Seguro Social' };

  var filas = [];
  var filtro = { q: '', estado: '' };
  var ui = {};

  A.contarSolicitudes = async function () {
    if (!A.puede('solicitudes')) return;
    var r = await Promise.all([
      sb.from('solicitudes').select('id', { count: 'exact', head: true }).eq('estado', 'nuevo'),
      sb.from('mensajes_web').select('id', { count: 'exact', head: true }).eq('estado', 'nuevo')
    ]);
    var n = (r[0].count || 0) + (r[1].count || 0);
    document.getElementById('count-sol').textContent = n ? n : '';
    A.nuevas = { solicitudes: r[0].count || 0, mensajes: r[1].count || 0 };
    document.querySelectorAll('[data-tab-count]').forEach(function (x) { var c = A.nuevas[x.dataset.tabCount]; x.textContent = c ? c : ''; });
  };

  A.pestanasEntrada = function (actual) {
    return el('div', { class: 'tabs', style: 'margin-top:20px' }, [['solicitudes', 'Formulario de inicio'], ['mensajes', 'Mensajes de contacto']].map(function (t) {
      return el('a', { class: 'tab' + (t[0] === actual ? ' on' : ''), href: '#/' + t[0] }, [t[1], el('span', { class: 'n', 'data-tab-count': t[0], text: A.nuevas && A.nuevas[t[0]] ? A.nuevas[t[0]] : '' })]);
    }));
  };

  /* ---------- Mensajes del formulario de contacto del sitio ---------- */
  var SERV_MAP = { 'Documentos migratorios': 'inmigracion', 'Taxes': 'taxes', 'LLC': 'llc', 'Notaría': 'notaria', 'Reparación de crédito': 'credito' };
  var EST_M = { nuevo: 'Nuevo', atendido: 'Atendido', archivado: 'Archivado' };
  var msjs = [];
  var mui = {};
  A.vista('mensajes', {
    permiso: 'solicitudes',
    render: function (cont) {
      mui.list = el('div', { class: 'list' });
      cont.appendChild(A.cabecera('Formularios del sitio', 'Solicitudes', 'recibidas', [
        el('button', { class: 'btn btn-ghost btn-sm', onclick: cargarM }, [A.icon('i-refresh'), el('span', { text: 'Actualizar' })])
      ]));
      cont.appendChild(A.pestanasEntrada('mensajes'));
      cont.appendChild(mui.list);
      cargarM();
    }
  });
  async function cargarM() {
    mui.list.innerHTML = '';
    mui.list.appendChild(el('div', { class: 'empty', text: 'Cargando…' }));
    var r = await sb.from('mensajes_web').select('*').order('created_at', { ascending: false }).limit(1000);
    msjs = r.data || [];
    mui.list.innerHTML = '';
    mui.list.appendChild(el('div', { class: 'row head' }, [el('span', { text: 'Persona' }), el('span', { class: 'hide-m', text: 'Correo' }), el('span', { class: 'hide-m', text: 'Servicio' }), el('span', { class: 'hide-m', text: 'Recibido' }), el('span', { text: 'Estado' })]));
    if (!msjs.length) mui.list.appendChild(el('div', { class: 'empty' }, [el('b', { text: 'Aún no hay mensajes' }), 'Los mensajes del formulario «Solicita tu cita» de tu sitio y los formularios de tus anuncios de Meta llegarán aquí.']));
    msjs.forEach(function (m) {
      mui.list.appendChild(el('button', { class: 'row', type: 'button', onclick: function () { abrirM(m); } }, [
        el('span', { class: 'who-cell' }, [el('span', { class: 'avatar', text: A.iniciales(m.nombre) }), el('div', null, [el('div', { class: 'name', text: m.nombre }), el('div', { class: 'muted', text: m.telefono + (m.origen === 'meta_ads' ? ' · Meta Ads' : '') })])]),
        el('span', { class: 'muted hide-m', text: m.email || '—' }), el('span', { class: 'muted hide-m', text: m.servicio || '—' }),
        el('span', { class: 'muted hide-m', text: A.hace(m.created_at) }),
        el('span', null, [el('span', { class: 'pill ' + (m.estado === 'nuevo' ? 'nuevo' : m.estado === 'atendido' ? 'completado' : 'archivado'), text: EST_M[m.estado] })])
      ]));
    });
    A.contarSolicitudes();
  }
  function abrirM(m) {
    var estado = el('select', { class: 'input' }, Object.keys(EST_M).map(function (k) { return el('option', { value: k, text: EST_M[k] }); }));
    estado.value = m.estado;
    var tel = A.soloDigitos(m.telefono);
    A.drawer({
      titulo: m.nombre, meta: (m.origen === 'meta_ads' ? 'Lead de Meta Ads · ' : 'Mensaje de contacto · ') + A.fecha(m.created_at, true),
      cuerpo: [
        A.seccion('Datos', [['Teléfono', m.telefono], ['Correo', m.email], ['Servicio', m.servicio], ['Idioma', m.idioma]]),
        A.seccion('Mensaje', [['Escribió', m.mensaje || '—']]),
        el('div', { class: 'quick', style: 'margin-top:14px' }, [
          tel.length >= 7 ? el('a', { href: 'https://wa.me/' + (tel.length === 10 ? '1' + tel : tel), target: '_blank', rel: 'noopener' }, [A.icon('i-whatsapp'), 'WhatsApp']) : null,
          m.email ? el('a', { href: 'mailto:' + m.email }, [A.icon('i-mail'), 'Correo']) : null
        ])
      ],
      pie: [
        m.cliente_id ? el('a', { class: 'btn btn-ghost', href: '#/clientes/' + m.cliente_id }, [A.icon('i-users'), el('span', { text: 'Ver ficha del cliente' })])
          : (A.puede('clientes') ? el('button', { class: 'btn btn-primary', type: 'button', onclick: function () { mACliente(m); } }, [A.icon('i-user-plus'), el('span', { text: 'Convertir en cliente' })]) : null),
        el('div', { class: 'row2' }, [estado, el('button', { class: 'btn btn-dark', type: 'button', text: 'Guardar', onclick: async function () {
          var r = await sb.from('mensajes_web').update({ estado: estado.value }).eq('id', m.id);
          if (r.error) { A.toast('No se pudo guardar.', 'error'); return; }
          m.estado = estado.value; A.toast('Estado guardado.'); A.cerrarDrawer(); cargarM();
        } })]),
        el('button', { type: 'button', class: 'link-btn danger', style: 'justify-self:start', text: 'Eliminar mensaje', onclick: async function () {
          if (!confirm('¿Eliminar el mensaje de ' + m.nombre + '?')) return;
          var r = await sb.from('mensajes_web').delete().eq('id', m.id);
          if (!r.error) { A.cerrarDrawer(); cargarM(); }
        } })
      ]
    });
  }
  async function mACliente(m) {
    var d = await A.buscarDuplicado(m.email, m.telefono);
    var id;
    if (d && confirm('Ya existe un cliente parecido: ' + A.nombreDe(d) + '. ¿Vincular este mensaje a su ficha?')) id = d.id;
    if (!id) {
      var partes = m.nombre.trim().split(/\s+/);
      var nuevo = await A.nuevoClienteBD({ nombre: partes[0], apellidos: partes.slice(1).join(' ') || null, email: m.email, telefono: /\d{7}/.test(A.soloDigitos(m.telefono)) ? m.telefono : null, origen: m.origen === 'meta_ads' ? 'meta_ads' : 'sitio_web', idioma: m.idioma === 'English' ? 'en' : 'es', notas: m.mensaje ? (m.origen === 'meta_ads' ? 'Formulario de Meta Ads: ' : 'Mensaje del sitio: ') + m.mensaje : null }).select('id').single();
      if (nuevo.error) { A.toast('No se pudo crear el cliente.', 'error'); return; }
      id = nuevo.data.id;
      var svc = SERV_MAP[m.servicio];
      if (svc && A.puede('casos')) await sb.from('casos').insert({ cliente_id: id, servicio: svc, etapa: A.SERVICIOS[svc].etapas[0], responsable: A.yo().user_id });
    }
    await sb.from('mensajes_web').update({ cliente_id: id, estado: 'atendido' }).eq('id', m.id);
    A.toast('Cliente listo.');
    A.ir('clientes/' + id);
  }

  A.vista('solicitudes', {
    permiso: 'solicitudes',
    render: function (cont, params) {
      ui.stats = el('div', { class: 'stats' }, [['nuevo', 'Nuevas'], ['en_proceso', 'En proceso'], ['completado', 'Completadas'], ['', 'Total']].map(function (s) {
        return el('button', { class: 'stat', 'data-f': s[0], onclick: function () { filtro.estado = s[0]; ui.sel.value = s[0]; pintar(); } }, [
          el('div', { class: 'k', 'data-c': s[0] || 'total', text: '0' }), el('div', { class: 'l', text: s[1] })
        ]);
      }));
      ui.sel = el('select', { class: 'input', 'aria-label': 'Estado', onchange: function () { filtro.estado = this.value; pintar(); } },
        [el('option', { value: '', text: 'Todos los estados' })].concat(Object.keys(ESTADOS).map(function (k) { return el('option', { value: k, text: ESTADOS[k] }); })));
      ui.sel.value = filtro.estado;
      ui.list = el('div', { class: 'list' });
      cont.appendChild(A.cabecera('Formularios del sitio', 'Solicitudes', 'recibidas', [
        el('button', { class: 'btn btn-ghost btn-sm', onclick: cargar }, [A.icon('i-refresh'), el('span', { text: 'Actualizar' })]),
        el('button', { class: 'btn btn-dark btn-sm', onclick: exportar }, [A.icon('i-download'), el('span', { text: 'Exportar CSV' })])
      ]));
      cont.appendChild(A.pestanasEntrada('solicitudes'));
      cont.appendChild(ui.stats);
      cont.appendChild(el('div', { class: 'tools' }, [
        el('input', { class: 'input search', type: 'search', placeholder: 'Buscar por nombre, correo o teléfono', value: filtro.q, oninput: function () { filtro.q = this.value; pintar(); } }),
        ui.sel
      ]));
      cont.appendChild(ui.list);
      cargar().then(function () {
        if (params[0]) { var r = filas.filter(function (x) { return x.id === params[0]; })[0]; if (r) abrir(r); }
      });
    }
  });

  async function cargar() {
    ui.list.innerHTML = '';
    ui.list.appendChild(el('div', { class: 'empty', text: 'Cargando…' }));
    var res = await sb.from('solicitudes').select(COLS).order('created_at', { ascending: false }).limit(1000);
    if (res.error) { ui.list.innerHTML = ''; ui.list.appendChild(el('div', { class: 'empty', text: 'No se pudieron cargar las solicitudes.' })); return; }
    filas = res.data || [];
    pintar();
    A.contarSolicitudes();
  }

  function pintar() {
    var c = { nuevo: 0, en_proceso: 0, completado: 0, total: filas.length };
    filas.forEach(function (r) { if (c[r.estado] !== undefined) c[r.estado]++; });
    Object.keys(c).forEach(function (k) { var n = ui.stats.querySelector('[data-c="' + k + '"]'); if (n) n.textContent = c[k]; });
    ui.stats.querySelectorAll('.stat').forEach(function (s) { s.classList.toggle('on', s.dataset.f === filtro.estado); });

    var q = filtro.q.toLowerCase();
    var vis = filas.filter(function (r) {
      if (filtro.estado && r.estado !== filtro.estado) return false;
      return !q || [A.nombreDe(r), r.email, r.telefono, r.empleador, r.ciudad].join(' ').toLowerCase().indexOf(q) !== -1;
    });
    var list = ui.list;
    list.innerHTML = '';
    list.appendChild(el('div', { class: 'row head' }, [
      el('span', { text: 'Cliente' }), el('span', { class: 'hide-m', text: 'Contacto' }),
      el('span', { class: 'hide-m', text: 'Objetivo' }), el('span', { class: 'hide-m', text: 'Recibida' }), el('span', { text: 'Estado' })
    ]));
    if (!vis.length) {
      list.appendChild(el('div', { class: 'empty' }, filas.length ? ['No hay resultados con esos filtros.'] : [el('b', { text: 'Aún no hay solicitudes' }), 'Cuando alguien llene el formulario de inicio aparecerá aquí.']));
      return;
    }
    vis.forEach(function (r) {
      list.appendChild(el('button', { class: 'row', type: 'button', onclick: function () { abrir(r); } }, [
        el('span', { class: 'who-cell' }, [el('span', { class: 'avatar', text: A.iniciales(A.nombreDe(r)) }), el('div', null, [el('div', { class: 'name', text: A.nombreDe(r) }), el('div', { class: 'muted', text: r.telefono })])]),
        el('span', { class: 'muted hide-m', text: r.email }),
        el('span', { class: 'muted hide-m', text: (r.objetivos || []).join(', ') || '—' }),
        el('span', { class: 'muted hide-m', text: A.fecha(r.created_at) }),
        el('span', null, [el('span', { class: 'pill ' + r.estado, text: ESTADOS[r.estado] || r.estado })])
      ]));
    });
  }

  function sensible(r, campo) {
    if (!A.puede('sensibles')) return el('span', { class: 'muted', text: 'Requiere permiso' });
    var span = el('span', { text: '••••••••' });
    var btn = el('button', { type: 'button', text: 'Mostrar' });
    btn.addEventListener('click', async function () {
      if (span.dataset.v) { span.textContent = '••••••••'; delete span.dataset.v; btn.textContent = 'Mostrar'; return; }
      btn.disabled = true;
      var res = await sb.rpc('ver_sensible', { p_id: r.id });
      btn.disabled = false;
      if (res.error) { A.toast('No se pudo mostrar el dato.', 'error'); return; }
      var v = res.data && res.data[campo];
      span.textContent = v || '—'; span.dataset.v = '1'; btn.textContent = 'Ocultar';
    });
    return el('span', { class: 'secret' }, [span, btn]);
  }

  function documentos(r) {
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
        if (res.error) { if (win) win.close(); A.toast('No se pudo abrir el documento.', 'error'); return; }
        if (win) win.location = res.data.signedUrl; else location.href = res.data.signedUrl;
      });
      docs.appendChild(el('div', { class: 'doc' }, [el('span', { text: DOCS[k] || k }), ver]));
    });
    return el('section', { class: 'd-sec' }, [el('h3', { text: 'Documentos' }), docs]);
  }
  A.documentosSolicitud = documentos;

  async function abrir(r) {
    history.replaceState(null, '', '#/solicitudes/' + r.id);
    var estado = el('select', { class: 'input' }, Object.keys(ESTADOS).map(function (k) { return el('option', { value: k, text: ESTADOS[k] }); }));
    estado.value = r.estado;
    var notas = el('textarea', { class: 'input', placeholder: 'Notas internas (solo visibles en el panel)' });
    notas.value = r.notas || '';
    var aviso = el('div', { class: 'msg', hidden: true });
    var convertir = el('button', { class: 'btn btn-primary', type: 'button', hidden: !A.puede('clientes') }, [A.icon('i-user-plus'), el('span', { text: 'Convertir en cliente' })]);

    A.drawer({
      titulo: A.nombreDe(r),
      meta: 'Formulario de inicio · ' + A.fecha(r.created_at, true),
      cuerpo: [
        A.seccion('Objetivo', [['Quiere mejorar su crédito para', (r.objetivos || []).join(', ')]]),
        A.seccion('Datos personales', [['Nombre', r.nombre], ['Apellidos', r.apellidos], ['Email', r.email], ['Teléfono', r.telefono],
          ['Fecha de nacimiento', A.fecha(r.fecha_nacimiento)], ['Social Security Number', sensible(r, 'ssn')], ['Empleador', r.empleador]]),
        A.seccion('Dirección', [['Dirección', r.direccion], ['Dirección postal', r.direccion_postal], ['Ciudad', r.ciudad],
          ['Estado / región', r.region], ['Código postal', r.codigo_postal], ['País', r.pais]]),
        A.seccion('Monitor de crédito', [['Usuario y clave', sensible(r, 'monitor_credito')]]),
        documentos(r),
        A.seccion('Autorizaciones', [['Revisión de crédito', r.autoriza_credito ? 'Sí' : 'No'], ['Mensajes de marketing', r.acepta_marketing ? 'Sí' : 'No']])
      ],
      pie: [
        convertir,
        el('div', { class: 'row2' }, [estado, el('button', { class: 'btn btn-dark', type: 'button', text: 'Guardar', onclick: async function () {
          var res = await sb.from('solicitudes').update({ estado: estado.value, notas: notas.value.trim() || null }).eq('id', r.id).select(COLS).single();
          if (res.error) { A.msg(aviso, 'No se pudo guardar.'); return; }
          Object.assign(r, res.data); A.msg(aviso, 'Cambios guardados.', 'ok'); pintar(); A.contarSolicitudes();
        } })]),
        notas,
        el('button', { type: 'button', class: 'link-btn danger', style: 'justify-self:start', text: 'Eliminar solicitud y documentos', onclick: function () { eliminar(r, aviso); } }),
        aviso
      ],
      alCerrar: function () { if (location.hash.indexOf('#/solicitudes/') === 0) history.replaceState(null, '', '#/solicitudes'); }
    });

    if (!A.puede('clientes')) return;
    var ya = await sb.from('clientes').select('id').eq('solicitud_id', r.id).limit(1);
    if (ya.data && ya.data[0]) {
      convertir.innerHTML = '';
      convertir.className = 'btn btn-ghost';
      convertir.appendChild(A.icon('i-users')); convertir.appendChild(el('span', { text: 'Ver ficha del cliente' }));
      convertir.onclick = function () { A.ir('clientes/' + ya.data[0].id); };
    } else {
      convertir.onclick = function () { aCliente(r, convertir, aviso); };
    }
  }

  async function aCliente(r, btn, aviso) {
    btn.disabled = true;
    var d = await A.buscarDuplicado(r.email, r.telefono);
    if (d) {
      btn.disabled = false;
      if (confirm('Ya existe un cliente parecido: ' + A.nombreDe(d) + '. ¿Quieres abrir su ficha en lugar de crear uno nuevo?')) { A.ir('clientes/' + d.id); }
      return;
    }
    var nuevo = await A.nuevoClienteBD({
      nombre: r.nombre || 'Sin nombre', apellidos: r.apellidos, email: r.email, telefono: r.telefono,
      fecha_nacimiento: r.fecha_nacimiento, direccion: r.direccion, ciudad: r.ciudad, region: r.region,
      codigo_postal: r.codigo_postal, origen: 'formulario', solicitud_id: r.id,
      notas: (r.objetivos || []).length ? 'Objetivo: ' + r.objetivos.join(', ') : null
    }).select('id').single();
    if (nuevo.error) { btn.disabled = false; A.msg(aviso, 'No se pudo crear el cliente.'); return; }
    if (A.puede('casos')) {
      await sb.from('casos').insert({ cliente_id: nuevo.data.id, servicio: 'credito', etapa: A.SERVICIOS.credito.etapas[0], titulo: 'Reparación de crédito', responsable: A.yo().user_id });
    }
    if (r.estado === 'nuevo') await sb.from('solicitudes').update({ estado: 'en_proceso' }).eq('id', r.id);
    A.contarSolicitudes();
    A.toast('Cliente creado con su caso de crédito.');
    A.ir('clientes/' + nuevo.data.id);
  }

  async function eliminar(r, aviso) {
    if (!confirm('¿Eliminar la solicitud de ' + A.nombreDe(r) + ' y sus documentos? Esta acción no se puede deshacer.')) return;
    var paths = Object.keys(r.documentos || {}).map(function (k) { return r.documentos[k]; });
    if (paths.length) {
      var rs = await sb.storage.from(BUCKET).remove(paths);
      if (rs.error) { A.msg(aviso, 'No se pudieron borrar los documentos.'); return; }
    }
    var res = await sb.from('solicitudes').delete().eq('id', r.id);
    if (res.error) { A.msg(aviso, 'No se pudo eliminar.'); return; }
    filas = filas.filter(function (x) { return x.id !== r.id; });
    A.cerrarDrawer(); pintar(); A.contarSolicitudes();
  }

  /* Exportar sin SSN ni claves */
  function exportar() {
    var cols = [
      ['Recibida', function (r) { return A.fecha(r.created_at, true); }], ['Estado', function (r) { return ESTADOS[r.estado]; }],
      ['Nombre', 'nombre'], ['Apellidos', 'apellidos'], ['Email', 'email'], ['Teléfono', 'telefono'],
      ['Objetivos', function (r) { return (r.objetivos || []).join(', '); }], ['Empleador', 'empleador'],
      ['Ciudad', 'ciudad'], ['Estado/región', 'region'], ['Código postal', 'codigo_postal'], ['Notas', 'notas']
    ];
    A.csv('solicitudes', cols, filas);
  }

  A.csv = function (nombre, cols, filas) {
    var esc = function (v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var lines = [cols.map(function (c) { return esc(c[0]); }).join(',')];
    filas.forEach(function (r) { lines.push(cols.map(function (c) { return esc(typeof c[1] === 'function' ? c[1](r) : r[c[1]]); }).join(',')); });
    var blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = el('a', { href: URL.createObjectURL(blob), download: nombre + '-ava-' + A.hoyISO() + '.csv' });
    document.body.appendChild(a); a.click(); a.remove();
  };
})();
