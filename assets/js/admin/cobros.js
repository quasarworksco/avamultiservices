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
    var texto = 'Hola ' + ((cliente && cliente.nombre) || '') + ', gracias por tu pago de ' + A.dinero(p.monto) + '. Aquí está tu factura #' + p.numero + ': ' + A.urlRecibo(p);
    if (cliente && cliente.telefono) window.open(A.wa(cliente.telefono, texto), '_blank', 'noopener');
    else { try { navigator.clipboard.writeText(A.urlRecibo(p)); } catch (_) { /* */ } A.toast('Enlace del recibo copiado.'); }
  };
  A.botonesRecibo = function (p, cliente) {
    return el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' }, [
      el('button', { class: 'mini-btn', type: 'button', text: 'Factura #' + p.numero, title: 'Ver la factura de este pago', onclick: function (e) { e.stopPropagation(); A.verFactura(p); } }),
      el('button', { class: 'mini-btn', type: 'button', text: 'Enviar', title: 'Enviar la factura por WhatsApp', onclick: function (e) { e.stopPropagation(); A.enviarRecibo(p, cliente); } })
    ]);
  };

  /* Factura de un pago: se ve en el panel y se envía al cliente (WhatsApp, correo o enlace) */
  A.verFactura = async function (p, o) {
    o = o || {};
    var hoja = el('div', { class: 'fac' }, [el('div', { class: 'muted', style: 'padding:40px 0;text-align:center', text: 'Cargando factura…' })]);
    var acciones = el('div', { class: 'fac-acc' });
    var bg = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Factura #' + p.numero }, [
      el('div', { class: 'modal-card fac-card' }, [
        el('div', { class: 'modal-head' }, [el('h2', { text: 'Factura #' + p.numero }), el('button', { class: 'x', type: 'button', 'aria-label': 'Cerrar', onclick: cerrar }, [A.icon('i-x', 'icon-sm')])]),
        el('div', { class: 'modal-body' }, [hoja]), acciones
      ])
    ]);
    function cerrar() { bg.remove(); document.removeEventListener('keydown', esc); }
    function esc(e) { if (e.key === 'Escape') cerrar(); }
    document.addEventListener('keydown', esc);
    bg.addEventListener('mousedown', function (e) { if (e.target === bg) cerrar(); });
    document.body.appendChild(bg);

    var res = await Promise.all([
      sb.from('pagos').select('*, clientes(id,nombre,apellidos,telefono,email), casos(id,servicio,titulo,precio)').eq('id', p.id).maybeSingle(),
      p.token ? sb.rpc('ver_recibo', { p_token: p.token }) : Promise.resolve({ data: null })
    ]);
    if (res[0].error || !res[0].data) { hoja.innerHTML = ''; hoja.appendChild(el('div', { class: 'alert warn', text: 'No se pudo cargar este pago.' })); return; }
    var x = res[0].data, r = res[1].data || {}, c = x.clientes || {};
    var servicio = x.casos ? (x.casos.titulo || A.SERVICIOS[x.casos.servicio].label) : '';
    var concepto = x.nota || servicio || 'Servicios profesionales';
    var saldo = r.precio != null ? Math.max(0, Number(r.precio) - Number(r.pagado || 0)) : null;
    hoja.innerHTML = '';
    hoja.appendChild(el('div', { class: 'fac-top' }, [
      el('div', null, [el('img', { src: '../assets/img/logo.svg', alt: 'AVA Multiservices', width: 85, height: 40 }), el('div', { class: 'fac-de', text: 'AVA Multiservices · Dallas, Texas' + (r.telefono ? ' · ' + r.telefono : '') })]),
      el('div', { class: 'fac-n' }, [el('span', { text: 'Factura' }), el('b', { text: '#' + x.numero }), el('span', { text: A.fecha(x.fecha) })])
    ]));
    hoja.appendChild(el('div', { class: 'fac-para' }, [el('span', { text: 'Facturado a' }), el('b', { text: A.nombreDe(c) }),
      c.telefono || c.email ? el('div', { class: 'muted', text: [c.telefono ? String(c.telefono).replace(/^\+?1?(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3') : null, c.email].filter(Boolean).join(' · ') }) : null]));
    hoja.appendChild(el('div', { class: 'fac-tabla' }, [
      el('div', { class: 'fac-fila fac-cab' }, [el('span', { text: 'Concepto' }), el('span', { text: 'Monto' })]),
      el('div', { class: 'fac-fila' }, [el('span', null, [el('b', { text: concepto }), servicio && servicio !== concepto ? el('small', { text: servicio }) : null]), el('b', { text: A.dinero(x.monto) })]),
      el('div', { class: 'fac-fila fac-total' }, [el('span', { text: 'Total pagado' }), el('b', { text: A.dinero(x.monto) })])
    ]));
    hoja.appendChild(el('div', { class: 'fac-info' }, [
      el('span', { class: 'fac-ok', text: '✓ Pagado' }),
      el('span', { text: 'Método: ' + (A.METODOS[x.metodo] || x.metodo) + (x.pasarela_id ? ' (Square)' : '') }),
      saldo != null ? el('span', { text: 'Saldo pendiente de este servicio: ' + A.dinero(saldo) }) : null
    ]));
    hoja.appendChild(el('p', { class: 'fac-pie', text: 'Gracias por tu confianza.' }));

    var url = A.urlRecibo(x);
    var asunto = 'Factura #' + x.numero + ' · AVA Multiservices';
    var cuerpo = 'Hola ' + (c.nombre || '') + ',\n\nGracias por tu pago de ' + A.dinero(x.monto) + ' (' + concepto + ').\nAquí puedes ver y descargar tu factura #' + x.numero + ':\n' + url + '\n\nAVA Multiservices';
    acciones.appendChild(el('button', { class: 'btn btn-dark btn-sm', type: 'button', title: c.telefono ? 'Abre WhatsApp con el mensaje listo' : 'El cliente no tiene teléfono: se copia el enlace', onclick: function () { A.enviarRecibo(x, c); } }, [A.icon('i-whatsapp', 'icon-sm'), el('span', { text: 'Enviar por WhatsApp' })]));
    if (c.email) acciones.appendChild(el('a', { class: 'btn btn-ghost btn-sm', href: 'mailto:' + encodeURIComponent(c.email) + '?subject=' + encodeURIComponent(asunto) + '&body=' + encodeURIComponent(cuerpo) }, [A.icon('i-mail', 'icon-sm'), el('span', { text: 'Enviar por correo' })]));
    acciones.appendChild(el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: function () { navigator.clipboard.writeText(url).then(function () { A.toast('Enlace de la factura copiado.'); }, function () { A.toast('No se pudo copiar.', 'error'); }); } }, [el('span', { text: 'Copiar enlace' })]));
    acciones.appendChild(el('a', { class: 'btn btn-ghost btn-sm', href: url, target: '_blank', rel: 'noopener', title: 'Abre la factura para descargarla en PDF o imprimirla' }, [el('span', { text: 'PDF / Imprimir' })]));
    if (o.editar) acciones.appendChild(el('button', { class: 'link-btn fac-editar', type: 'button', text: 'Editar pago', onclick: function () { cerrar(); o.editar(p); } }));
  };
  var ui = {};

  /* Registrar un pago (base: {cliente_id, caso_id, monto}) */
  A.registrarPago = async function (base, alGuardar) {
    base = base || {};
    var clientes = await A.clientesBasicos(base.cliente_id);
    if (!clientes.length) { A.toast('Primero crea un cliente.', 'error'); return; }
    var campos = [
      { k: 'cliente_id', label: 'Cliente', type: 'select', full: true, required: true, value: base.cliente_id || clientes[0].id, options: clientes.map(function (c) { return [c.id, A.nombreDe(c)]; }) },
      { k: 'caso_id', label: 'Caso / servicio', type: 'select', full: true, options: [] },
      { k: 'monto', label: 'Monto (USD)', type: 'number', required: true, min: '0.01', step: '0.01', value: base.monto != null ? base.monto.toFixed ? base.monto.toFixed(2) : base.monto : null },
      { k: 'fecha', label: 'Fecha', type: 'date', value: A.hoyISO() },
      { k: 'metodo', label: 'Método', type: 'select', value: 'zelle', options: Object.keys(A.METODOS).map(function (k) { return [k, A.METODOS[k]]; }) },
      { k: 'nota', label: 'Concepto (sale en la factura)', full: true, max: 500, placeholder: 'Ej.: Declaración de taxes 2025 · cuota 2 de 5' }
    ];
    // Si paga por cuotas, se dejan programados los siguientes cobros
    var cuotas = A.campoCuotas('Paga en cuotas: programar los siguientes cobros');
    var m = A.modal({
      titulo: 'Registrar pago', ok: 'Registrar', campos: campos, extra: cuotas.nodo,
      guardar: async function (d, aviso) {
        if (!(d.monto > 0)) { A.msg(aviso, 'Escribe un monto mayor que cero.'); return false; }
        var plan = cuotas.activo() ? cuotas.plan(d.fecha || A.hoyISO(), d.monto) : [];
        if (plan.length && plan[0].fecha <= A.hoyISO()) { A.msg(aviso, 'La próxima cuota quedaría para hoy o antes. Revisa la fecha del pago o cada cuánto paga.'); return false; }
        var r = await sb.from('pagos').insert(d).select('id,numero,token,monto,cliente_id').single();
        if (r.error) { A.msg(aviso, 'No se pudo registrar el pago.'); return false; }
        if (plan.length) {
          var caso = m.inputs.caso_id.value ? m.inputs.caso_id.options[m.inputs.caso_id.selectedIndex].text.replace(/ \(.*\)$/, '') : '';
          var concepto = (d.nota || caso || 'Pago').replace(/\s*·?\s*cuota\s+\d+\s+de\s+\d+\s*$/i, '');
          var okc = await A.programarCuotas({ cliente_id: d.cliente_id, caso_id: d.caso_id, concepto: concepto, metodos: await A.formasCuota() }, plan, 2, plan.length + 1);
          if (okc) A.toast(plan.length === 1 ? 'Próxima cuota programada para el ' + A.fecha(plan[0].fecha) + '.' : plan.length + ' cuotas programadas, la primera el ' + A.fecha(plan[0].fecha) + '.');
          else A.toast('El pago se registró, pero no se pudieron programar las cuotas.', 'error');
        }
        A.toast('Pago de ' + A.dinero(d.monto) + ' registrado · factura #' + r.data.numero + '.');
        var cl = clientes.filter(function (x) { return x.id === d.cliente_id; })[0];
        if (cl && cl.telefono && confirm('Pago registrado. ¿Enviar la factura #' + r.data.numero + ' a ' + cl.nombre + ' por WhatsApp?')) A.enviarRecibo(r.data, cl);
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
    cuotas.alCambiar = function () { cuotas.pintar(m.inputs.fecha.value || A.hoyISO(), m.inputs.monto.value); };
    m.inputs.monto.addEventListener('input', cuotas.alCambiar);
    m.inputs.fecha.addEventListener('input', cuotas.alCambiar);
  };

  /* Colores e íconos de cada método de pago */
  var MET_ICO = { efectivo: 'i-cash', zelle: 'i-zap', tarjeta: 'i-card', cashapp: 'i-dollar', transferencia: 'i-bank', cheque: 'i-receipt', otro: 'i-dots' };
  function icoMet(k, cls) { return A.icon(MET_ICO[k] || 'i-dots', cls || 'icon-sm'); }
  function chipMetodo(p) {
    return el('span', { class: 'mt mt-' + p.metodo }, [icoMet(p.metodo), A.METODOS[p.metodo] || p.metodo, p.pasarela_id ? el('em', { text: 'Square' }) : null]);
  }
  function pct(a, b) { return b > 0 ? Math.round(a / b * 100) : 0; }

  A.vista('cobros', {
    permiso: 'cobros',
    render: function (cont) {
      st.filtro = '';
      ui.stats = el('div', { class: 'cb-kpis' });
      ui.graf = el('div', { class: 'cb-grid' });
      ui.enlaces = el('div');
      ui.facturas = el('div');
      ui.filtros = el('div', { class: 'cb-filtros' });
      ui.list = el('div', { class: 'list cb-list' });
      ui.saldos = el('div', { class: 'card cb-saldos', style: 'margin-top:20px' });
      var mes = el('input', { class: 'input', style: 'flex:0 0 200px', type: 'month', value: st.mes, 'aria-label': 'Mes', onchange: function () { st.mes = this.value || A.hoyISO().slice(0, 7); st.filtro = ''; cargar(); } });
      cont.appendChild(A.cabecera('Finanzas', 'Cobros', 'e ingresos', [
        mes,
        el('button', { class: 'btn btn-ghost btn-sm', onclick: exportar }, [A.icon('i-download'), el('span', { text: 'Exportar' })]),
        el('button', { class: 'btn btn-ghost btn-sm', title: 'Registrar un pago que ya recibiste', onclick: function () { A.registrarPago(null, cargar); } }, [A.icon('i-plus'), el('span', { text: 'Registrar pago' })]),
        el('button', { class: 'btn btn-dark btn-sm', title: 'Crear una factura y enviársela al cliente para que pague', onclick: function () { A.nuevoCobro(null, cargar); } }, [A.icon('i-receipt'), el('span', { text: 'Nuevo cobro' })])
      ]));
      cont.appendChild(ui.stats);
      cont.appendChild(ui.graf);
      cont.appendChild(ui.facturas);
      cont.appendChild(ui.enlaces);
      cont.appendChild(el('h3', { class: 'cb-h', text: 'Pagos del mes' }));
      cont.appendChild(ui.filtros);
      cont.appendChild(ui.list);
      cont.appendChild(ui.saldos);
      cargar();
    }
  });

  var pagosMes = [], verificado = false;
  async function cargar() {
    ui.list.innerHTML = '';
    ui.list.appendChild(el('div', { class: 'empty', text: 'Cargando…' }));
    var ini = st.mes + '-01';
    var fin = new Date(ini + 'T12:00:00'); fin.setMonth(fin.getMonth() + 1);
    var finISO = fin.toISOString().slice(0, 10);
    var ant = new Date(ini + 'T12:00:00'); ant.setMonth(ant.getMonth() - 1);
    var antISO = ant.toISOString().slice(0, 10);
    var res = await Promise.all([
      sb.from('pagos').select('*, clientes(id,nombre,apellidos,telefono), casos(id,servicio,titulo)').gte('fecha', ini).lt('fecha', finISO).order('fecha', { ascending: false }).order('numero', { ascending: false }),
      sb.from('pagos').select('monto').gte('fecha', antISO).lt('fecha', ini),
      sb.from('casos').select('id,precio,servicio,titulo,estado,cliente_id, clientes(id,nombre,apellidos), pagos(monto)').neq('estado', 'cancelado').not('precio', 'is', null),
      sb.from('enlaces_pago').select('*, clientes(id,nombre,apellidos,telefono)').eq('estado', 'pendiente').order('created_at', { ascending: false }).limit(30)
    ]);
    if (res[0].error) { ui.list.innerHTML = ''; ui.list.appendChild(el('div', { class: 'empty', text: 'No se pudieron cargar los pagos.' })); return; }
    pagosMes = res[0].data || [];
    A.pintarCobrosPendientes(ui.facturas, cargar);
    var enlaces = res[3].data || [];
    // Si hay enlaces de tarjeta esperando pago, se le pregunta a Square una vez (por si su aviso no llegó)
    if (!verificado && enlaces.length) {
      verificado = true;
      sb.functions.invoke('square-pago', { body: { tipo: 'verificar' } }).then(function (v) {
        if (v.data && v.data.registrados) { A.toast(v.data.registrados === 1 ? 'Llegó un pago con tarjeta y quedó registrado.' : 'Llegaron ' + v.data.registrados + ' pagos con tarjeta y quedaron registrados.', 'ok'); cargar(); }
      });
    }
    var suma = function (l) { return l.reduce(function (a, p) { return a + Number(p.monto); }, 0); };
    var saldos = (res[2].data || []).map(function (k) { return { k: k, saldo: Number(k.precio) - suma(k.pagos || []) }; }).filter(function (x) { return x.saldo > 0.009; })
      .sort(function (a, b) { return b.saldo - a.saldo; });
    var totalSaldo = saldos.reduce(function (a, x) { return a + x.saldo; }, 0);
    var total = suma(pagosMes), anterior = suma(res[1].data || []);
    var nombreMes = new Date(ini + 'T12:00:00').toLocaleDateString('es-US', { month: 'long' });
    var nombreAnt = ant.toLocaleDateString('es-US', { month: 'long' });
    var tarjeta = pagosMes.filter(function (p) { return p.metodo === 'tarjeta' || p.pasarela_id; });

    /* Tarjetas de resumen */
    var dif = anterior > 0 ? Math.round((total - anterior) / anterior * 100) : null;
    ui.stats.innerHTML = '';
    [
      ['verde', 'i-wallet', A.dinero(total) || '$0', 'Cobrado en ' + nombreMes,
        dif == null ? (anterior === 0 && total > 0 ? 'Primer mes con cobros' : 'Sin cobros en ' + nombreAnt) : el('span', { class: dif >= 0 ? 'sube' : 'baja' }, [A.icon(dif >= 0 ? 'i-up' : 'i-down', 'icon-sm'), Math.abs(dif) + '% vs ' + nombreAnt + ' (' + (A.dinero(anterior) || '$0') + ')'])],
      ['ambar', 'i-hourglass', A.dinero(totalSaldo) || '$0', 'Por cobrar', saldos.length ? saldos.length + (saldos.length === 1 ? ' caso con saldo' : ' casos con saldo') : 'Nadie te debe'],
      ['azul', 'i-card', A.dinero(suma(tarjeta)) || '$0', 'Con tarjeta (Square)', tarjeta.length + (tarjeta.length === 1 ? ' pago' : ' pagos') + (enlaces.length ? ' · ' + enlaces.length + ' enlace' + (enlaces.length === 1 ? '' : 's') + ' esperando' : '')],
      ['morado', 'i-receipt', String(pagosMes.length), 'Pagos en ' + nombreMes, pagosMes.length ? 'Promedio ' + A.dinero(Math.round(total / pagosMes.length * 100) / 100) : 'Aún no hay pagos']
    ].forEach(function (s, i) {
      ui.stats.appendChild(el('div', { class: 'cb-kpi ' + s[0], style: 'animation-delay:' + i * 60 + 'ms' }, [
        el('span', { class: 'cb-ico' }, [A.icon(s[1])]),
        el('div', { class: 'k', text: s[2] }), el('div', { class: 'l', text: s[3] }), el('div', { class: 'd' }, [s[4]])
      ]));
    });

    /* ¿Cómo te pagaron? y ¿Por qué servicio? */
    var porMet = {}, porSvc = {};
    pagosMes.forEach(function (p) {
      var m = porMet[p.metodo] = porMet[p.metodo] || { n: 0, t: 0 }; m.n++; m.t += Number(p.monto);
      var s = p.casos ? p.casos.servicio : 'sin_caso';
      var v = porSvc[s] = porSvc[s] || { n: 0, t: 0 }; v.n++; v.t += Number(p.monto);
    });
    var mets = Object.keys(porMet).sort(function (a, b) { return porMet[b].t - porMet[a].t; });
    var svcs = Object.keys(porSvc).sort(function (a, b) { return porSvc[b].t - porSvc[a].t; });
    ui.graf.innerHTML = '';
    if (pagosMes.length) {
      var cMet = el('div', { class: 'card' }, [el('h3', { class: 't', text: '¿Cómo te pagaron?' }),
        el('div', { class: 'cb-stack' }, mets.map(function (k) { return el('i', { class: 'mt-' + k, style: 'flex:' + porMet[k].t, title: A.METODOS[k] + ' · ' + A.dinero(porMet[k].t) }); }))]);
      mets.forEach(function (k) {
        cMet.appendChild(el('button', { class: 'cb-leg mt-' + k + (st.filtro === k ? ' on' : ''), type: 'button', title: 'Ver solo los pagos con ' + A.METODOS[k], onclick: function () { st.filtro = st.filtro === k ? '' : k; pintarLista(); } }, [
          el('span', { class: 'cb-dot' }, [icoMet(k)]), el('b', { text: A.METODOS[k] }),
          el('span', { class: 'muted', text: porMet[k].n + (porMet[k].n === 1 ? ' pago' : ' pagos') }),
          el('span', { class: 'cb-pct', text: pct(porMet[k].t, total) + '%' }), el('strong', { text: A.dinero(porMet[k].t) })
        ]));
      });
      var cSvc = el('div', { class: 'card' }, [el('h3', { class: 't', text: '¿Por qué servicio?' })]);
      svcs.forEach(function (k) {
        var nombre = k === 'sin_caso' ? 'Sin caso' : (A.SERVICIOS[k] || {}).corto || k;
        cSvc.appendChild(el('div', { class: 'cb-svc', 'data-cb': k }, [
          el('div', { class: 'cb-svc-t' }, [el('b', { text: nombre }), el('span', { class: 'muted', text: porSvc[k].n + (porSvc[k].n === 1 ? ' pago · ' : ' pagos · ') + pct(porSvc[k].t, total) + '%' }), el('strong', { text: A.dinero(porSvc[k].t) })]),
          el('div', { class: 'cb-svc-b' }, [el('i', { style: 'width:' + Math.max(3, pct(porSvc[k].t, porSvc[svcs[0]].t)) + '%' })])
        ]));
      });
      ui.graf.appendChild(cMet);
      ui.graf.appendChild(cSvc);
    }

    /* Enlaces de pago con tarjeta que el cliente aún no paga */
    ui.enlaces.innerHTML = '';
    if (enlaces.length) {
      var cEn = el('div', { class: 'card cb-enlaces' }, [el('div', { class: 'cb-en-h' }, [
        el('h3', { class: 't cb-t' }, [A.icon('i-card', 'icon-sm'), 'Enlaces de tarjeta esperando pago · ' + enlaces.length + ' · ' + A.dinero(suma(enlaces))]),
        el('button', { class: 'mini-btn', type: 'button', text: 'Revisar en Square', title: 'Preguntar a Square si ya se pagaron', onclick: async function () {
          this.disabled = true;
          var v = await sb.functions.invoke('square-pago', { body: { tipo: 'verificar' } });
          this.disabled = false;
          if (v.error) { A.toast('No se pudo revisar con Square.', 'error'); return; }
          A.toast(v.data && v.data.registrados ? 'Se registraron ' + v.data.registrados + ' pago(s) con tarjeta.' : 'Todavía no hay pagos nuevos en Square.', v.data && v.data.registrados ? 'ok' : undefined);
          if (v.data && v.data.registrados) cargar();
        } })
      ])]);
      enlaces.forEach(function (e) {
        var c = e.clientes || {};
        cEn.appendChild(el('div', { class: 'cb-en' }, [
          el('span', { class: 'avatar', text: A.iniciales(A.nombreDe(c)) }),
          el('div', { class: 'cb-en-t' }, [el('b', { text: A.nombreDe(c) }), el('div', { class: 'muted', text: (e.concepto || 'Pago') + ' · enviado ' + A.hace(e.created_at) })]),
          el('strong', { text: A.dinero(e.monto) }),
          el('div', { class: 'cb-en-a' }, [
            el('button', { class: 'mini-btn', type: 'button', text: 'Copiar', onclick: function () { navigator.clipboard.writeText(e.url).then(function () { A.toast('Enlace copiado.'); }); } }),
            c.telefono ? el('button', { class: 'mini-btn', type: 'button', text: 'Recordar', title: 'Reenviar el enlace por WhatsApp', onclick: function () {
              window.open(A.wa(c.telefono, 'Hola ' + (c.nombre || '') + ', te recuerdo tu pago de ' + A.dinero(e.monto) + ' (' + (e.concepto || 'AVA Multiservices') + '). Puedes pagar con tarjeta aquí: ' + e.url), '_blank', 'noopener');
            } }) : null,
            el('button', { class: 'mini-btn', type: 'button', text: 'Cancelar', title: 'Marcar como cancelado en el CRM', onclick: async function () {
              if (!confirm('¿Marcar este enlace como cancelado?')) return;
              await sb.from('enlaces_pago').update({ estado: 'cancelado' }).eq('id', e.id); cargar();
            } })
          ])
        ]));
      });
      ui.enlaces.appendChild(cEn);
    }

    pintarLista();

    /* Saldos pendientes */
    ui.saldos.innerHTML = '';
    ui.saldos.appendChild(el('h3', { class: 't cb-t' }, [A.icon('i-hourglass', 'icon-sm'), 'Saldos pendientes · ' + saldos.length + (saldos.length ? ' · ' + A.dinero(totalSaldo) : '')]));
    if (!saldos.length) ui.saldos.appendChild(el('div', { class: 'muted', text: 'Nadie te debe. Los casos con precio y pagos incompletos aparecerán aquí.' }));
    saldos.forEach(function (x) {
      var p = Math.max(0, Math.min(100, Math.round((1 - x.saldo / Number(x.k.precio)) * 100)));
      var nivel = p >= 67 ? 'alto' : p >= 34 ? 'medio' : 'bajo';
      ui.saldos.appendChild(el('button', { class: 'saldo', type: 'button', onclick: function () { A.verCaso(x.k.id, cargar); } }, [
        el('div', null, [el('b', { text: A.nombreDe(x.k.clientes || {}) }),
          el('div', { class: 'muted', text: (x.k.titulo || A.SERVICIOS[x.k.servicio].label) + ' · pagado ' + A.dinero(Number(x.k.precio) - x.saldo) + ' de ' + A.dinero(x.k.precio) + ' (' + p + '%)' }),
          el('div', { class: 'bar cb-bar ' + nivel }, [el('i', { style: 'width:' + p + '%' })])]),
        el('b', { class: 'debe cb-debe', text: A.dinero(x.saldo) })
      ]));
    });
  }

  /* Lista de pagos del mes (con filtro por método) */
  function pintarLista() {
    var lista = st.filtro ? pagosMes.filter(function (p) { return p.metodo === st.filtro; }) : pagosMes;
    ui.graf.querySelectorAll('.cb-leg').forEach(function (b) { b.classList.toggle('on', b.classList.contains('mt-' + st.filtro)); });
    ui.filtros.innerHTML = '';
    if (pagosMes.length) {
      var mets = [];
      pagosMes.forEach(function (p) { if (mets.indexOf(p.metodo) === -1) mets.push(p.metodo); });
      ui.filtros.appendChild(el('button', { class: 'cb-f' + (!st.filtro ? ' on' : ''), type: 'button', onclick: function () { st.filtro = ''; pintarLista(); } }, ['Todos ', el('span', { text: pagosMes.length })]));
      mets.forEach(function (k) {
        var n = pagosMes.filter(function (p) { return p.metodo === k; }).length;
        ui.filtros.appendChild(el('button', { class: 'cb-f mt-' + k + (st.filtro === k ? ' on' : ''), type: 'button', onclick: function () { st.filtro = st.filtro === k ? '' : k; pintarLista(); } }, [icoMet(k), A.METODOS[k], el('span', { text: n })]));
      });
    }
    ui.list.innerHTML = '';
    ui.list.appendChild(el('div', { class: 'row pay-row head' }, [el('span', { text: 'Cliente' }), el('span', { class: 'hide-m', text: 'Servicio' }), el('span', { class: 'hide-m', text: 'Método' }), el('span', { class: 'hide-m', text: 'Factura' }), el('span', { text: 'Monto' })]));
    if (!pagosMes.length) ui.list.appendChild(el('div', { class: 'empty' }, [el('b', { text: 'Sin pagos este mes' }), 'Registra cada pago para saber cuánto has cobrado y quién te debe.']));
    lista.forEach(function (p) {
      var d = new Date(p.fecha + 'T12:00:00');
      ui.list.appendChild(el('button', { class: 'row pay-row', type: 'button', title: 'Ver la factura', onclick: function () { A.verFactura(p, { editar: editarPago }); } }, [
        el('span', { class: 'who-cell' }, [
          el('span', { class: 'cb-fecha', title: A.fecha(p.fecha) }, [el('b', { text: d.getDate() }), el('span', { text: d.toLocaleDateString('es-US', { month: 'short' }).replace('.', '') })]),
          el('div', { style: 'min-width:0' }, [el('div', { class: 'name', text: A.nombreDe(p.clientes || {}) }),
            el('div', { class: 'muted cb-sub' }, [el('span', { class: 'cb-m-movil' }, [chipMetodo(p)]), p.nota ? el('span', { text: p.nota }) : null])])
        ]),
        el('span', { class: 'hide-m' }, [p.casos ? el('span', { class: 'chip-s', 'data-svc': p.casos.servicio }, [el('i'), p.casos.titulo || A.SERVICIOS[p.casos.servicio].corto]) : el('span', { class: 'muted', text: '—' })]),
        el('span', { class: 'hide-m' }, [chipMetodo(p)]),
        el('span', { class: 'hide-m' }, [el('span', { class: 'cb-recibo', text: '#' + p.numero })]),
        el('span', { class: 'cb-monto', text: '+' + A.dinero(p.monto) })
      ]));
    });
    if (st.filtro && lista.length) ui.list.appendChild(el('div', { class: 'cb-total' }, [el('span', { text: 'Total con ' + A.METODOS[st.filtro] }), el('b', { text: A.dinero(lista.reduce(function (a, p) { return a + Number(p.monto); }, 0)) })]));
  }

  function editarPago(p) {
    A.modal({
      titulo: 'Pago de ' + A.nombreDe(p.clientes || {}) + ' · #' + p.numero,
      extra: el('div', { style: 'margin-top:14px' }, [el('label', { class: 'muted', style: 'display:block;font-size:12px;margin-bottom:6px', text: 'Factura para el cliente' }), A.botonesRecibo(p, p.clientes)]),
      campos: [
        { k: 'monto', label: 'Monto (USD)', type: 'number', required: true, min: '0.01', step: '0.01', value: p.monto },
        { k: 'fecha', label: 'Fecha', type: 'date', value: p.fecha },
        { k: 'metodo', label: 'Método', type: 'select', value: p.metodo, options: Object.keys(A.METODOS).map(function (k) { return [k, A.METODOS[k]]; }) },
        { k: 'nota', label: 'Concepto (sale en la factura)', full: true, value: p.nota, max: 500 }
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
      ['Factura', 'numero'], ['Fecha', 'fecha'], ['Cliente', function (p) { return A.nombreDe(p.clientes || {}); }],
      ['Servicio', function (p) { return p.casos ? (p.casos.titulo || A.SERVICIOS[p.casos.servicio].label) : ''; }],
      ['Método', function (p) { return A.METODOS[p.metodo] + (p.pasarela_id ? ' (Square)' : ''); }], ['Monto', 'monto'], ['Concepto', 'nota']
    ], pagosMes);
  }
})();
