/* Panel CRM — Pipelines: Pipeline I (del lead al cliente activo) y Pipeline II (del cliente activo al referido).
   Las tarjetas avanzan solas con lo que pasa en el CRM; aquí también se arrastran, se editan y se miden. */
(function () {
  'use strict';
  var A = window.AVA, el = A.el, sb = A.sb;

  var PIPES = {
    venta: { n: 'Pipeline I', sub: 'Del lead al cliente activo', etapas: [
      ['lead', 'Lead nuevo', 'Llega por anuncio, Instagram, WhatsApp o referido', 'i-inbox'],
      ['contactado', 'Contactado', 'Respondió el mensaje', 'i-message'],
      ['llamada', 'Llamada agendada', 'Eligió fecha y hora', 'i-phone'],
      ['analisis', 'Análisis y cotización', 'Ya se descargó su reporte', 'i-gauge'],
      ['contrato', 'Contrato firmado', 'Aceptó el paquete', 'i-edit'],
      ['documentos', 'Documentos completos', 'Mandó todos los documentos', 'i-file'],
      ['activo', 'Cliente activo', 'Caso cargado; pasa al Pipeline II al enviar la ronda 1', 'i-check']
    ] },
    credito: { n: 'Pipeline II', sub: 'Del cliente activo al referido', etapas: [
      ['ronda1', 'Ronda 1 enviada', 'Cartas y queja del CFPB listas', 'i-send'],
      ['rondas', 'Rondas 2+', 'Cada ~30 días', 'i-refresh'],
      ['monitor', 'Actualizar monitor', 'Toca ver el nuevo reporte', 'i-trending'],
      ['cobro', 'Cobro', 'Se terminó el trabajo de esa etapa', 'i-dollar'],
      ['meta', 'Meta alcanzada', 'Llegó a 720 o a su objetivo', 'i-party'],
      ['testimonio', 'Testimonio y siguiente servicio', 'Cliente satisfecho', 'i-sparkles']
    ] }
  };
  var OBJECIONES = { yo_te_aviso: 'Yo te aviso', tercero: 'Depende de un tercero', dinero: 'Tema dinero', otras_propuestas: 'Otras propuestas', no_califica: 'No califica', otra: 'Otra' };
  var TIPO_ALIADO = { realtor: 'Realtor', loan_officer: 'Loan officer', otro: 'Otro aliado' };
  var st = { tab: 'venta', buscar: '', cerradas: false, mes: A.hoyISO().slice(0, 7) };
  var ui = {};
  function nombreEtapa(p, e) { var x = PIPES[p].etapas.filter(function (y) { return y[0] === e; })[0]; return x ? x[1] : e; }
  function aliadosCache() { return A.recordar('aliados', function () { return sb.from('aliados').select('*').order('nombre').then(function (r) { return r.data || []; }); }); }

  A.vista('pipelines', {
    permiso: 'clientes|casos|mensajes',
    render: function (cont, partes) {
      if (partes[0] && (PIPES[partes[0]] || ['reporte', 'aliados', 'auto'].indexOf(partes[0]) !== -1)) st.tab = partes[0];
      ui.acts = el('div', { class: 'acts' });
      cont.appendChild(A.cabecera('Ventas', 'Pipelines', 'de crédito', [ui.acts]));
      ui.tabs = el('div', { class: 'tabs' });
      ui.body = el('div');
      cont.appendChild(ui.tabs); cont.appendChild(ui.body);
      pintarTabs();
    }
  });

  function pintarTabs() {
    ui.tabs.innerHTML = ''; ui.acts.innerHTML = '';
    [['venta', 'Pipeline I · Ventas'], ['credito', 'Pipeline II · Clientes'], ['reporte', 'Reporte'], ['aliados', 'Aliados'], ['auto', 'Automatizaciones']].forEach(function (t) {
      ui.tabs.appendChild(el('button', { type: 'button', class: 'tab' + (st.tab === t[0] ? ' on' : ''), onclick: function () { st.tab = t[0]; history.replaceState(null, '', '#/pipelines/' + t[0]); pintarTabs(); } }, [t[1]]));
    });
    ui.body.innerHTML = '';
    if (PIPES[st.tab]) tablero(ui.body, st.tab);
    else ({ reporte: reporte, aliados: aliados, auto: automatizaciones })[st.tab](ui.body);
  }

  /* ---------- Tablero ---------- */
  async function tablero(box, pipe) {
    var P = PIPES[pipe];
    var buscar = el('input', { class: 'input sm search', type: 'search', placeholder: 'Buscar por nombre o teléfono…', value: st.buscar, 'aria-label': 'Buscar' });
    var cerr = el('input', { type: 'checkbox' }); cerr.checked = st.cerradas;
    var resumen = el('div', { class: 'pl-resumen' });
    box.appendChild(el('div', { class: 'tools pl-tools' }, [buscar, el('label', { class: 'pl-toggle' }, [cerr, el('span', { text: 'Ver cerradas (ganadas y perdidas)' })]),
      pipe === 'venta' ? el('button', { class: 'btn btn-dark btn-sm', type: 'button', onclick: function () { nuevoLead(cargar); } }, [A.icon('i-plus'), el('span', { text: 'Nuevo lead' })]) : null]));
    box.appendChild(el('p', { class: 'muted pl-sub', text: P.n + ' · ' + P.sub + '. Las tarjetas avanzan solas; también puedes arrastrarlas.' }));
    box.appendChild(resumen);
    var tab = el('div', { class: 'pl-board' });
    box.appendChild(tab);
    var lista = [], equipo = await A.equipo();
    var eqNom = {}; equipo.forEach(function (m) { eqNom[m.user_id] = m.nombre || m.email; });

    async function cargar() {
      var q = sb.from('oportunidades').select('*').eq('pipeline', pipe).order('etapa_at', { ascending: false }).limit(1000);
      if (!st.cerradas) q = q.eq('estado', 'abierta');
      var r = await q;
      lista = r.data || [];
      pintar();
    }
    function pintar() {
      var t = st.buscar.trim().toLowerCase(), dig = t.replace(/\D/g, '');
      var vis = lista.filter(function (o) { return !t || (o.nombre || '').toLowerCase().indexOf(t) !== -1 || (dig.length >= 3 && (o.telefono || '').replace(/\D/g, '').indexOf(dig) !== -1); });
      tab.innerHTML = '';
      var abiertas = vis.filter(function (o) { return o.estado === 'abierta'; });
      var total = abiertas.reduce(function (a, o) { return a + Number(o.valor || 0); }, 0);
      resumen.innerHTML = '';
      resumen.appendChild(el('span', null, [el('b', { text: abiertas.length }), ' abiertas']));
      if (total) resumen.appendChild(el('span', null, [el('b', { text: A.dinero(total) }), ' en juego']));
      if (st.cerradas) { var g = vis.filter(function (o) { return o.estado === 'ganada'; }).length, p = vis.filter(function (o) { return o.estado === 'perdida'; }).length; resumen.appendChild(el('span', null, [el('b', { text: g }), ' ganadas · ', el('b', { text: p }), ' perdidas'])); }
      P.etapas.forEach(function (e, i) {
        var deEtapa = vis.filter(function (o) { return o.etapa === e[0]; });
        var suma = deEtapa.filter(function (o) { return o.estado === 'abierta'; }).reduce(function (a, o) { return a + Number(o.valor || 0); }, 0);
        var col = el('div', { class: 'pl-col', 'data-etapa': e[0] }, [
          el('div', { class: 'pl-col-h' }, [el('span', { class: 'pl-n', text: i + 1 }), el('div', null, [el('b', { text: e[1] }), el('small', { text: e[2] })]),
            el('span', { class: 'pl-cnt', text: deEtapa.length })]),
          suma ? el('div', { class: 'pl-suma', text: A.dinero(suma) }) : null
        ]);
        var cuerpo = el('div', { class: 'pl-cards' });
        deEtapa.forEach(function (o) { cuerpo.appendChild(tarjeta(o)); });
        if (!deEtapa.length) cuerpo.appendChild(el('div', { class: 'pl-vacio', text: 'Sin tarjetas' }));
        col.appendChild(cuerpo);
        // Soltar aquí: cambia la etapa
        col.addEventListener('dragover', function (ev) { ev.preventDefault(); col.classList.add('sobre'); });
        col.addEventListener('dragleave', function () { col.classList.remove('sobre'); });
        col.addEventListener('drop', function (ev) {
          ev.preventDefault(); col.classList.remove('sobre');
          var id = ev.dataTransfer.getData('text/plain'), o = lista.filter(function (x) { return x.id === id; })[0];
          if (o && o.etapa !== e[0]) mover(o, e[0]);
        });
        tab.appendChild(col);
      });
    }
    function tarjeta(o) {
      var dias = Math.floor((Date.now() - new Date(o.etapa_at).getTime()) / 864e5);
      var c = el('button', { type: 'button', class: 'pl-card' + (o.estado !== 'abierta' ? ' cerrada ' + o.estado : ''), draggable: o.estado === 'abierta' ? 'true' : null, onclick: function () { detalle(o, cargar); } }, [
        el('div', { class: 'pl-card-h' }, [el('b', { text: o.nombre || 'Sin nombre' }), o.valor ? el('span', { class: 'pl-valor', text: A.dinero(o.valor) }) : null]),
        el('div', { class: 'pl-chips' }, [
          o.servicio && A.SERVICIOS[o.servicio] ? el('span', { class: 'chip-s', 'data-svc': o.servicio }, [el('i'), A.SERVICIOS[o.servicio].corto]) : null,
          o.origen ? el('span', { class: 'pl-chip', text: A.ORIGENES[o.origen] || o.origen }) : null,
          o.objecion ? el('span', { class: 'pl-chip obj', text: OBJECIONES[o.objecion] }) : null,
          pipe === 'credito' && o.ciclo > 1 ? el('span', { class: 'pl-chip', text: 'Ronda ' + o.ciclo }) : null,
          o.estado === 'ganada' ? el('span', { class: 'pl-chip ok', text: 'Ganada' }) : o.estado === 'perdida' ? el('span', { class: 'pl-chip mal', text: 'Perdida' }) : null
        ]),
        el('div', { class: 'pl-card-f muted' }, [el('span', { text: dias === 0 ? 'Hoy en esta etapa' : dias + (dias === 1 ? ' día' : ' días') + ' en esta etapa' }),
          o.asignado_a && eqNom[o.asignado_a] ? el('span', { text: eqNom[o.asignado_a].split(' ')[0] }) : null])
      ]);
      if (dias >= 7 && o.estado === 'abierta' && ['activo', 'meta', 'testimonio'].indexOf(o.etapa) === -1) c.classList.add('quieta');
      c.addEventListener('dragstart', function (ev) { ev.dataTransfer.setData('text/plain', o.id); c.classList.add('arrastrando'); });
      c.addEventListener('dragend', function () { c.classList.remove('arrastrando'); });
      return c;
    }
    async function mover(o, etapa) {
      var antes = o.etapa; o.etapa = etapa; o.etapa_at = new Date().toISOString(); pintar();
      var u = await sb.from('oportunidades').update({ etapa: etapa }).eq('id', o.id);
      if (u.error) { o.etapa = antes; pintar(); A.toast('No se pudo mover la tarjeta.', 'error'); return; }
      A.toast((o.nombre || 'Tarjeta') + ' → ' + nombreEtapa(pipe, etapa));
    }
    var espera = null;
    buscar.addEventListener('input', function () { clearTimeout(espera); espera = setTimeout(function () { st.buscar = buscar.value; pintar(); }, 150); });
    cerr.addEventListener('change', function () { st.cerradas = cerr.checked; cargar(); });
    await cargar();
    // Se actualiza sola cuando algo cambia en la base de datos
    var canal = sb.channel('pl-' + pipe + '-' + Date.now()).on('postgres_changes', { event: '*', schema: 'public', table: 'oportunidades' }, function () {
      if (!document.body.contains(tab)) { sb.removeChannel(canal); return; }
      clearTimeout(espera); espera = setTimeout(cargar, 400);
    }).subscribe();
  }

  /* ---------- Detalle de una tarjeta ---------- */
  async function detalle(o, alCambiar) {
    var res = await Promise.all([A.equipo(), aliadosCache(), sb.from('cola_mensajes').select('texto,estado,created_at,enviado_at').like('clave_unica', 'op:' + o.id + '%').order('created_at', { ascending: false }).limit(20)]);
    var equipo = res[0], aliados = res[1], mensajes = res[2].data || [];
    var P = PIPES[o.pipeline];
    var f = {};
    function campo(k, label, nodo) { f[k] = nodo; return el('label', { class: 'fi-campo' }, [el('span', { text: label }), nodo]); }
    function inp(k, tipo) { var i = el('input', { class: 'input sm', type: tipo || 'text', maxlength: 200 }); i.value = o[k] != null ? o[k] : ''; return i; }
    function sel(k, ops, vacio) { var s = el('select', { class: 'input sm' }, (vacio ? [el('option', { value: '', text: vacio })] : []).concat(ops.map(function (x) { return el('option', { value: x[0], text: x[1] }); }))); s.value = o[k] || ''; return s; }
    var etapa = sel('etapa', P.etapas.map(function (e, i) { return [e[0], (i + 1) + '. ' + e[1]]; }));
    var cuerpo = [
      el('div', { class: 'fi-grid pl-det' }, [
        campo('etapa', 'Etapa', etapa),
        campo('nombre', 'Nombre', inp('nombre')), campo('telefono', 'Teléfono', inp('telefono', 'tel')), campo('email', 'Email', inp('email', 'email')),
        campo('servicio', 'Servicio', sel('servicio', A.serviciosVisibles().map(function (k) { return [k, A.SERVICIOS[k].label]; }), 'Sin definir')),
        campo('origen', 'Origen del lead', sel('origen', Object.keys(A.ORIGENES).map(function (k) { return [k, A.ORIGENES[k]]; }), 'Sin definir')),
        campo('aliado_id', 'Aliado que lo refirió', sel('aliado_id', aliados.map(function (a) { return [a.id, a.nombre + ' · ' + TIPO_ALIADO[a.tipo]]; }), 'Ninguno')),
        campo('valor', 'Valor de la cotización (USD)', inp('valor', 'number')),
        campo('objecion', 'Objeción', sel('objecion', Object.keys(OBJECIONES).map(function (k) { return [k, OBJECIONES[k]]; }), 'Ninguna')),
        campo('asignado_a', 'Responsable', sel('asignado_a', equipo.map(function (m) { return [m.user_id, m.nombre || m.email]; }), 'Sin asignar'))
      ]),
      el('label', { class: 'fi-campo', style: 'margin-top:12px' }, [el('span', { text: 'Notas' }), (f.notas = el('textarea', { class: 'input', rows: 3, maxlength: 4000 }))])
    ];
    f.notas.value = o.notas || '';
    f.valor.min = '0'; f.valor.step = '0.01';
    // Accesos rápidos
    var links = el('div', { class: 'pl-links' }, [
      o.conversacion_id ? el('a', { class: 'mini-btn', href: '#/bandeja/chats/' + o.conversacion_id, text: 'Abrir chat' }) : null,
      o.cliente_id ? el('a', { class: 'mini-btn', href: '#/clientes/' + o.cliente_id, text: 'Ficha del cliente' }) : null,
      o.caso_id ? el('button', { class: 'mini-btn', type: 'button', text: 'Abrir caso', onclick: function () { A.verCaso(o.caso_id); } }) : null,
      o.caso_id ? el('a', { class: 'mini-btn', href: '#/ficha/' + o.caso_id, text: 'Ficha del caso' }) : null,
      o.telefono ? el('a', { class: 'mini-btn', href: A.wa(o.telefono, ''), target: '_blank', rel: 'noopener', text: 'WhatsApp' }) : null
    ]);
    cuerpo.unshift(links);
    if (o.pipeline === 'credito' && o.etapa === 'testimonio' || o.pipeline === 'credito' && o.etapa === 'meta') {
      var sig = el('select', { class: 'input sm' }, [el('option', { value: '', text: 'Elegir servicio…' })].concat(A.serviciosVisibles().filter(function (k) { return k !== 'credito'; }).map(function (k) { return el('option', { value: k, text: A.SERVICIOS[k].label }); })));
      sig.value = o.siguiente_servicio || '';
      cuerpo.push(el('div', { class: 'pl-sig' }, [el('b', { text: 'Siguiente servicio de AVA' }), el('p', { class: 'muted', text: 'Le pone la etiqueta del servicio al cliente y abre un lead nuevo en el Pipeline I para ofrecérselo.' }),
        el('div', { style: 'display:flex;gap:8px' }, [sig, el('button', { class: 'btn btn-dark btn-sm', type: 'button', text: 'Ofrecer', onclick: function () { siguienteServicio(o, sig.value, alCambiar); } })])]));
    }
    if (mensajes.length) {
      cuerpo.push(el('div', { class: 'pl-msgs' }, [el('b', { text: 'Mensajes automáticos de esta tarjeta' })].concat(mensajes.map(function (m) {
        return el('div', { class: 'pl-msg' }, [el('span', { class: 'pill ' + (m.estado === 'enviado' ? 'completado' : m.estado === 'pendiente' ? 'pendiente' : 'cancelado'), text: m.estado === 'enviado' ? 'Enviado' : m.estado === 'pendiente' ? 'Por enviar' : m.estado }), el('p', { text: m.texto }), el('small', { class: 'muted', text: A.hace(m.created_at) })]);
      })).concat([el('a', { class: 'link-btn', href: '#/bandeja/cola', text: 'Ver «Por enviar»' })])));
    }
    var pie = [];
    if (o.estado === 'abierta') {
      if (!o.cliente_id) pie.push(el('button', { class: 'btn btn-ghost', type: 'button', onclick: function () { convertir(o, alCambiar); } }, [A.icon('i-user-plus'), el('span', { text: 'Convertir en cliente' })]));
      pie.push(el('button', { class: 'btn btn-ghost', type: 'button', onclick: function () { perder(o, f.objecion.value, alCambiar); } }, [A.icon('i-x'), el('span', { text: 'Marcar perdida' })]));
      if (o.pipeline === 'credito') pie.push(el('button', { class: 'btn btn-ghost', type: 'button', onclick: async function () {
        if (!confirm('¿Cerrar el proceso de ' + (o.nombre || 'este cliente') + ' como terminado con éxito?')) return;
        await sb.from('oportunidades').update({ estado: 'ganada' }).eq('id', o.id); A.cerrarDrawer(); A.toast('Proceso cerrado.'); alCambiar();
      } }, [A.icon('i-check'), el('span', { text: 'Cerrar como ganado' })]));
    } else {
      pie.push(el('button', { class: 'btn btn-ghost', type: 'button', onclick: async function () { await sb.from('oportunidades').update({ estado: 'abierta' }).eq('id', o.id); A.cerrarDrawer(); A.toast('Tarjeta reabierta.'); alCambiar(); } }, [A.icon('i-refresh'), el('span', { text: 'Reabrir' })]));
    }
    pie.push(el('button', { class: 'btn btn-dark', type: 'button', onclick: async function () {
      var d = {};
      ['etapa', 'nombre', 'telefono', 'email', 'servicio', 'origen', 'aliado_id', 'objecion', 'asignado_a', 'notas'].forEach(function (k) { d[k] = f[k].value.trim() || null; });
      d.etapa = d.etapa || o.etapa;
      d.valor = f.valor.value === '' ? null : Number(f.valor.value);
      if (d.valor != null && !(d.valor >= 0)) { A.toast('Revisa el valor de la cotización.', 'error'); return; }
      var u = await sb.from('oportunidades').update(d).eq('id', o.id);
      if (u.error) { A.toast('No se pudo guardar.', 'error'); return; }
      // El origen y el aliado también quedan en la ficha del cliente
      if (o.cliente_id && (d.origen || d.aliado_id)) {
        var cu = {}; if (d.aliado_id) cu.aliado_id = d.aliado_id; if (d.origen) cu.origen = d.origen;
        await sb.from('clientes').update(cu).eq('id', o.cliente_id);
      }
      A.cerrarDrawer(); A.toast('Guardado.'); alCambiar();
    } }, [el('span', { text: 'Guardar' })]));
    A.drawer({ titulo: o.nombre || 'Oportunidad', meta: P.n + ' · ' + nombreEtapa(o.pipeline, o.etapa) + (o.estado !== 'abierta' ? ' · ' + o.estado : ''), cuerpo: cuerpo, pie: [el('div', { class: 'row2 pl-pie' }, pie)] });
  }

  async function convertir(o, alCambiar) {
    var partes = String(o.nombre || '').trim().split(/\s+/);
    var d = { nombre: partes[0] || 'Cliente', apellidos: partes.slice(1).join(' ') || null, telefono: o.telefono, email: o.email, origen: o.origen && A.ORIGENES[o.origen] ? o.origen : 'otro', aliado_id: o.aliado_id };
    var r = await sb.from('clientes').insert(d).select('id').single();
    if (r.error) { A.toast('No se pudo crear el cliente.', 'error'); return; }
    await sb.from('oportunidades').update({ cliente_id: r.data.id }).eq('id', o.id);
    if (o.conversacion_id) await sb.from('conversaciones').update({ cliente_id: r.data.id, etapa: 'cliente' }).eq('id', o.conversacion_id);
    A.limpiarClientes(); A.cerrarDrawer(); A.toast('Cliente creado.', 'ok'); alCambiar();
  }
  function perder(o, objecion, alCambiar) {
    A.modal({
      titulo: 'Marcar como perdida', ok: 'Marcar perdida',
      campos: [{ k: 'objecion', label: '¿Por qué no arrancó?', type: 'select', value: objecion || 'yo_te_aviso', options: Object.keys(OBJECIONES).map(function (k) { return [k, OBJECIONES[k]]; }) }, { k: 'notas', label: 'Nota (opcional)', max: 300 }],
      guardar: async function (d) {
        var u = await sb.from('oportunidades').update({ estado: 'perdida', objecion: d.objecion, notas: d.notas ? ((o.notas ? o.notas + '\n' : '') + d.notas) : o.notas }).eq('id', o.id);
        if (u.error) { A.toast('No se pudo guardar.', 'error'); return false; }
        A.cerrarDrawer(); A.toast('Marcada como perdida: ' + OBJECIONES[d.objecion] + '.'); alCambiar();
      }
    });
  }
  async function siguienteServicio(o, srv, alCambiar) {
    if (!srv) { A.toast('Elige el servicio.', 'error'); return; }
    var etiqueta = A.SERVICIOS[srv].corto;
    if (o.cliente_id) {
      var c = await sb.from('clientes').select('etiquetas').eq('id', o.cliente_id).single();
      var et = (c.data && c.data.etiquetas) || [];
      if (et.indexOf(etiqueta) === -1 && et.length < 20) await sb.from('clientes').update({ etiquetas: et.concat([etiqueta]) }).eq('id', o.cliente_id);
    }
    await sb.from('oportunidades').update({ siguiente_servicio: srv, etapa: 'testimonio' }).eq('id', o.id);
    await sb.from('oportunidades').insert({ pipeline: 'venta', etapa: 'contactado', nombre: o.nombre, telefono: o.telefono, email: o.email, cliente_id: o.cliente_id, servicio: srv, origen: 'referido', aliado_id: o.aliado_id, asignado_a: o.asignado_a, notas: 'Cliente de crédito interesado en ' + A.SERVICIOS[srv].label + '.' });
    A.cerrarDrawer(); A.toast('Etiqueta «' + etiqueta + '» puesta y lead nuevo en el Pipeline I.', 'ok'); alCambiar();
  }

  function nuevoLead(alGuardar) {
    aliadosCache().then(function (aliados) {
      A.modal({
        titulo: 'Nuevo lead', ok: 'Crear',
        campos: [
          { k: 'nombre', label: 'Nombre', required: true, max: 160, full: true },
          { k: 'telefono', label: 'Teléfono', type: 'tel', max: 40 }, { k: 'email', label: 'Email', type: 'email' },
          { k: 'servicio', label: 'Servicio', type: 'select', value: 'credito', options: A.serviciosVisibles().map(function (k) { return [k, A.SERVICIOS[k].label]; }) },
          { k: 'origen', label: 'Origen', type: 'select', value: 'whatsapp', options: Object.keys(A.ORIGENES).map(function (k) { return [k, A.ORIGENES[k]]; }) },
          { k: 'aliado_id', label: 'Aliado que lo refirió', type: 'select', value: '', options: [['', 'Ninguno']].concat(aliados.map(function (a) { return [a.id, a.nombre]; })) },
          { k: 'valor', label: 'Valor estimado (USD)', type: 'number', min: '0', step: '0.01' }
        ],
        guardar: async function (d, aviso) {
          d.pipeline = 'venta'; d.etapa = 'lead'; if (!d.aliado_id) d.aliado_id = null;
          var r = await sb.from('oportunidades').insert(d);
          if (r.error) { A.msg(aviso, 'No se pudo crear el lead.'); return false; }
          A.toast('Lead creado.'); alGuardar();
        }
      });
    });
  }

  /* ---------- Reporte: por origen, por objeción y por aliado ---------- */
  async function reporte(box) {
    var mes = el('input', { class: 'input sm', type: 'month', value: st.mes, 'aria-label': 'Mes', style: 'flex:0 0 200px' });
    var cuerpo = el('div');
    box.appendChild(el('div', { class: 'tools' }, [mes, el('span', { class: 'muted', style: 'align-self:center', text: 'Leads que entraron en el mes y qué pasó con ellos.' })]));
    box.appendChild(cuerpo);
    mes.addEventListener('change', function () { st.mes = mes.value || A.hoyISO().slice(0, 7); cargar(); });
    async function cargar() {
      cuerpo.innerHTML = '';
      var ini = st.mes + '-01', fin = new Date(ini + 'T12:00:00'); fin.setMonth(fin.getMonth() + 1);
      var r = await Promise.all([sb.from('oportunidades').select('*').eq('pipeline', 'venta').gte('created_at', ini).lt('created_at', fin.toISOString().slice(0, 10)).limit(5000), aliadosCache()]);
      var ops = r[0].data || [], ali = {}; (r[1] || []).forEach(function (a) { ali[a.id] = a; });
      var cerro = function (o) { return o.estado === 'ganada' || ['contrato', 'documentos', 'activo'].indexOf(o.etapa) !== -1; };
      function tablaPor(clave, nombreDe, titulo) {
        var g = {};
        ops.forEach(function (o) { var k = o[clave] || '—'; var x = g[k] = g[k] || { n: 0, cerro: 0, perdida: 0, valor: 0, ganado: 0 }; x.n++; if (cerro(o)) { x.cerro++; x.ganado += Number(o.valor || 0); } if (o.estado === 'perdida') x.perdida++; x.valor += Number(o.valor || 0); });
        var filas = Object.keys(g).sort(function (a, b) { return g[b].n - g[a].n; });
        return el('div', { class: 'card', style: 'margin-top:14px' }, [el('h3', { class: 't', text: titulo }), filas.length ? el('div', { class: 'tbl-wrap' }, [el('table', { class: 'tbl' }, [
          el('thead', null, [el('tr', null, ['', 'Leads', 'Cerraron', '% cierre', 'Perdidos', 'Cotizado', 'Ganado'].map(function (h) { return el('th', { text: h }); }))]),
          el('tbody', null, filas.map(function (k) { var x = g[k]; return el('tr', null, [el('td', { text: k === '—' ? 'Sin dato' : nombreDe(k) }), el('td', { text: x.n }), el('td', { text: x.cerro }), el('td', { text: Math.round(x.cerro / x.n * 100) + '%' }), el('td', { text: x.perdida }), el('td', { text: A.dinero(x.valor) || '$0' }), el('td', { text: A.dinero(x.ganado) || '$0' })]); }))
        ])]) : el('div', { class: 'muted', text: 'Sin leads en este mes.' })]);
      }
      var total = ops.length, cerraron = ops.filter(cerro).length;
      cuerpo.appendChild(el('div', { class: 'cb-kpis', style: 'margin-top:14px' }, [
        ['azul', 'i-inbox', String(total), 'Leads del mes'], ['verde', 'i-check', String(cerraron), 'Firmaron contrato'], ['ambar', 'i-gauge', total ? Math.round(cerraron / total * 100) + '%' : '—', 'Cierre'],
        ['morado', 'i-dollar', A.dinero(ops.filter(cerro).reduce(function (a, o) { return a + Number(o.valor || 0); }, 0)) || '$0', 'Valor cerrado']
      ].map(function (s) { return el('div', { class: 'cb-kpi ' + s[0] }, [el('span', { class: 'cb-ico' }, [A.icon(s[1])]), el('div', { class: 'k', text: s[2] }), el('div', { class: 'l', text: s[3] })]); })));
      cuerpo.appendChild(tablaPor('origen', function (k) { return A.ORIGENES[k] || k; }, 'Por origen del lead'));
      var perdidas = ops.filter(function (o) { return o.objecion; });
      var gObj = {}; perdidas.forEach(function (o) { var x = gObj[o.objecion] = gObj[o.objecion] || { n: 0, valor: 0, abiertas: 0 }; x.n++; x.valor += Number(o.valor || 0); if (o.estado === 'abierta') x.abiertas++; });
      cuerpo.appendChild(el('div', { class: 'card', style: 'margin-top:14px' }, [el('h3', { class: 't', text: 'Por objeción · por qué no arrancan' }),
        Object.keys(gObj).length ? el('div', { class: 'pl-obj' }, Object.keys(gObj).sort(function (a, b) { return gObj[b].n - gObj[a].n; }).map(function (k) {
          return el('div', { class: 'pl-obj-i' }, [el('b', { text: OBJECIONES[k] }), el('span', { text: gObj[k].n + (gObj[k].n === 1 ? ' lead' : ' leads') + (gObj[k].abiertas ? ' · ' + gObj[k].abiertas + ' todavía abiertos' : '') }), el('strong', { text: A.dinero(gObj[k].valor) || '$0' })]);
        })) : el('div', { class: 'muted', text: 'Nadie tiene objeción anotada este mes. Anótala en la tarjeta (o al marcarla perdida) para ver aquí qué frena las ventas.' })]));
      cuerpo.appendChild(tablaPor('aliado_id', function (k) { return ali[k] ? ali[k].nombre : 'Aliado'; }, 'Por aliado que refirió'));
    }
    cargar();
  }

  /* ---------- Aliados: realtors y loan officers ---------- */
  async function aliados(box) {
    ui.acts.appendChild(el('button', { class: 'btn btn-dark btn-sm', type: 'button', onclick: function () { editarAliado(null, recargar); } }, [A.icon('i-plus'), el('span', { text: 'Nuevo aliado' })]));
    var lista = el('div', { class: 'pl-aliados' });
    box.appendChild(el('p', { class: 'muted pl-sub', text: 'Los realtors y loan officers que te mandan clientes. Elige el aliado en cada lead para medir cuántos cierran y mandarles el avance.' }));
    box.appendChild(lista);
    function recargar() { A.olvidar('aliados'); pintar(); }
    async function pintar() {
      var r = await Promise.all([aliadosCache(), sb.from('oportunidades').select('id,nombre,etapa,estado,pipeline,aliado_id').not('aliado_id', 'is', null).limit(5000)]);
      var als = r[0], ops = r[1].data || [];
      lista.innerHTML = '';
      if (!als.length) { lista.appendChild(el('div', { class: 'empty' }, [el('b', { text: 'Aún no hay aliados' }), 'Agrega a los realtors y loan officers con los que trabajas.'])); return; }
      als.forEach(function (a) {
        var suyos = ops.filter(function (o) { return o.aliado_id === a.id; });
        var activos = suyos.filter(function (o) { return o.pipeline === 'credito' || o.estado === 'ganada' || ['contrato', 'documentos', 'activo'].indexOf(o.etapa) !== -1; });
        lista.appendChild(el('div', { class: 'card pl-aliado' }, [
          el('div', { class: 'card-h' }, [el('div', null, [el('h3', { class: 't', text: a.nombre }), el('div', { class: 'muted', text: [TIPO_ALIADO[a.tipo], a.empresa].filter(Boolean).join(' · ') })]),
            el('button', { class: 'mini-btn', type: 'button', text: 'Editar', onclick: function () { editarAliado(a, recargar); } })]),
          el('div', { class: 'pl-al-n' }, [el('span', null, [el('b', { text: suyos.length }), ' referidos']), el('span', null, [el('b', { text: activos.length }), ' ya son clientes'])]),
          suyos.length ? el('ul', { class: 'pl-al-l' }, suyos.slice(0, 8).map(function (o) { return el('li', null, [o.nombre || 'Sin nombre', el('span', { class: 'muted', text: ' · ' + nombreEtapa(o.pipeline, o.etapa) })]); })) : null,
          a.telefono && suyos.length ? el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: function () {
            var txt = 'Hola ' + a.nombre.split(' ')[0] + ', te comparto el avance de los clientes que nos referiste en AVA Multiservices:\n' + suyos.map(function (o) { return '• ' + (o.nombre || 'Cliente') + ': ' + nombreEtapa(o.pipeline, o.etapa); }).join('\n') + '\n¡Gracias por tu confianza!';
            window.open(A.wa(a.telefono, txt), '_blank', 'noopener');
          } }, [A.icon('i-whatsapp', 'icon-sm'), el('span', { text: 'Enviar avance por WhatsApp' })]) : null
        ]));
      });
    }
    pintar();
  }
  function editarAliado(a, alGuardar) {
    A.modal({
      titulo: a ? 'Editar aliado' : 'Nuevo aliado', ok: 'Guardar',
      campos: [
        { k: 'nombre', label: 'Nombre', required: true, max: 120, full: true, value: a && a.nombre },
        { k: 'tipo', label: 'Tipo', type: 'select', value: a ? a.tipo : 'realtor', options: Object.keys(TIPO_ALIADO).map(function (k) { return [k, TIPO_ALIADO[k]]; }) },
        { k: 'empresa', label: 'Empresa', max: 120, value: a && a.empresa },
        { k: 'telefono', label: 'Teléfono', type: 'tel', max: 40, value: a && a.telefono }, { k: 'email', label: 'Email', type: 'email', value: a && a.email },
        { k: 'notas', label: 'Notas', type: 'textarea', full: true, max: 2000, value: a && a.notas }
      ],
      guardar: async function (d, aviso) {
        var r = a ? await sb.from('aliados').update(d).eq('id', a.id) : await sb.from('aliados').insert(d);
        if (r.error) { A.msg(aviso, 'No se pudo guardar.'); return false; }
        A.toast('Aliado guardado.'); alGuardar();
      },
      borrar: a ? async function () { var x = await sb.from('aliados').delete().eq('id', a.id); if (x.error) { A.toast('No se pudo eliminar.', 'error'); return false; } alGuardar(); } : null,
      borrarTexto: 'Eliminar aliado', borrarConfirm: '¿Eliminar este aliado? Sus referidos se quedan, sin aliado.'
    });
  }

  /* ---------- Automatizaciones: mensajes de cada etapa ---------- */
  async function automatizaciones(box) {
    var r = await sb.from('ajustes').select('valor').eq('clave', 'pipelines').maybeSingle();
    // Si no carga la configuración no se muestra nada editable (así nunca se guarda encima vacía)
    if (r.error || !r.data || !r.data.valor) { box.appendChild(el('div', { class: 'alert warn', style: 'margin-top:14px', text: 'No se pudo cargar la configuración de las automatizaciones. Recarga la página.' })); return; }
    var cfg = r.data.valor;
    var puede = A.puede('equipo');
    var integ = await A.integraciones();
    var guardando = el('span', { class: 'muted fi-estado', text: '' });
    var espera = null;
    function guardar() {
      if (!puede) return;
      clearTimeout(espera); guardando.textContent = 'Guardando…';
      espera = setTimeout(async function () {
        var u = await sb.from('ajustes').update({ valor: cfg }).eq('clave', 'pipelines');
        guardando.textContent = u.error ? 'No se pudo guardar' : 'Guardado ✓';
      }, 700);
    }
    var activo = el('input', { type: 'checkbox', disabled: !puede }); activo.checked = !!cfg.activo;
    activo.addEventListener('change', function () { cfg.activo = activo.checked; guardar(); });
    box.appendChild(el('div', { class: 'card', style: 'margin-top:14px' }, [
      el('div', { class: 'card-h' }, [el('h3', { class: 't', text: 'Automatizaciones de los pipelines' }), el('span', { class: 'switch' }, [activo, el('span')])]),
      el('p', { class: 'muted', text: 'Cada etapa puede mandar un mensaje al entrar y seguimientos si la tarjeta se queda quieta (días contados desde que llegó a la etapa). Los mensajes van a «Por enviar»' + (integ.whatsapp ? ' y se envían solos si tienes el envío automático encendido.' : '; cuando WhatsApp Business esté conectado se podrán enviar solos.') + ' Variables: {nombre} {servicio} {link_citas} {link_portal} {link_resena} {ronda}.' }),
      puede ? guardando : el('div', { class: 'alert warn', text: 'Solo la administradora puede cambiar estos mensajes.' })
    ]));
    ['venta', 'credito'].forEach(function (p) {
      var cfgP = cfg[p] = cfg[p] || {};
      var card = el('div', { class: 'card', style: 'margin-top:14px' }, [el('h3', { class: 't', text: PIPES[p].n + ' · ' + PIPES[p].sub })]);
      PIPES[p].etapas.forEach(function (e, i) {
        var c = cfgP[e[0]] = cfgP[e[0]] || {};
        c.entrada = c.entrada || { activo: false, mensaje: '' }; c.seguimiento = c.seguimiento || { activo: false, dias: [], mensaje: '' };
        function bloque(obj, titulo, conDias) {
          var t = el('input', { type: 'checkbox', disabled: !puede }); t.checked = !!obj.activo;
          var txt = el('textarea', { class: 'input', rows: 2, maxlength: 1000, disabled: !puede }); txt.value = obj.mensaje || '';
          t.addEventListener('change', function () { obj.activo = t.checked; guardar(); });
          txt.addEventListener('input', function () { obj.mensaje = txt.value; guardar(); });
          var hijos = [el('label', { class: 'pl-auto-t' }, [t, el('span', { text: titulo })])];
          if (conDias) {
            var dias = el('input', { class: 'input sm', placeholder: '2, 3, 7, 30', disabled: !puede, style: 'max-width:160px' }); dias.value = (obj.dias || []).join(', ');
            dias.addEventListener('input', function () { obj.dias = dias.value.split(/[^\d]+/).filter(Boolean).map(Number).filter(function (n) { return n >= 1 && n <= 60; }); guardar(); });
            hijos.push(el('label', { class: 'pl-auto-d' }, [el('span', { class: 'muted', text: 'Días:' }), dias]));
          }
          hijos.push(txt);
          return el('div', { class: 'pl-auto-b' }, hijos);
        }
        card.appendChild(el('div', { class: 'pl-auto' }, [el('div', { class: 'pl-auto-h' }, [el('span', { class: 'pl-n', text: i + 1 }), el('b', { text: e[1] }), el('small', { class: 'muted', text: e[2] })]),
          el('div', { class: 'pl-auto-g' }, [bloque(c.entrada, 'Mensaje al entrar a la etapa'), bloque(c.seguimiento, 'Seguimiento si se queda quieto', true)])]));
      });
      box.appendChild(card);
    });
    // Otros ajustes
    cfg.facturas = cfg.facturas || { activo: true, dias: [2, 3, 7, 30], mensaje: '' };
    function numero(clave, label, def) {
      var i = el('input', { class: 'input sm', type: 'number', min: '1', max: '900', disabled: !puede, style: 'max-width:110px' }); i.value = cfg[clave] || def;
      i.addEventListener('input', function () { cfg[clave] = Number(i.value) || def; guardar(); });
      return el('label', { class: 'pl-auto-d' }, [el('span', { text: label }), i]);
    }
    var fT = el('input', { type: 'checkbox', disabled: !puede }); fT.checked = !!cfg.facturas.activo;
    fT.addEventListener('change', function () { cfg.facturas.activo = fT.checked; guardar(); });
    var fD = el('input', { class: 'input sm', disabled: !puede, style: 'max-width:160px' }); fD.value = (cfg.facturas.dias || []).join(', ');
    fD.addEventListener('input', function () { cfg.facturas.dias = fD.value.split(/[^\d]+/).filter(Boolean).map(Number).filter(function (n) { return n >= 1 && n <= 60; }); guardar(); });
    var fM = el('textarea', { class: 'input', rows: 2, maxlength: 1000, disabled: !puede }); fM.value = cfg.facturas.mensaje || '';
    fM.addEventListener('input', function () { cfg.facturas.mensaje = fM.value; guardar(); });
    box.appendChild(el('div', { class: 'card', style: 'margin-top:14px' }, [el('h3', { class: 't', text: 'Cobros y reglas de avance' }),
      el('div', { class: 'pl-auto-b' }, [el('label', { class: 'pl-auto-t' }, [fT, el('span', { text: 'Recordatorios de facturas sin pagar' })]), el('label', { class: 'pl-auto-d' }, [el('span', { class: 'muted', text: 'Días:' }), fD]), fM,
        el('small', { class: 'muted', text: 'Variables: {nombre} {numero} {monto} {concepto} {link}' })]),
      el('div', { class: 'pl-reglas' }, [numero('monitor_dias', 'Días después de enviar una ronda para pasar a «Actualizar monitor»', 25), numero('nps_dias', 'Días en «Análisis y cotización» sin firmar para crear la tarea de llamada NPS', 7), numero('meta_puntaje', 'Puntaje meta si la ficha no tiene otro', 720)])
    ]));
  }
})();
