/* Panel CRM — Casos por servicio: tablero por etapas y editor */
(function () {
  'use strict';
  var A = window.AVA, el = A.el, sb = A.sb;
  var ESTADOS = { activo: 'Activo', completado: 'Completado', cancelado: 'Cancelado' };

  var casos = [];
  var st = { servicio: 'credito', resp: '', cancelados: false };
  var ui = {};

  function opcionesEtapa(select, servicio, actual) {
    select.innerHTML = '';
    A.SERVICIOS[servicio].etapas.forEach(function (e) { select.appendChild(el('option', { value: e, text: e })); });
    if (actual && A.SERVICIOS[servicio].etapas.indexOf(actual) !== -1) select.value = actual;
  }

  /* Editor de caso: caso existente o nuevo (base = {cliente_id, servicio}) */
  A.editarCaso = async function (caso, base, alGuardar) {
    var nuevo = !caso;
    caso = caso || {};
    base = base || {};
    var equipo = await A.equipo();
    var servicio = caso.servicio || base.servicio || 'credito';
    var campos = [];
    var clientes = null;
    if (nuevo && !base.cliente_id) {
      clientes = await A.clientesBasicos();
      if (!clientes.length) { A.toast('Primero crea un cliente.', 'error'); A.nuevoCliente(); return; }
      campos.push({ k: 'cliente_id', label: 'Cliente', type: 'select', full: true, required: true, options: clientes.map(function (c) { return [c.id, A.nombreDe(c)]; }) });
    }
    campos.push(
      { k: 'servicio', label: 'Servicio', type: 'select', value: servicio, options: A.serviciosVisibles().concat(A.SERVICIOS[servicio].oculto ? [servicio] : []).map(function (k) { return [k, A.SERVICIOS[k].label]; }) },
      { k: 'etapa', label: 'Etapa', type: 'select', options: [] },
      { k: 'titulo', label: 'Título (opcional)', full: true, value: caso.titulo, max: 160, placeholder: 'Ej.: Taxes 2025 personales' },
      { k: 'responsable', label: 'Responsable', type: 'select', value: caso.responsable || (nuevo ? A.yo().user_id : ''), options: [['', 'Sin asignar']].concat(equipo.map(function (m) { return [m.user_id, m.nombre]; })) },
      { k: 'estado', label: 'Estado', type: 'select', value: caso.estado || 'activo', options: Object.keys(ESTADOS).map(function (k) { return [k, ESTADOS[k]]; }) },
      { k: 'precio', label: 'Precio (USD)', type: 'number', value: caso.precio, min: '0', step: '0.01' },
      { k: 'fecha_inicio', label: 'Inicio', type: 'date', value: caso.fecha_inicio || A.hoyISO() },
      { k: 'fecha_entrega', label: 'Fecha de entrega', type: 'date', value: caso.fecha_entrega },
      { k: 'notas', label: 'Notas del caso', type: 'textarea', full: true, value: caso.notas }
    );
    var m = A.modal({
      titulo: nuevo ? 'Nuevo caso' : (caso.titulo || A.SERVICIOS[servicio].label), ok: nuevo ? 'Crear caso' : 'Guardar', campos: campos,
      guardar: async function (d, aviso) {
        if (base.cliente_id) d.cliente_id = base.cliente_id;
        if (d.estado !== 'cancelado' && A.esFinal(d.servicio, d.etapa)) d.estado = 'completado';
        var q = nuevo ? sb.from('casos').insert(d) : sb.from('casos').update(d).eq('id', caso.id);
        var res = await q;
        if (res.error) { A.msg(aviso, 'No se pudo guardar el caso.'); return false; }
        A.toast(nuevo ? 'Caso creado.' : 'Caso actualizado.');
        if (alGuardar) alGuardar();
      },
      borrar: nuevo ? null : async function () {
        var res = await sb.from('casos').delete().eq('id', caso.id);
        if (res.error) { A.toast('No se pudo eliminar.', 'error'); return false; }
        A.toast('Caso eliminado.');
        if (alGuardar) alGuardar();
      },
      borrarTexto: 'Eliminar caso'
    });
    opcionesEtapa(m.inputs.etapa, servicio, caso.etapa);
    m.inputs.servicio.addEventListener('change', function () { opcionesEtapa(m.inputs.etapa, this.value); });
    if (caso.cliente_id && caso.clientes) {
      m.aviso.insertAdjacentElement('afterend', el('a', { class: 'back', href: '#/clientes/' + caso.cliente_id, style: 'margin:0 0 10px', onclick: function () { m.cerrar(); } }, [A.icon('i-users', 'icon-sm'), 'Abrir ficha de ' + A.nombreDe(caso.clientes)]));
    }
  };

  /* ---------- Tablero ---------- */
  A.vista('casos', {
    permiso: 'casos|taxes',
    render: async function (cont) {
      if (!A.puede('casos') && ['taxes', 'plan_irs'].indexOf(st.servicio) === -1) st.servicio = 'taxes';
      var equipo = await A.equipo();
      ui.eq = {};
      equipo.forEach(function (m) { ui.eq[m.user_id] = m.nombre; });
      ui.tabs = el('div', { class: 'tabs', role: 'tablist' });
      ui.board = el('div', { class: 'board' });
      var resp = el('select', { class: 'input', 'aria-label': 'Responsable', onchange: function () { st.resp = this.value; pintar(); } },
        [el('option', { value: '', text: 'Todo el equipo' }), el('option', { value: 'yo', text: 'Mis casos' })].concat(equipo.map(function (m) { return el('option', { value: m.user_id, text: m.nombre }); })));
      resp.value = st.resp;
      var canc = el('input', { type: 'checkbox', onchange: function () { st.cancelados = this.checked; pintar(); } });
      canc.checked = st.cancelados;
      cont.appendChild(A.cabecera('Seguimiento', 'Casos', 'por etapa', [
        A.puede('casos') ? el('button', { class: 'btn btn-dark btn-sm', onclick: function () { A.editarCaso(null, { servicio: st.servicio }, cargar); } }, [A.icon('i-plus'), el('span', { text: 'Nuevo caso' })]) : null
      ]));
      cont.appendChild(ui.tabs);
      cont.appendChild(el('div', { class: 'tools' }, [resp, el('label', { class: 'check', style: 'height:44px' }, [canc, 'Mostrar cancelados'])]));
      cont.appendChild(ui.board);
      cargar();
    }
  });

  async function cargar() {
    if (!ui.board) return;
    ui.board.innerHTML = '';
    ui.board.appendChild(el('div', { class: 'empty', text: 'Cargando casos…' }));
    var r = await sb.from('casos').select('*, clientes(id,nombre,apellidos,telefono)').order('updated_at', { ascending: false }).limit(5000);
    if (r.error) { ui.board.innerHTML = ''; ui.board.appendChild(el('div', { class: 'empty', text: 'No se pudieron cargar los casos.' })); return; }
    casos = r.data || [];
    pintar();
  }

  function visibles() {
    var yo = A.yo().user_id;
    return casos.filter(function (k) {
      if (!st.cancelados && k.estado === 'cancelado') return false;
      if (st.resp === 'yo') return k.responsable === yo;
      return !st.resp || k.responsable === st.resp;
    });
  }

  function pintar() {
    var vis = visibles();
    ui.tabs.innerHTML = '';
    A.serviciosVisibles().filter(function (s) { return A.puede('casos') || s === 'taxes' || s === 'plan_irs'; }).forEach(function (s) {
      var n = vis.filter(function (k) { return k.servicio === s && k.estado === 'activo'; }).length;
      ui.tabs.appendChild(el('button', { class: 'tab' + (s === st.servicio ? ' on' : ''), 'data-svc': s, role: 'tab', 'aria-selected': s === st.servicio ? 'true' : 'false', onclick: function () { st.servicio = s; pintar(); } },
        [el('i'), A.SERVICIOS[s].corto, el('span', { class: 'n', text: n })]));
    });

    var board = ui.board;
    board.innerHTML = '';
    var hoy = A.hoyISO();
    A.SERVICIOS[st.servicio].etapas.forEach(function (etapa) {
      var lista = vis.filter(function (k) { return k.servicio === st.servicio && k.etapa === etapa; });
      var lane = el('div', { class: 'lane', 'data-svc': st.servicio }, [el('div', { class: 'lane-h' }, [etapa, el('span', { text: lista.length })])]);
      if (!lista.length) lane.appendChild(el('div', { class: 'lane-empty', text: 'Arrastra un caso aquí' }));
      lista.forEach(function (k, i) {
        var tarde = k.fecha_entrega && k.fecha_entrega < hoy && k.estado === 'activo';
        var card = el('button', { class: 'kcard', type: 'button', draggable: 'true', 'data-id': k.id, 'data-svc': k.servicio, style: 'animation-delay:' + Math.min(i * 40, 400) + 'ms', onclick: function () { A.verCaso(k.id, cargar); } }, [
          el('b', { text: A.nombreDe(k.clientes || {}) }),
          k.titulo ? el('div', { class: 'muted', text: k.titulo }) : null,
          (function () {
            var pr = A.progresoDocs(k.checklist);
            if (!pr.total || k.estado !== 'activo') return null;
            return el('div', { class: 'kc-docs' + (pr.revisar ? ' rev' : pr.listos === pr.total ? ' ok' : ''), title: pr.faltan.length ? 'Falta: ' + pr.faltan.join(', ') : 'Documentos completos' }, [
              A.icon(pr.listos === pr.total ? 'i-check' : 'i-file', 'icon-sm'), 'Docs ' + pr.listos + '/' + pr.total + (pr.revisar ? ' · ' + pr.revisar + ' por revisar' : '')]);
          })(),
          el('div', { class: 'meta' }, [
            el('span', { class: tarde ? 'late' : '', text: k.estado === 'cancelado' ? 'Cancelado' : (k.fecha_entrega ? (tarde ? 'Vencido · ' : 'Entrega ') + A.fecha(k.fecha_entrega) : (k.precio != null ? A.dinero(k.precio) : 'Sin fecha')) }),
            ui.eq[k.responsable] ? el('span', { class: 'avatar', title: ui.eq[k.responsable], text: A.iniciales(ui.eq[k.responsable]) }) : null
          ])
        ]);
        card.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', k.id); card.classList.add('dragging'); });
        card.addEventListener('dragend', function () { card.classList.remove('dragging'); });
        lane.appendChild(card);
      });
      lane.addEventListener('dragover', function (e) { e.preventDefault(); lane.classList.add('over'); });
      lane.addEventListener('dragleave', function () { lane.classList.remove('over'); });
      lane.addEventListener('drop', function (e) {
        e.preventDefault(); lane.classList.remove('over');
        mover(e.dataTransfer.getData('text/plain'), etapa);
      });
      board.appendChild(lane);
    });
  }

  async function mover(id, etapa) {
    var k = casos.filter(function (x) { return x.id === id; })[0];
    if (!k || k.etapa === etapa) return;
    var antes = { etapa: k.etapa, estado: k.estado };
    k.etapa = etapa;
    if (k.estado !== 'cancelado') k.estado = A.esFinal(k.servicio, etapa) ? 'completado' : 'activo';
    pintar();
    var r = await sb.from('casos').update({ etapa: k.etapa, estado: k.estado }).eq('id', id);
    if (r.error) { Object.assign(k, antes); pintar(); A.toast('No se pudo mover el caso.', 'error'); return; }
    A.toast(A.nombreDe(k.clientes || {}) + ' → ' + etapa);
  }
})();
