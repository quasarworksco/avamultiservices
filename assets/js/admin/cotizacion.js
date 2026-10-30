/* Panel CRM — Crédito: análisis y cotización para el cliente (con enlace privado) y quejas del CFPB por ronda */
(function () {
  'use strict';
  var A = window.AVA, el = A.el, sb = A.sb;
  var BUROS = [['transunion', 'TransUnion'], ['experian', 'Experian'], ['equifax', 'Equifax']];
  var SERVICIOS = ['Disputa de cuentas negativas', 'Eliminación de inquiries', 'Burós secundarios', 'Construcción de crédito', 'Tradeline AU', 'CreditStrong / Kikoff', 'Goodwill letter', 'Pay-for-delete', 'Validación de deuda (FDCPA)', 'Business credit (EIN)', 'Asesoría hipotecaria', 'Educación financiera'];
  var EST_COT = { enviada: ['pendiente', 'Enviada'], aceptada: ['completado', 'Aceptada'], rechazada: ['cancelado', 'Rechazada'], anulada: ['cancelado', 'Anulada'], borrador: ['pendiente', 'Borrador'] };
  var SITIO = /avamultiservices\.com$/.test(location.hostname) ? location.origin : 'https://avamultiservices.com';
  function urlCot(q) { return (location.hostname === '192.0.2.2' ? location.origin : SITIO) + '/analisis/?t=' + q.token; }
  function monto(v) { var n = Number(String(v || '').replace(/[^\d.]/g, '')); return isNaN(n) ? 0 : n; }
  function hoyMas(d) { var x = new Date(); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); }

  /* ---------- Sección en el caso de crédito ---------- */
  A.seccionCotizacion = async function (k, rep, recargar) {
    var r = await sb.from('cotizaciones').select('id,token,estado,precio,vence,created_at,aceptada_at,aceptada_nombre').eq('cliente_id', k.cliente_id).order('created_at', { ascending: false }).limit(5);
    var lista = r.data || [];
    var caja = el('div', { class: 'cot-box' }, [el('div', { class: 'cot-h' }, [el('div', null, [el('b', { text: 'Análisis y cotización' }),
      el('div', { class: 'muted', text: 'Arma el análisis del reporte con tu propuesta y mándale el enlace al cliente: lo ve en su celular y la acepta ahí mismo.' })]),
      el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: function () { editor(k, rep, recargar); } }, [A.icon('i-gauge', 'icon-sm'), el('span', { text: lista.length ? 'Nueva cotización' : 'Preparar' })])])]);
    lista.forEach(function (q) {
      var e = EST_COT[q.estado] || ['pendiente', q.estado];
      caja.appendChild(el('div', { class: 'cot-i' }, [
        el('div', null, [el('b', { text: (q.precio != null ? A.dinero(q.precio) : 'Sin precio') + ' · ' + A.fecha(q.created_at.slice(0, 10)) }),
          el('div', { class: 'muted', text: q.estado === 'aceptada' ? 'Aceptada por ' + (q.aceptada_nombre || 'el cliente') + ' el ' + A.fecha(q.aceptada_at.slice(0, 10)) : q.vence ? 'Válida hasta el ' + A.fecha(q.vence) : '' })]),
        el('span', { class: 'pill ' + e[0], text: e[1] }),
        el('div', { class: 'disp-act' }, [
          el('a', { class: 'mini-btn', href: urlCot(q), target: '_blank', rel: 'noopener', text: 'Ver' }),
          q.estado === 'enviada' ? el('button', { class: 'mini-btn', type: 'button', text: 'Enviar', onclick: function () { enviar(k, q); } }) : null,
          q.estado === 'enviada' ? el('button', { class: 'mini-btn', type: 'button', text: 'Anular', onclick: async function () {
            if (!confirm('¿Anular esta cotización? El enlace dejará de funcionar.')) return;
            await sb.from('cotizaciones').update({ estado: 'anulada' }).eq('id', q.id); recargar();
          } }) : null
        ])
      ]));
    });
    return caja;
  };

  // Resumen del reporte que va en la cotización (sin números de cuenta)
  function resumen(rep) {
    var porBuro = {};
    BUROS.forEach(function (b) {
      var negs = (rep.cuentas || []).filter(function (c) { return c.buros[b[0]] && c.buros[b[0]].negativa; });
      porBuro[b[0]] = { negativas: negs.length, saldo: negs.reduce(function (a, c) { return a + monto(c.buros[b[0]].saldo); }, 0), consultas: (rep.consultas || []).filter(function (q) { return q.buro === b[0]; }).length };
    });
    var cuentas = (rep.cuentas || []).filter(function (c) { return c.negativa; }).map(function (c) {
      var bs = BUROS.filter(function (b) { return c.buros[b[0]] && c.buros[b[0]].negativa; });
      var d = c.buros[bs[0] ? bs[0][0] : 'transunion'] || {};
      return { nombre: c.nombre, estado: d.estado_pago || d.estado || '', saldo: d.saldo || '', buros: bs.map(function (b) { return b[1]; }) };
    });
    return { puntajes: rep.puntajes || {}, fecha_reporte: rep.fecha_reporte || null, buros: porBuro, cuentas: cuentas, consultas: (rep.consultas || []).length };
  }

  async function editor(k, rep, recargar) {
    var res = await Promise.all([
      sb.from('fichas_credito').select('datos').eq('caso_id', k.id).maybeSingle(),
      sb.from('oportunidades').select('id,valor,etapa,estado').eq('cliente_id', k.cliente_id).eq('pipeline', 'venta').eq('estado', 'abierta').order('created_at', { ascending: false }).limit(1),
      sb.from('casos').select('precio').eq('id', k.id).single()
    ]);
    var ficha = (res[0].data && res[0].data.datos) || {}, op = (res[1].data || [])[0] || null, precioCaso = res[2].data && res[2].data.precio;
    var plan = (ficha.plan && ficha.plan.servicios) || ['Disputa de cuentas negativas', 'Eliminación de inquiries'];
    var rs = resumen(rep);
    var checks = el('div', { class: 'check-grid' });
    SERVICIOS.forEach(function (t) {
      var i = el('input', { type: 'checkbox', value: t }); i.checked = plan.indexOf(t) !== -1;
      checks.appendChild(el('label', { class: 'check' }, [i, el('span', { text: t })]));
    });
    var meta = (ficha.meta && (ficha.meta.equifax || ficha.meta.experian || ficha.meta.transunion)) || 720;
    var vista = el('div', { class: 'cot-res' }, [
      el('div', { class: 'cr-pts' }, BUROS.map(function (b) { return el('span', { style: '--b:' + ({ transunion: '#7a8a2a', experian: '#2e78a6', equifax: '#9a5b23' })[b[0]] }, [el('small', { text: b[1] }), el('b', { text: rs.puntajes[b[0]] || '—' })]); })),
      el('div', { class: 'muted', text: rs.cuentas.length + ' cuentas negativas · ' + rs.consultas + ' consultas · el cliente verá esto en su análisis (sin números de cuenta).' })
    ]);
    A.modal({
      titulo: 'Análisis y cotización', ok: 'Crear y enviar',
      campos: [
        { k: 'diagnostico', label: 'Diagnóstico (lo que encontramos, en palabras sencillas)', type: 'textarea', full: true, max: 3000, value: ficha.diagnostico || '' },
        { k: 'precio', label: 'Precio del paquete (USD)', type: 'number', min: '0', step: '0.01', required: true, value: op && op.valor != null ? op.valor : precioCaso },
        { k: 'meta', label: 'Meta de puntaje', type: 'number', min: '500', max: '850', value: meta },
        { k: 'forma_pago', label: 'Forma de pago', full: true, max: 300, value: 'Pagas después de cada etapa trabajada: no se cobra nada por adelantado.' },
        { k: 'duracion', label: 'Tiempo estimado', max: 120, value: '3 a 6 meses' },
        { k: 'vence', label: 'Propuesta válida hasta', type: 'date', value: hoyMas(15) },
        { k: 'notas', label: 'Nota para el cliente (opcional)', type: 'textarea', full: true, max: 1500 }
      ],
      extra: el('div', { style: 'margin-top:12px' }, [vista, el('div', { class: 'field', style: 'margin-top:12px' }, [el('div', { class: 'field-legend', text: 'Lo que vamos a trabajar' }), checks])]),
      guardar: async function (d, aviso) {
        if (!(d.precio >= 0)) { A.msg(aviso, 'Escribe el precio del paquete.'); return false; }
        var servicios = Array.prototype.map.call(checks.querySelectorAll('input:checked'), function (c) { return c.value; });
        if (!servicios.length) { A.msg(aviso, 'Marca al menos un servicio.'); return false; }
        var datos = Object.assign(rs, { diagnostico: d.diagnostico || '', servicios: servicios, forma_pago: d.forma_pago || '', duracion: d.duracion || '', meta: d.meta || 720, notas: d.notas || '' });
        var ins = await sb.from('cotizaciones').insert({ cliente_id: k.cliente_id, caso_id: k.id, oportunidad_id: op ? op.id : null, datos: datos, precio: d.precio, vence: d.vence || null }).select('*').single();
        if (ins.error) { A.msg(aviso, 'No se pudo crear la cotización.'); return false; }
        // El valor de la cotización pasa a la tarjeta del pipeline (y al caso, si no tenía precio)
        // y los seguimientos de «Análisis y cotización» cuentan desde hoy
        if (op) {
          var cambio = { valor: d.precio };
          if (['lead', 'contactado', 'llamada', 'analisis'].indexOf(op.etapa) !== -1) { cambio.etapa = 'analisis'; cambio.etapa_at = new Date().toISOString(); cambio.seguimientos = []; cambio.nps_at = null; }
          await sb.from('oportunidades').update(cambio).eq('id', op.id);
        }
        if (precioCaso == null) await sb.from('casos').update({ precio: d.precio }).eq('id', k.id);
        A.toast('Cotización creada.', 'ok'); recargar();
        setTimeout(function () { enviar(k, ins.data); }, 80);
      }
    });
  }

  async function enviar(k, q) {
    var c = await sb.from('clientes').select('nombre,telefono,email').eq('id', k.cliente_id).single();
    var cli = c.data || {}, url = urlCot(q);
    var texto = 'Hola ' + (cli.nombre || '') + ', ya revisé tu reporte de crédito. Aquí tienes tu análisis y la propuesta para trabajar tu crédito: ' + url;
    A.modal({
      titulo: 'Enviar análisis y cotización', ok: 'Listo', campos: [], guardar: function () { return true; },
      extra: el('div', null, [
        el('p', { class: 'muted', style: 'margin-bottom:10px', text: 'El cliente abre el enlace, ve su análisis y acepta la propuesta ahí mismo. Al aceptarla te llega una tarea para enviarle el contrato.' }),
        el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, [
          cli.telefono ? el('a', { class: 'btn btn-dark btn-sm', href: A.wa(cli.telefono, texto), target: '_blank', rel: 'noopener' }, [A.icon('i-whatsapp', 'icon-sm'), el('span', { text: 'Enviar por WhatsApp' })]) : null,
          cli.email ? el('a', { class: 'btn btn-ghost btn-sm', href: 'mailto:' + encodeURIComponent(cli.email) + '?subject=' + encodeURIComponent('Tu análisis de crédito · AVA Multiservices') + '&body=' + encodeURIComponent(texto + '\n\nAVA Multiservices') }, [A.icon('i-mail', 'icon-sm'), el('span', { text: 'Enviar por correo' })]) : null,
          el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Copiar enlace', onclick: function () { navigator.clipboard.writeText(url).then(function () { A.toast('Enlace copiado.'); }); } }),
          el('a', { class: 'btn btn-ghost btn-sm', href: url, target: '_blank', rel: 'noopener', text: 'Ver como cliente' })
        ])
      ])
    });
  }

  /* ---------- Queja del CFPB de cada ronda ---------- */
  var EST_CFPB = { preparada: 'Preparada', enviada: 'Enviada', en_revision: 'En revisión', respondida: 'Respondida', cerrada: 'Cerrada' };
  A.filaCFPB = function (k, ronda, quejas, cartas, recargar) {
    var deRonda = quejas.filter(function (q) { return q.ronda === ronda; });
    var fila = el('div', { class: 'cfpb' }, [el('div', { class: 'cfpb-t' }, [el('b', { text: 'Queja del CFPB' }),
      el('a', { class: 'link-btn', href: 'https://www.consumerfinance.gov/complaint/', target: '_blank', rel: 'noopener', text: 'Abrir el portal del CFPB' })])]);
    deRonda.forEach(function (q) {
      fila.appendChild(el('div', { class: 'cfpb-i' }, [
        el('span', { class: 'pill ' + (q.estado === 'cerrada' || q.estado === 'respondida' ? 'completado' : 'pendiente'), text: EST_CFPB[q.estado] }),
        el('span', { text: [q.numero ? '#' + q.numero : 'Sin número', (q.buros || []).join(', '), A.fecha(q.fecha)].filter(Boolean).join(' · ') }),
        el('button', { class: 'mini-btn', type: 'button', text: 'Editar', onclick: function () { editarQueja(k, ronda, q, cartas, recargar); } })
      ]));
    });
    if (!deRonda.length) fila.appendChild(el('button', { class: 'mini-btn', type: 'button', text: 'Registrar queja de esta ronda', onclick: function () { editarQueja(k, ronda, null, cartas, recargar); } }));
    return fila;
  };
  function editarQueja(k, ronda, q, cartas, recargar) {
    var deCartas = []; (cartas || []).forEach(function (c) { var n = { transunion: 'TransUnion', experian: 'Experian', equifax: 'Equifax' }[c.buro]; if (n && deCartas.indexOf(n) === -1) deCartas.push(n); });
    var sel = q ? q.buros : deCartas;
    var checks = el('div', { class: 'check-grid' }, BUROS.map(function (b) { var i = el('input', { type: 'checkbox', value: b[1] }); i.checked = sel.indexOf(b[1]) !== -1; return el('label', { class: 'check' }, [i, el('span', { text: b[1] })]); }));
    A.modal({
      titulo: 'Queja del CFPB · Ronda ' + ronda, ok: 'Guardar',
      campos: [
        { k: 'fecha', label: 'Fecha', type: 'date', value: q ? q.fecha : A.hoyISO() },
        { k: 'numero', label: 'Número de la queja', max: 60, value: q && q.numero, placeholder: 'Ej.: 241026-12345678' },
        { k: 'estado', label: 'Estado', type: 'select', value: q ? q.estado : 'enviada', options: Object.keys(EST_CFPB).map(function (x) { return [x, EST_CFPB[x]]; }) },
        { k: 'respuesta', label: 'Respuesta de la empresa', type: 'textarea', full: true, max: 2000, value: q && q.respuesta },
        { k: 'nota', label: 'Nota', type: 'textarea', full: true, max: 2000, value: q && q.nota }
      ],
      extra: el('div', { class: 'field', style: 'margin-top:12px' }, [el('div', { class: 'field-legend', text: 'Contra qué burós' }), checks,
        el('p', { class: 'muted', style: 'margin-top:8px;font-size:12.5px', text: 'La queja la presenta el cliente en consumerfinance.gov/complaint (o tú, con su autorización). Aquí solo llevas el registro.' })]),
      guardar: async function (d, aviso) {
        d.buros = Array.prototype.map.call(checks.querySelectorAll('input:checked'), function (c) { return c.value; });
        d.fecha = d.fecha || A.hoyISO();
        var r = q ? await sb.from('quejas_cfpb').update(d).eq('id', q.id) : await sb.from('quejas_cfpb').insert(Object.assign(d, { caso_id: k.id, cliente_id: k.cliente_id, ronda: ronda }));
        if (r.error) { A.msg(aviso, 'No se pudo guardar.'); return false; }
        A.toast('Queja del CFPB guardada.'); recargar();
      },
      borrar: q ? async function () { var x = await sb.from('quejas_cfpb').delete().eq('id', q.id); if (x.error) return false; recargar(); } : null,
      borrarTexto: 'Eliminar', borrarConfirm: '¿Eliminar el registro de esta queja?'
    });
  }
})();
