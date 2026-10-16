/* Panel CRM — Cobros: pagos, ingresos y saldos pendientes */
(function () {
  'use strict';
  var A = window.AVA, el = A.el, sb = A.sb;
  A.METODOS = { efectivo: 'Efectivo', zelle: 'Zelle', tarjeta: 'Tarjeta', cashapp: 'Cash App', transferencia: 'Transferencia', cheque: 'Cheque', otro: 'Otro' };
  var st = { mes: A.hoyISO().slice(0, 7) };

  /* Recibos: cada pago tiene un número y un enlace privado (avamultiservices.com/recibo/?t=…) */
  var SITIO = /avamultiservices\.com$/.test(location.hostname) ? location.origin : 'https://avamultiservices.com';
  A.urlRecibo = function (p) { return (location.hostname === '192.0.2.2' ? location.origin : SITIO) + '/recibo/?t=' + p.token; };
  A.enviarRecibo = function (p, cliente) {
    var texto = 'Hola ' + ((cliente && cliente.nombre) || '') + ', gracias por tu pago de ' + A.dinero(p.monto) + '. Aquí está tu recibo #' + p.numero + ': ' + A.urlRecibo(p);
    if (cliente && cliente.telefono) window.open(A.wa(cliente.telefono, texto), '_blank', 'noopener');
    else { try { navigator.clipboard.writeText(A.urlRecibo(p)); } catch (_) { /* */ } A.toast('Enlace del recibo copiado.'); }
  };
  A.botonesRecibo = function (p, cliente) {
    return el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' }, [
      el('a', { class: 'mini-btn', href: A.urlRecibo(p), target: '_blank', rel: 'noopener', text: 'Recibo #' + p.numero }),
      el('button', { class: 'mini-btn', type: 'button', text: 'Enviar', title: 'Enviar el recibo por WhatsApp', onclick: function (e) { e.stopPropagation(); A.enviarRecibo(p, cliente); } })
    ]);
  };
  var ui = {};

  /* Registrar un pago (base: {cliente_id, caso_id, monto}) */
  A.registrarPago = async function (base, alGuardar) {
    base = base || {};
    var clientes = (await sb.from('clientes').select('id,nombre,apellidos,telefono').order('nombre').limit(5000)).data || [];
    if (!clientes.length) { A.toast('Primero crea un cliente.', 'error'); return; }
    var campos = [
      { k: 'cliente_id', label: 'Cliente', type: 'select', full: true, required: true, value: base.cliente_id || clientes[0].id, options: clientes.map(function (c) { return [c.id, A.nombreDe(c)]; }) },
      { k: 'caso_id', label: 'Caso / servicio', type: 'select', full: true, options: [] },
      { k: 'monto', label: 'Monto (USD)', type: 'number', required: true, min: '0.01', step: '0.01', value: base.monto != null ? base.monto.toFixed ? base.monto.toFixed(2) : base.monto : null },
      { k: 'fecha', label: 'Fecha', type: 'date', value: A.hoyISO() },
      { k: 'metodo', label: 'Método', type: 'select', value: 'zelle', options: Object.keys(A.METODOS).map(function (k) { return [k, A.METODOS[k]]; }) },
      { k: 'nota', label: 'Nota', max: 500, placeholder: 'Cuota 2 de 5' }
    ];
    var m = A.modal({
      titulo: 'Registrar pago', ok: 'Registrar', campos: campos,
      guardar: async function (d, aviso) {
        if (!(d.monto > 0)) { A.msg(aviso, 'Escribe un monto mayor que cero.'); return false; }
        var r = await sb.from('pagos').insert(d).select('id,numero,token,monto,cliente_id').single();
        if (r.error) { A.msg(aviso, 'No se pudo registrar el pago.'); return false; }
        A.toast('Pago de ' + A.dinero(d.monto) + ' registrado · recibo #' + r.data.numero + '.');
        var cl = clientes.filter(function (x) { return x.id === d.cliente_id; })[0];
        if (cl && cl.telefono && confirm('Pago registrado. ¿Enviar el recibo #' + r.data.numero + ' a ' + cl.nombre + ' por WhatsApp?')) A.enviarRecibo(r.data, cl);
        if (alGuardar) alGuardar();
      }
    });
    async function casosDe(cid, sel) {
      var r = await sb.from('casos').select('id,servicio,titulo,estado').eq('cliente_id', cid).order('created_at', { ascending: false });
      m.inputs.caso_id.innerHTML = '';
      m.inputs.caso_id.appendChild(el('option', { value: '', text: 'Sin caso específico' }));
      (r.data || []).forEach(function (k) { m.inputs.caso_id.appendChild(el('option', { value: k.id, text: (k.titulo || A.SERVICIOS[k.servicio].label) + (k.estado !== 'activo' ? ' (' + k.estado + ')' : '') })); });
      if (sel) m.inputs.caso_id.value = sel;
    }
    casosDe(m.inputs.cliente_id.value, base.caso_id);
    m.inputs.cliente_id.addEventListener('change', function () { casosDe(this.value); });
  };

  A.vista('cobros', {
    permiso: 'cobros',
    render: function (cont) {
      ui.stats = el('div', { class: 'stats' });
      ui.list = el('div', { class: 'list' });
      ui.saldos = el('div', { class: 'card', style: 'margin-top:20px' });
      var mes = el('input', { class: 'input', style: 'flex:0 0 220px', type: 'month', value: st.mes, 'aria-label': 'Mes', onchange: function () { st.mes = this.value || A.hoyISO().slice(0, 7); cargar(); } });
      cont.appendChild(A.cabecera('Finanzas', 'Cobros', 'e ingresos', [
        el('button', { class: 'btn btn-ghost btn-sm', onclick: exportar }, [A.icon('i-download'), el('span', { text: 'Exportar' })]),
        el('button', { class: 'btn btn-dark btn-sm', onclick: function () { A.registrarPago(null, cargar); } }, [A.icon('i-plus'), el('span', { text: 'Registrar pago' })])
      ]));
      cont.appendChild(ui.stats);
      cont.appendChild(el('div', { class: 'tools' }, [el('div', { class: 'muted', style: 'align-self:center' , text: 'Pagos del mes:' }), mes]));
      cont.appendChild(ui.list);
      cont.appendChild(ui.saldos);
      cargar();
    }
  });

  var pagosMes = [];
  async function cargar() {
    ui.list.innerHTML = '';
    ui.list.appendChild(el('div', { class: 'empty', text: 'Cargando…' }));
    var ini = st.mes + '-01';
    var fin = new Date(ini + 'T12:00:00'); fin.setMonth(fin.getMonth() + 1);
    var finISO = fin.toISOString().slice(0, 10);
    var ant = new Date(ini + 'T12:00:00'); ant.setMonth(ant.getMonth() - 1);
    var antISO = ant.toISOString().slice(0, 10);
    var res = await Promise.all([
      sb.from('pagos').select('*, clientes(id,nombre,apellidos,telefono), casos(id,servicio,titulo)').gte('fecha', ini).lt('fecha', finISO).order('fecha', { ascending: false }),
      sb.from('pagos').select('monto').gte('fecha', antISO).lt('fecha', ini),
      sb.from('casos').select('id,precio,servicio,titulo,estado,cliente_id, clientes(id,nombre,apellidos), pagos(monto)').neq('estado', 'cancelado').not('precio', 'is', null)
    ]);
    if (res[0].error) { ui.list.innerHTML = ''; ui.list.appendChild(el('div', { class: 'empty', text: 'No se pudieron cargar los pagos.' })); return; }
    pagosMes = res[0].data || [];
    var suma = function (l) { return l.reduce(function (a, p) { return a + Number(p.monto); }, 0); };
    var saldos = (res[2].data || []).map(function (k) { return { k: k, saldo: Number(k.precio) - suma(k.pagos || []) }; }).filter(function (x) { return x.saldo > 0.009; })
      .sort(function (a, b) { return b.saldo - a.saldo; });
    var totalSaldo = saldos.reduce(function (a, x) { return a + x.saldo; }, 0);
    var nombreMes = new Date(ini + 'T12:00:00').toLocaleDateString('es-US', { month: 'long' });
    ui.stats.innerHTML = '';
    [[A.dinero(suma(pagosMes)) || '$0', 'Ingresos de ' + nombreMes], [A.dinero(suma(res[1].data || [])) || '$0', 'Mes anterior'],
      [A.dinero(totalSaldo) || '$0', 'Saldo por cobrar'], [pagosMes.length, 'Pagos en el mes']].forEach(function (s) {
      ui.stats.appendChild(el('div', { class: 'stat', style: 'cursor:default' }, [el('div', { class: 'k', text: s[0] }), el('div', { class: 'l', text: s[1] })]));
    });

    ui.list.innerHTML = '';
    ui.list.appendChild(el('div', { class: 'row pay-row head' }, [el('span', { text: 'Cliente' }), el('span', { class: 'hide-m', text: 'Servicio' }), el('span', { class: 'hide-m', text: 'Método' }), el('span', { class: 'hide-m', text: 'Fecha' }), el('span', { text: 'Monto' })]));
    if (!pagosMes.length) ui.list.appendChild(el('div', { class: 'empty' }, [el('b', { text: 'Sin pagos este mes' }), 'Registra cada pago para saber cuánto has cobrado y quién te debe.']));
    pagosMes.forEach(function (p) {
      ui.list.appendChild(el('button', { class: 'row pay-row', type: 'button', onclick: function () { editarPago(p); } }, [
        el('span', { class: 'who-cell' }, [el('span', { class: 'avatar', text: A.iniciales(A.nombreDe(p.clientes || {})) }), el('div', null, [el('div', { class: 'name', text: A.nombreDe(p.clientes || {}) }), el('div', { class: 'muted', text: '#' + p.numero + (p.nota ? ' · ' + p.nota : '') })])]),
        el('span', { class: 'muted hide-m', text: p.casos ? (p.casos.titulo || A.SERVICIOS[p.casos.servicio].corto) : '—' }),
        el('span', { class: 'muted hide-m', text: A.METODOS[p.metodo] }),
        el('span', { class: 'muted hide-m', text: A.fecha(p.fecha) }),
        el('span', { class: 'name', text: A.dinero(p.monto) })
      ]));
    });

    ui.saldos.innerHTML = '';
    ui.saldos.appendChild(el('h3', { class: 't', text: 'Saldos pendientes · ' + saldos.length }));
    if (!saldos.length) ui.saldos.appendChild(el('div', { class: 'muted', text: 'Nadie te debe. Los casos con precio y pagos incompletos aparecerán aquí.' }));
    saldos.forEach(function (x) {
      var pct = Math.max(0, Math.min(100, Math.round((1 - x.saldo / Number(x.k.precio)) * 100)));
      ui.saldos.appendChild(el('button', { class: 'saldo', type: 'button', onclick: function () { A.verCaso(x.k.id, cargar); } }, [
        el('div', null, [el('b', { text: A.nombreDe(x.k.clientes || {}) }), el('div', { class: 'muted', text: (x.k.titulo || A.SERVICIOS[x.k.servicio].label) + ' · pagado ' + pct + '%' }),
          el('div', { class: 'bar' }, [el('i', { style: 'width:' + pct + '%' })])]),
        el('b', { class: 'debe', text: A.dinero(x.saldo) })
      ]));
    });
  }

  function editarPago(p) {
    A.modal({
      titulo: 'Pago de ' + A.nombreDe(p.clientes || {}) + ' · #' + p.numero,
      extra: el('div', { style: 'margin-top:14px' }, [el('label', { class: 'muted', style: 'display:block;font-size:12px;margin-bottom:6px', text: 'Recibo para el cliente' }), A.botonesRecibo(p, p.clientes)]),
      campos: [
        { k: 'monto', label: 'Monto (USD)', type: 'number', required: true, min: '0.01', step: '0.01', value: p.monto },
        { k: 'fecha', label: 'Fecha', type: 'date', value: p.fecha },
        { k: 'metodo', label: 'Método', type: 'select', value: p.metodo, options: Object.keys(A.METODOS).map(function (k) { return [k, A.METODOS[k]]; }) },
        { k: 'nota', label: 'Nota', value: p.nota, max: 500 }
      ],
      guardar: async function (d, aviso) {
        var r = await sb.from('pagos').update(d).eq('id', p.id);
        if (r.error) { A.msg(aviso, 'No se pudo guardar.'); return false; }
        A.toast('Pago actualizado.'); cargar();
      },
      borrar: async function () {
        var r = await sb.from('pagos').delete().eq('id', p.id);
        if (r.error) { A.toast('No se pudo eliminar.', 'error'); return false; }
        A.toast('Pago eliminado.'); cargar();
      },
      borrarTexto: 'Eliminar pago'
    });
  }

  function exportar() {
    A.csv('pagos-' + st.mes, [
      ['Recibo', 'numero'], ['Fecha', 'fecha'], ['Cliente', function (p) { return A.nombreDe(p.clientes || {}); }],
      ['Servicio', function (p) { return p.casos ? (p.casos.titulo || A.SERVICIOS[p.casos.servicio].label) : ''; }],
      ['Método', function (p) { return A.METODOS[p.metodo]; }], ['Monto', 'monto'], ['Nota', 'nota']
    ], pagosMes);
  }
})();
