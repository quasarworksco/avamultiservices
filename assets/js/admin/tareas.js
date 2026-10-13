/* Panel CRM — Tareas y vencimientos */
(function () {
  'use strict';
  var A = window.AVA, el = A.el, sb = A.sb;
  var st = { quien: 'yo', hechas: false };
  var ui = {};

  A.contarTareas = async function () {
    var r = await sb.from('tareas').select('id', { count: 'exact', head: true }).eq('hecha', false).eq('asignada_a', A.yo().user_id).lte('fecha', A.hoyISO());
    var n = document.getElementById('count-tar');
    if (n) n.textContent = r.count ? r.count : '';
  };

  /* Fila de tarea con casilla para completarla */
  A.filaTarea = function (t, alCambiar, opciones) {
    var hoy = A.hoyISO();
    var chk = el('input', { type: 'checkbox', 'aria-label': 'Marcar como hecha' });
    chk.checked = t.hecha;
    chk.addEventListener('change', async function () {
      var u = await sb.from('tareas').update({ hecha: chk.checked, hecha_at: chk.checked ? new Date().toISOString() : null }).eq('id', t.id);
      if (u.error) { chk.checked = !chk.checked; A.toast('No se pudo actualizar.', 'error'); return; }
      t.hecha = chk.checked;
      fila.classList.toggle('done', chk.checked);
      A.contarTareas();
      if (chk.checked) A.toast('Tarea completada.');
      if (alCambiar) setTimeout(alCambiar, 350);
    });
    var tarde = !t.hecha && t.fecha && t.fecha < hoy;
    var meta = [];
    if (t.fecha) meta.push(el('span', { class: tarde ? 'late-txt' : '', text: t.fecha === hoy ? 'Hoy' : (tarde ? 'Venció ' : '') + A.fecha(t.fecha) }));
    if (opciones && opciones.cliente && t.clientes) meta.push(el('a', { href: '#/clientes/' + t.cliente_id, text: A.nombreDe(t.clientes) }));
    if (opciones && opciones.equipo && t.asignada_a && opciones.equipo[t.asignada_a]) meta.push(el('span', { text: opciones.equipo[t.asignada_a] }));
    var fila = el('div', { class: 'task' + (t.hecha ? ' done' : '') }, [
      el('label', { class: 'tick-box' }, [chk, el('span')]),
      el('div', { class: 'task-b' }, [
        el('button', { type: 'button', class: 'task-t', text: t.titulo, onclick: function () { A.editarTarea(t, alCambiar); } }),
        meta.length ? el('div', { class: 'task-m' }, meta) : null
      ])
    ]);
    return fila;
  };

  A.editarTarea = async function (t, alGuardar, base) {
    var nueva = !t;
    t = t || {};
    base = base || {};
    if (!A.puede('tareas') && nueva) return;
    var equipo = await A.equipo();
    var campos = [
      { k: 'titulo', label: 'Tarea', required: true, full: true, value: t.titulo, max: 200 },
      { k: 'fecha', label: 'Fecha límite', type: 'date', value: t.fecha || base.fecha },
      { k: 'asignada_a', label: 'Asignada a', type: 'select', value: t.asignada_a || base.asignada_a || A.yo().user_id, options: [['', 'Sin asignar']].concat(equipo.map(function (m) { return [m.user_id, m.nombre]; })) }
    ];
    if (A.puede('clientes') || A.puede('casos')) {
      var r = await sb.from('clientes').select('id,nombre,apellidos').order('nombre').limit(5000);
      campos.push({ k: 'cliente_id', label: 'Cliente (opcional)', type: 'select', full: true, value: t.cliente_id || base.cliente_id || '', options: [['', 'Ninguno']].concat((r.data || []).map(function (c) { return [c.id, A.nombreDe(c)]; })) });
    }
    campos.push({ k: 'detalle', label: 'Detalle', type: 'textarea', full: true, value: t.detalle, max: 2000 });
    A.modal({
      titulo: nueva ? 'Nueva tarea' : 'Editar tarea', ok: nueva ? 'Crear tarea' : 'Guardar', campos: campos,
      guardar: async function (d, aviso) {
        if (!A.puede('tareas')) { delete d.asignada_a; delete d.cliente_id; }
        var q = nueva ? sb.from('tareas').insert(Object.assign({ caso_id: base.caso_id || null }, d)) : sb.from('tareas').update(d).eq('id', t.id);
        var res = await q;
        if (res.error) { A.msg(aviso, 'No se pudo guardar la tarea.'); return false; }
        A.toast(nueva ? 'Tarea creada.' : 'Tarea guardada.');
        A.contarTareas();
        if (alGuardar) alGuardar();
      },
      borrar: nueva || !A.puede('tareas') ? null : async function () {
        var res = await sb.from('tareas').delete().eq('id', t.id);
        if (res.error) { A.toast('No se pudo eliminar.', 'error'); return false; }
        A.contarTareas();
        if (alGuardar) alGuardar();
      },
      borrarTexto: 'Eliminar tarea'
    });
  };

  A.vista('tareas', {
    permiso: null,
    render: async function (cont) {
      var equipo = await A.equipo();
      ui.eq = {};
      equipo.forEach(function (m) { ui.eq[m.user_id] = m.nombre; });
      var quien = el('select', { class: 'input', 'aria-label': 'De quién', onchange: function () { st.quien = this.value; cargar(); } },
        [el('option', { value: 'yo', text: 'Mis tareas' }), el('option', { value: '', text: 'Todo el equipo' })].concat(equipo.map(function (m) { return el('option', { value: m.user_id, text: m.nombre }); })));
      quien.value = st.quien;
      if (!A.puede('tareas')) quien.disabled = true;
      var hechas = el('input', { type: 'checkbox', onchange: function () { st.hechas = this.checked; cargar(); } });
      hechas.checked = st.hechas;
      ui.list = el('div', { class: 'task-groups' });
      cont.appendChild(A.cabecera('Organización', 'Tareas', 'y vencimientos', [
        A.puede('tareas') ? el('button', { class: 'btn btn-dark btn-sm', onclick: function () { A.editarTarea(null, cargar); } }, [A.icon('i-plus'), el('span', { text: 'Nueva tarea' })]) : null
      ]));
      cont.appendChild(el('div', { class: 'tools' }, [quien, el('label', { class: 'check', style: 'height:44px' }, [hechas, 'Mostrar completadas'])]));
      cont.appendChild(ui.list);
      cargar();
    }
  });

  async function cargar() {
    ui.list.innerHTML = '';
    ui.list.appendChild(el('div', { class: 'empty', text: 'Cargando tareas…' }));
    var q = sb.from('tareas').select('*, clientes(id,nombre,apellidos)').order('fecha', { nullsFirst: false }).order('created_at').limit(1000);
    if (!st.hechas) q = q.eq('hecha', false);
    var quien = st.quien === 'yo' || !A.puede('tareas') ? A.yo().user_id : st.quien;
    if (quien) q = q.eq('asignada_a', quien);
    var r = await q;
    ui.list.innerHTML = '';
    if (r.error) { ui.list.appendChild(el('div', { class: 'empty', text: 'No se pudieron cargar las tareas.' })); return; }
    var hoy = A.hoyISO();
    var sem = new Date(); sem.setDate(sem.getDate() + 7);
    var semISO = sem.toISOString().slice(0, 10);
    var grupos = [
      ['Vencidas', function (t) { return !t.hecha && t.fecha && t.fecha < hoy; }],
      ['Hoy', function (t) { return !t.hecha && t.fecha === hoy; }],
      ['Próximos 7 días', function (t) { return !t.hecha && t.fecha > hoy && t.fecha <= semISO; }],
      ['Más adelante', function (t) { return !t.hecha && t.fecha > semISO; }],
      ['Sin fecha', function (t) { return !t.hecha && !t.fecha; }],
      ['Completadas', function (t) { return t.hecha; }]
    ];
    var total = 0;
    grupos.forEach(function (g) {
      var lista = (r.data || []).filter(g[1]);
      if (!lista.length) return;
      total += lista.length;
      var card = el('div', { class: 'card' + (g[0] === 'Vencidas' ? ' card-alert' : '') }, [el('h3', { class: 't', text: g[0] + ' · ' + lista.length })]);
      var box = el('div', { class: 'tasks' });
      lista.forEach(function (t) { box.appendChild(A.filaTarea(t, cargar, { cliente: true, equipo: st.quien !== 'yo' ? ui.eq : null })); });
      card.appendChild(box);
      ui.list.appendChild(card);
    });
    if (!total) ui.list.appendChild(el('div', { class: 'empty' }, [el('b', { text: 'Todo al día' }), 'No hay tareas pendientes. Crea una para no olvidar nada.']));
    A.contarTareas();
  }
})();
