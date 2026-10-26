/* Panel CRM — Cobros manuales: facturas por cobrar que se envían al cliente para que pague */
(function () {
  'use strict';
  var A = window.AVA, el = A.el, sb = A.sb;

  // Formas de pago que se pueden ofrecer en una factura
  var FORMAS = [
    ['zelle', 'Zelle', 'al Zelle del negocio'],
    ['cashapp', 'Cash App', 'al $cashtag del negocio'],
    ['tarjeta', 'Tarjeta', 'enlace de pago con Square'],
    ['efectivo', 'Efectivo', 'en la oficina'],
    ['transferencia', 'Transferencia', 'bancaria'],
    ['cheque', 'Cheque', 'a nombre de AVA Multiservices']
  ];
  var NOMBRE = {}; FORMAS.forEach(function (f) { NOMBRE[f[0]] = f[1]; });
  var SITIO = /avamultiservices\.com$/.test(location.hostname) ? location.origin : 'https://avamultiservices.com';
  A.urlFactura = function (f) { return (location.hostname === '192.0.2.2' ? location.origin : SITIO) + '/factura/?t=' + f.token; };
  function negocio() { return A.recordar('ajustes_negocio', function () { return sb.from('ajustes').select('valor').eq('clave', 'negocio').maybeSingle().then(function (r) { return (r.data && r.data.valor) || {}; }); }); }
  function hoyMas(d) { var x = new Date(); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); }
  function vencida(f) { return f.estado === 'pendiente' && f.vence && f.vence < A.hoyISO(); }
  function mensaje(f, c) {
    return 'Hola ' + ((c && c.nombre) || '') + ', te envío la factura #' + f.numero + ' por ' + A.dinero(f.monto) + ' (' + f.concepto + ')' +
      (f.vence ? ', con vencimiento el ' + A.fecha(f.vence) : '') + '. Aquí puedes verla y ver cómo pagar: ' + A.urlFactura(f);
  }
  A.enviarFactura = function (f, c) {
    if (c && c.telefono) window.open(A.wa(c.telefono, mensaje(f, c)), '_blank', 'noopener');
    else { try { navigator.clipboard.writeText(A.urlFactura(f)); } catch (_) { /* */ } A.toast('El cliente no tiene teléfono: se copió el enlace de la factura.'); }
  };

  /* ---------- Crear un cobro ---------- */
  A.nuevoCobro = async function (base, alGuardar) {
    base = base || {};
    var res = await Promise.all([A.clientesBasicos(base.cliente_id), A.integraciones(), negocio()]);
    var clientes = res[0], integ = res[1], neg = res[2];
    if (!clientes.length) { A.toast('Primero crea un cliente.', 'error'); return; }
    var checks = el('div', { class: 'check-grid' });
    FORMAS.forEach(function (f) {
      var falta = f[0] === 'tarjeta' && !integ.pagos ? 'Conecta Square en Ajustes para usarla' : f[0] === 'zelle' && !neg.zelle ? 'Pon el Zelle del negocio en Ajustes' : f[0] === 'cashapp' && !neg.cashapp ? 'Pon el $cashtag en Ajustes' : '';
      var inp = el('input', { type: 'checkbox', value: f[0], disabled: !!falta });
      inp.checked = !falta && (f[0] === 'zelle' || f[0] === 'efectivo');
      checks.appendChild(el('label', { class: 'check' + (falta ? ' off' : '') }, [inp, el('span', null, [f[1], el('small', { class: 'muted', style: 'display:block;font-size:11.5px', text: falta || (f[0] === 'zelle' ? neg.zelle : f[0] === 'cashapp' ? neg.cashapp : f[2]) })])]));
    });
    var m = A.modal({
      titulo: 'Nuevo cobro', ok: 'Crear factura',
      campos: [
        { k: 'cliente_id', label: 'Cliente', type: 'select', full: true, required: true, value: base.cliente_id || clientes[0].id, options: clientes.map(function (c) { return [c.id, A.nombreDe(c)]; }) },
        { k: 'caso_id', label: 'Caso / servicio (opcional)', type: 'select', full: true, options: [] },
        { k: 'concepto', label: 'Concepto', full: true, required: true, max: 300, placeholder: 'Ej.: Declaración de taxes 2025', value: base.concepto },
        { k: 'detalle', label: 'Detalle (opcional)', type: 'textarea', full: true, max: 2000, placeholder: 'Lo que incluye, cuotas, aclaraciones…' },
        { k: 'monto', label: 'Monto (USD)', type: 'number', required: true, min: '1', step: '0.01', value: base.monto },
        { k: 'vence', label: 'Pagar antes del', type: 'date', value: hoyMas(7) }
      ],
      extra: el('div', { class: 'field', style: 'margin-top:16px' }, [el('div', { class: 'field-legend', text: '¿Cómo puede pagar?' }), checks]),
      guardar: async function (d, aviso) {
        if (!(d.monto >= 1)) { A.msg(aviso, 'Escribe un monto de al menos $1.'); return false; }
        d.metodos = Array.prototype.map.call(checks.querySelectorAll('input:checked'), function (c) { return c.value; });
        if (!d.metodos.length) { A.msg(aviso, 'Elige al menos una forma de pago.'); return false; }
        var r = await sb.from('facturas').insert(d).select('*, clientes(id,nombre,apellidos,telefono,email)').single();
        if (r.error) { A.msg(aviso, 'No se pudo crear la factura.'); return false; }
        var f = r.data;
        // Con tarjeta se crea el enlace de Square y queda unido a la factura (al pagarlo, la factura se marca sola)
        if (d.metodos.indexOf('tarjeta') !== -1) {
          var s = await sb.functions.invoke('square-pago', { body: { tipo: 'monto', cliente_id: d.cliente_id, caso_id: d.caso_id, monto: Number(d.monto), descripcion: 'Factura #' + f.numero + ' · ' + d.concepto } });
          if (s.error) {
            var e = {}; try { e = await s.error.context.json(); } catch (_) { /* */ }
            A.toast((e.error || 'No se pudo crear el enlace de tarjeta.') + ' La factura se creó sin tarjeta.', 'error');
            f.metodos = d.metodos.filter(function (x) { return x !== 'tarjeta'; });
            await sb.from('facturas').update({ metodos: f.metodos.length ? f.metodos : ['efectivo'] }).eq('id', f.id);
          } else {
            var en = await sb.from('enlaces_pago').select('id').eq('url', s.data.url).maybeSingle();
            if (en.data) await sb.from('facturas').update({ enlace_id: en.data.id }).eq('id', f.id);
          }
        }
        A.toast('Factura #' + f.numero + ' creada.');
        if (alGuardar) alGuardar();
        setTimeout(function () { A.verCobro(f, alGuardar); }, 50);
      }
    });
    async function casosDe(cid) {
      var r = await sb.from('casos').select('id,servicio,titulo,estado').eq('cliente_id', cid).order('created_at', { ascending: false });
      m.inputs.caso_id.innerHTML = '';
      m.inputs.caso_id.appendChild(el('option', { value: '', text: 'Sin caso' }));
      (r.data || []).forEach(function (k) { m.inputs.caso_id.appendChild(el('option', { value: k.id, text: (k.titulo || A.SERVICIOS[k.servicio].label) + (k.estado !== 'activo' ? ' (' + k.estado + ')' : '') })); });
      if (base.caso_id) m.inputs.caso_id.value = base.caso_id;
    }
    m.inputs.cliente_id.addEventListener('change', function () { casosDe(this.value); });
    m.inputs.caso_id.addEventListener('change', function () {
      var t = this.options[this.selectedIndex];
      if (this.value && !m.inputs.concepto.value) m.inputs.concepto.value = t.text.replace(/ \(.*\)$/, '');
    });
    casosDe(m.inputs.cliente_id.value);
  };

  /* ---------- Ver un cobro (factura por pagar) ---------- */
  A.verCobro = async function (f0, alCambiar) {
    var hoja = el('div', { class: 'fac' }, [el('div', { class: 'muted', style: 'padding:40px 0;text-align:center', text: 'Cargando factura…' })]);
    var acciones = el('div', { class: 'fac-acc' });
    var bg = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Factura #' + f0.numero }, [
      el('div', { class: 'modal-card fac-card' }, [
        el('div', { class: 'modal-head' }, [el('h2', { text: 'Factura #' + f0.numero }), el('button', { class: 'x', type: 'button', 'aria-label': 'Cerrar', onclick: cerrar }, [A.icon('i-x', 'icon-sm')])]),
        el('div', { class: 'modal-body' }, [hoja]), acciones
      ])
    ]);
    function cerrar() { bg.remove(); document.removeEventListener('keydown', esc); }
    function esc(e) { if (e.key === 'Escape' && !document.querySelectorAll('.modal')[1]) cerrar(); }
    document.addEventListener('keydown', esc);
    bg.addEventListener('mousedown', function (e) { if (e.target === bg) cerrar(); });
    document.body.appendChild(bg);

    var res = await Promise.all([
      sb.from('facturas').select('*, clientes(id,nombre,apellidos,telefono,email), casos(id,servicio,titulo), enlaces_pago(url,estado), pagos(id,numero,token,monto,fecha,metodo)').eq('id', f0.id).maybeSingle(),
      negocio()
    ]);
    if (res[0].error || !res[0].data) { hoja.innerHTML = ''; hoja.appendChild(el('div', { class: 'alert warn', text: 'No se pudo cargar esta factura.' })); return; }
    var f = res[0].data, neg = res[1], c = f.clientes || {};
    var servicio = f.casos ? (f.casos.titulo || A.SERVICIOS[f.casos.servicio].label) : '';
    var est = f.estado === 'pagada' ? ['fac-ok', '✓ Pagada'] : f.estado === 'cancelada' ? ['fac-can', 'Cancelada'] : vencida(f) ? ['fac-ven', 'Vencida · por pagar'] : ['fac-pen', 'Por pagar'];
    hoja.innerHTML = '';
    hoja.appendChild(el('div', { class: 'fac-top' }, [
      el('div', null, [el('img', { src: '../assets/img/logo.svg', alt: 'AVA Multiservices', width: 85, height: 40 }), el('div', { class: 'fac-de', text: 'AVA Multiservices · Dallas, Texas' + (neg.telefono ? ' · ' + neg.telefono : '') })]),
      el('div', { class: 'fac-n' }, [el('span', { text: 'Factura' }), el('b', { text: '#' + f.numero }), el('span', { text: 'Emitida ' + A.fecha(f.created_at.slice(0, 10)) }), f.vence ? el('span', { text: 'Vence ' + A.fecha(f.vence) }) : null])
    ]));
    hoja.appendChild(el('div', { class: 'fac-para' }, [el('span', { text: 'Facturado a' }), el('b', { text: A.nombreDe(c) }),
      c.telefono || c.email ? el('div', { class: 'muted', text: [c.telefono ? String(c.telefono).replace(/^\+?1?(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3') : null, c.email].filter(Boolean).join(' · ') }) : null]));
    hoja.appendChild(el('div', { class: 'fac-tabla' }, [
      el('div', { class: 'fac-fila fac-cab' }, [el('span', { text: 'Concepto' }), el('span', { text: 'Monto' })]),
      el('div', { class: 'fac-fila' }, [el('span', null, [el('b', { text: f.concepto }), servicio && servicio !== f.concepto ? el('small', { text: servicio }) : null, f.detalle ? el('small', { class: 'fac-det', text: f.detalle }) : null]), el('b', { text: A.dinero(f.monto) })]),
      el('div', { class: 'fac-fila fac-total' }, [el('span', { text: f.estado === 'pagada' ? 'Total pagado' : 'Total a pagar' }), el('b', { text: A.dinero(f.monto) })])
    ]));
    hoja.appendChild(el('div', { class: 'fac-info' }, [el('span', { class: est[0], text: est[1] }),
      f.estado === 'pagada' && f.pagos ? el('span', { text: 'Pagada el ' + A.fecha(f.pagos.fecha) + ' · ' + (A.METODOS[f.pagos.metodo] || f.pagos.metodo) }) : null]));
    if (f.estado === 'pendiente') {
      var formas = el('div', { class: 'fac-formas' }, [el('div', { class: 'fac-formas-t', text: 'Cómo pagar' })]);
      f.metodos.forEach(function (k) {
        var t = k === 'zelle' ? 'Zelle a ' + (neg.zelle || '—') : k === 'cashapp' ? 'Cash App a ' + (neg.cashapp || '—') : k === 'tarjeta' ? (f.enlaces_pago && f.enlaces_pago.estado === 'pendiente' ? 'Tarjeta con el enlace de Square' : 'Tarjeta (sin enlace activo)') : k === 'efectivo' ? 'Efectivo en la oficina' : k === 'transferencia' ? 'Transferencia bancaria' : 'Cheque a nombre de AVA Multiservices';
        formas.appendChild(el('div', { class: 'fac-forma' }, [el('b', { text: NOMBRE[k] || k }), el('span', { class: 'muted', text: t })]));
      });
      hoja.appendChild(formas);
    }

    var url = A.urlFactura(f);
    var asunto = 'Factura #' + f.numero + ' · AVA Multiservices';
    var cuerpo = 'Hola ' + (c.nombre || '') + ',\n\nTe envío la factura #' + f.numero + ' por ' + A.dinero(f.monto) + ' (' + f.concepto + ')' + (f.vence ? ', con vencimiento el ' + A.fecha(f.vence) : '') + '.\nAquí puedes verla y ver cómo pagar:\n' + url + '\n\nAVA Multiservices';
    if (f.estado === 'pendiente') {
      acciones.appendChild(el('button', { class: 'btn btn-dark btn-sm', type: 'button', onclick: function () { A.enviarFactura(f, c); } }, [A.icon('i-whatsapp', 'icon-sm'), el('span', { text: vencida(f) ? 'Recordar por WhatsApp' : 'Enviar por WhatsApp' })]));
      if (c.email) acciones.appendChild(el('a', { class: 'btn btn-ghost btn-sm', href: 'mailto:' + encodeURIComponent(c.email) + '?subject=' + encodeURIComponent(asunto) + '&body=' + encodeURIComponent(cuerpo) }, [A.icon('i-mail', 'icon-sm'), el('span', { text: 'Enviar por correo' })]));
      acciones.appendChild(el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: function () { navigator.clipboard.writeText(url).then(function () { A.toast('Enlace de la factura copiado.'); }, function () { A.toast('No se pudo copiar.', 'error'); }); } }, [el('span', { text: 'Copiar enlace' })]));
      acciones.appendChild(el('a', { class: 'btn btn-ghost btn-sm', href: url, target: '_blank', rel: 'noopener', title: 'Así la verá el cliente' }, [el('span', { text: 'Ver como cliente' })]));
      acciones.appendChild(el('button', { class: 'btn btn-sm btn-ok', type: 'button', onclick: function () { marcarPagada(f, function () { cerrar(); if (alCambiar) alCambiar(); }); } }, [A.icon('i-check', 'icon-sm'), el('span', { text: 'Marcar como pagada' })]));
      acciones.appendChild(el('button', { class: 'link-btn danger fac-editar', type: 'button', text: 'Cancelar cobro', onclick: async function () {
        if (!confirm('¿Cancelar la factura #' + f.numero + '? El enlace dejará de funcionar para el cliente.')) return;
        var u = await sb.from('facturas').update({ estado: 'cancelada' }).eq('id', f.id);
        if (u.error) { A.toast('No se pudo cancelar.', 'error'); return; }
        if (f.enlace_id && f.enlaces_pago && f.enlaces_pago.estado === 'pendiente') await sb.from('enlaces_pago').update({ estado: 'cancelado' }).eq('id', f.enlace_id);
        A.toast('Cobro cancelado.'); cerrar(); if (alCambiar) alCambiar();
      } }));
    } else if (f.estado === 'pagada' && f.pagos) {
      acciones.appendChild(el('button', { class: 'btn btn-dark btn-sm', type: 'button', onclick: function () { A.enviarRecibo(f.pagos, c); } }, [A.icon('i-whatsapp', 'icon-sm'), el('span', { text: 'Enviar comprobante de pago' })]));
      acciones.appendChild(el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: function () { cerrar(); A.verFactura(f.pagos); } }, [el('span', { text: 'Ver el pago' })]));
    }
  };

  /* ---------- Marcar como pagada: registra el pago con el mismo número de factura ---------- */
  function marcarPagada(f, alTerminar) {
    var opciones = Object.keys(A.METODOS).map(function (k) { return [k, A.METODOS[k]]; });
    A.modal({
      titulo: 'Registrar el pago de la factura #' + f.numero, ok: 'Registrar pago',
      campos: [
        { k: 'monto', label: 'Monto recibido (USD)', type: 'number', required: true, min: '0.01', step: '0.01', value: Number(f.monto).toFixed(2) },
        { k: 'fecha', label: 'Fecha', type: 'date', value: A.hoyISO() },
        { k: 'metodo', label: '¿Cómo pagó?', type: 'select', value: A.METODOS[f.metodos[0]] ? f.metodos[0] : 'zelle', options: opciones }
      ],
      guardar: async function (d, aviso) {
        if (!(d.monto > 0)) { A.msg(aviso, 'Escribe el monto recibido.'); return false; }
        var p = await sb.from('pagos').insert({ numero: f.numero, cliente_id: f.cliente_id, caso_id: f.caso_id, monto: d.monto, fecha: d.fecha || A.hoyISO(), metodo: d.metodo, nota: f.concepto })
          .select('id,numero,token,monto,cliente_id,fecha,metodo').single();
        if (p.error) { A.msg(aviso, 'No se pudo registrar el pago.'); return false; }
        await sb.from('facturas').update({ estado: 'pagada', pago_id: p.data.id, pagada_at: new Date().toISOString() }).eq('id', f.id);
        if (f.enlace_id && f.enlaces_pago && f.enlaces_pago.estado === 'pendiente') await sb.from('enlaces_pago').update({ estado: 'cancelado' }).eq('id', f.enlace_id);
        A.toast('Factura #' + f.numero + ' pagada · ' + A.dinero(d.monto) + '.', 'ok');
        var c = f.clientes || {};
        if (c.telefono && confirm('Pago registrado. ¿Enviar el comprobante a ' + (c.nombre || 'el cliente') + ' por WhatsApp?')) A.enviarRecibo(p.data, c);
        alTerminar();
      }
    });
  }

  /* ---------- Lista de cobros enviados que esperan pago (en Cobros) ---------- */
  A.pintarCobrosPendientes = async function (caja, alCambiar) {
    var r = await sb.from('facturas').select('*, clientes(id,nombre,apellidos,telefono)').eq('estado', 'pendiente').order('created_at', { ascending: false }).limit(100);
    caja.innerHTML = '';
    var lista = r.data || [];
    if (r.error || !lista.length) return 0;
    var total = lista.reduce(function (a, f) { return a + Number(f.monto); }, 0);
    var nVenc = lista.filter(vencida).length;
    var card = el('div', { class: 'card cb-enlaces cb-facturas' }, [el('div', { class: 'cb-en-h' }, [
      el('h3', { class: 't cb-t' }, [A.icon('i-receipt', 'icon-sm'), 'Facturas por cobrar · ' + lista.length + ' · ' + A.dinero(total) + (nVenc ? ' · ' + nVenc + ' vencida' + (nVenc === 1 ? '' : 's') : '')])
    ])]);
    lista.forEach(function (f) {
      var c = f.clientes || {};
      card.appendChild(el('div', { class: 'cb-en' + (vencida(f) ? ' vencida' : '') }, [
        el('span', { class: 'avatar', text: A.iniciales(A.nombreDe(c)) }),
        el('button', { class: 'cb-en-t link-fila', type: 'button', title: 'Ver la factura', onclick: function () { A.verCobro(f, alCambiar); } }, [el('b', { text: A.nombreDe(c) + ' · #' + f.numero }),
          el('div', { class: 'muted', text: f.concepto + ' · ' + (f.vence ? (vencida(f) ? 'venció el ' : 'vence el ') + A.fecha(f.vence) : 'enviada ' + A.hace(f.created_at)) + ' · ' + f.metodos.map(function (k) { return NOMBRE[k] || k; }).join(', ') })]),
        el('strong', { text: A.dinero(f.monto) }),
        el('div', { class: 'cb-en-a' }, [
          el('button', { class: 'mini-btn', type: 'button', text: 'Ver', onclick: function () { A.verCobro(f, alCambiar); } }),
          el('button', { class: 'mini-btn', type: 'button', text: vencida(f) ? 'Recordar' : 'Enviar', title: 'Enviar la factura por WhatsApp', onclick: function () { A.enviarFactura(f, c); } })
        ])
      ]));
    });
    caja.appendChild(card);
    return total;
  };
})();
