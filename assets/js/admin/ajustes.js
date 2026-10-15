/* Panel CRM — Ajustes del negocio, horario de citas e integraciones (solo administradora) */
(function () {
  'use strict';
  var A = window.AVA, el = A.el, sb = A.sb;
  var DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  var INTEG = [
    ['WhatsApp Business (API de Meta)', 'Recibir y enviar mensajes dentro del CRM, respuesta fuera de horario y envíos automáticos de la cola.', 'pendiente', 'i-whatsapp'],
    ['Instagram y Messenger', 'Mensajes directos de Instagram y Facebook en la misma bandeja.', 'pendiente', 'i-message'],
    ['Meta Ads (formularios de anuncios)', 'Los leads de tus anuncios entran solos a Solicitudes con origen «Meta Ads».', 'pendiente', 'i-trending'],
    ['QuickBooks', 'Sincronizar tus cobros y la contabilidad de tus clientes.', 'pendiente', 'i-calculator'],
    ['Pagos con tarjeta y cobros automáticos', 'Cobrar con tarjeta desde el portal y cobrar cada mes los planes de crédito y contabilidad.', 'pendiente', 'i-dollar'],
    ['Google Calendar', 'Ver tus citas en tu calendario y bloquear horarios ocupados.', 'pendiente', 'i-calendar'],
    ['Firma electrónica', 'Contratos firmados desde el celular con nombre, firma, fecha y dispositivo.', 'activo', 'i-edit'],
    ['Portal del cliente', 'Tus clientes ven su avance, suben documentos y firman.', 'activo', 'i-lock'],
    ['Citas en línea', 'Reservas en avamultiservices.com/citas con recordatorio.', 'activo', 'i-clock']
  ];

  A.vista('ajustes', {
    permiso: 'equipo',
    render: async function (cont) {
      cont.appendChild(A.cabecera('Configuración', 'Ajustes', 'del negocio', []));
      var r = await sb.from('ajustes').select('*').in('clave', ['negocio', 'citas']);
      var cfg = {};
      (r.data || []).forEach(function (x) { cfg[x.clave] = x.valor; });
      var neg = cfg.negocio || {}, cit = cfg.citas || {};

      // Negocio
      var campos = [['link_resena', 'Enlace para dejar reseña en Google', 'https://g.page/r/…'], ['descuento_referido', 'Descuento por cliente referido', '$25'], ['zelle', 'Datos de Zelle para el portal', 'pagos@avamultiservices.com'], ['telefono', 'Teléfono del negocio', ''], ['link_portal', 'Enlace del portal', '']];
      var inp = {};
      var negCard = el('div', { class: 'card' }, [el('h3', { class: 't', text: 'Datos del negocio' })]);
      var g = el('div', { class: 'grid2' });
      campos.forEach(function (c) { inp[c[0]] = el('input', { class: 'input sm', value: neg[c[0]] || '', placeholder: c[2] }); g.appendChild(el('div', { class: 'field' + (c[0] === 'link_resena' ? ' full' : '') }, [el('label', { text: c[1] }), inp[c[0]]])); });
      negCard.appendChild(g);
      negCard.appendChild(el('button', { class: 'btn btn-dark btn-sm', type: 'button', style: 'margin-top:14px', text: 'Guardar', onclick: async function () {
        var n = Object.assign({}, neg); Object.keys(inp).forEach(function (k) { n[k] = inp[k].value.trim(); });
        var u = await sb.from('ajustes').update({ valor: n }).eq('clave', 'negocio');
        A.toast(u.error ? 'No se pudo guardar.' : 'Datos guardados.', u.error ? 'error' : '');
      } }));

      // Citas
      var h = cit.horario || {};
      var dur = el('input', { class: 'input sm', type: 'number', min: '15', step: '15', value: cit.duracion || 30 });
      var ant = el('input', { class: 'input sm', type: 'number', min: '0', step: '1', value: cit.anticipacion_horas || 12 });
      var servs = el('input', { class: 'input sm', value: (cit.servicios || []).join(', ') });
      var horario = el('div', { class: 'horario' }, DIAS.map(function (dn, i) {
        var k = String(i + 1), v = h[k];
        return el('label', { class: 'h-row' }, [el('span', { text: dn }), el('input', { class: 'input sm', type: 'time', 'data-d': k, 'data-p': '0', value: v ? v[0] : '' }), el('input', { class: 'input sm', type: 'time', 'data-d': k, 'data-p': '1', value: v ? v[1] : '' })]);
      }));
      var citCard = el('div', { class: 'card' }, [el('h3', { class: 't', text: 'Citas en línea' }),
        el('div', { class: 'grid2' }, [el('div', { class: 'field' }, [el('label', { text: 'Duración (minutos)' }), dur]), el('div', { class: 'field' }, [el('label', { text: 'Anticipación mínima (horas)' }), ant]),
          el('div', { class: 'field full' }, [el('label', { text: 'Servicios que se pueden reservar (separados por coma)' }), servs])]),
        el('div', { class: 'field', style: 'margin-top:12px' }, [el('label', { text: 'Horario de atención (deja vacío los días cerrados)' }), horario]),
        el('button', { class: 'btn btn-dark btn-sm', type: 'button', style: 'margin-top:14px', text: 'Guardar horario', onclick: async function () {
          var nh = {};
          horario.querySelectorAll('input').forEach(function (i) { if (i.value) (nh[i.dataset.d] = nh[i.dataset.d] || ['', ''])[i.dataset.p] = i.value; });
          Object.keys(nh).forEach(function (d) { if (!nh[d][0] || !nh[d][1]) delete nh[d]; });
          var n = Object.assign({}, cit, { duracion: Math.max(15, Number(dur.value) || 30), anticipacion_horas: Math.max(0, Number(ant.value) || 0), horario: nh,
            servicios: servs.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean) });
          var u = await sb.from('ajustes').update({ valor: n }).eq('clave', 'citas');
          A.toast(u.error ? 'No se pudo guardar.' : 'Horario guardado.', u.error ? 'error' : '');
        } })]);

      // Integraciones
      var intCard = el('div', { class: 'card' }, [el('h3', { class: 't', text: 'Integraciones' }), el('p', { class: 'muted', style: 'margin-bottom:12px', text: 'El CRM ya está preparado para cada una. Las marcadas como pendientes se conectan en la etapa final, con tus cuentas.' })]);
      INTEG.forEach(function (x) {
        intCard.appendChild(el('div', { class: 'integ' }, [el('span', { class: 'ti-ico' }, [A.icon(x[3], 'icon-sm')]), el('div', null, [el('b', { text: x[0] }), el('span', { class: 'muted', text: x[1] })]),
          el('span', { class: 'pill ' + (x[2] === 'activo' ? 'completado' : 'pendiente'), text: x[2] === 'activo' ? 'Activo' : 'Por conectar' })]));
      });

      // Automáticos
      var autoCard = el('div', { class: 'card' }, [el('h3', { class: 't', text: 'Tareas automáticas' }),
        el('p', { class: 'muted', text: 'Cada día: recordatorios de citas, pagos y documentos. El día 1 de cada mes: casos de contabilidad mensual. El 1 de abril: casos y avisos de Franchise Tax para clientes con LLC.' }),
        el('div', { class: 'row2', style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:12px' }, [
          el('button', { class: 'mini-btn', type: 'button', text: 'Generar contabilidad de este mes', onclick: async function () { var r = await sb.rpc('generar_contabilidad_mes', { p_fecha: A.hoyISO() }); A.toast(r.error ? 'No se pudo.' : r.data + ' casos creados.', r.error ? 'error' : ''); } }),
          el('button', { class: 'mini-btn', type: 'button', text: 'Generar Franchise Tax ' + new Date().getFullYear(), onclick: async function () { if (!confirm('¿Crear los casos de Franchise Tax ' + new Date().getFullYear() + ' para tus clientes con LLC?')) return; var r = await sb.rpc('generar_franchise_tax', { p_anio: new Date().getFullYear() }); A.toast(r.error ? 'No se pudo.' : r.data + ' casos creados.', r.error ? 'error' : ''); } })
        ])]);

      cont.appendChild(el('div', { class: 'cols' }, [el('div', null, [negCard, citCard]), el('div', null, [intCard, autoCard])]));
    }
  });
})();
