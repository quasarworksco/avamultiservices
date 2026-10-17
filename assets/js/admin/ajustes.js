/* Panel CRM — Ajustes del negocio, horario de citas e integraciones (solo administradora) */
(function () {
  'use strict';
  var A = window.AVA, el = A.el, sb = A.sb;
  var DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  var FN = 'https://szmkcwtkorsndvmxywai.supabase.co/functions/v1/';
  // [nombre, descripción, clave de estado (o true si ya funciona), icono]
  var INTEG = [
    ['WhatsApp Business (API de Meta)', 'Recibir y enviar mensajes dentro del CRM, respuesta fuera de horario y envíos automáticos de la cola.', 'whatsapp', 'i-whatsapp'],
    ['Instagram y Messenger', 'Mensajes directos de Instagram y Facebook en la misma bandeja.', 'meta', 'i-message'],
    ['Meta Ads (formularios de anuncios)', 'Los leads de tus anuncios entran solos a Solicitudes con origen «Meta Ads».', 'meta', 'i-trending'],
    ['Pagos con tarjeta y cobros automáticos', 'Cobrar con tarjeta desde el portal y cobrar cada mes los planes de crédito y contabilidad.', 'stripe', 'i-dollar'],
    ['QuickBooks', 'Sincronizar tus cobros y la contabilidad de tus clientes.', null, 'i-calculator'],
    ['Google Calendar', 'Ver tus citas en tu calendario y bloquear horarios ocupados.', null, 'i-calendar'],
    ['Firma electrónica', 'Contratos firmados desde el celular con nombre, firma, fecha y dispositivo.', true, 'i-edit'],
    ['Portal del cliente', 'Tus clientes ven su avance, suben documentos y firman.', true, 'i-lock'],
    ['Citas en línea', 'Reservas en avamultiservices.com/citas con recordatorio.', true, 'i-clock']
  ];
  var FUENTES = { whatsapp: 'WhatsApp', messenger: 'Messenger', instagram: 'Instagram', meta_ads: 'Meta Ads', stripe: 'Stripe', cola: 'Envío automático' };

  A.vista('ajustes', {
    permiso: 'equipo',
    render: async function (cont) {
      cont.appendChild(A.cabecera('Configuración', 'Ajustes', 'del negocio', []));
      var r = await sb.from('ajustes').select('*').in('clave', ['negocio', 'citas', 'checklists']);
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
          A.olvidar('config_citas');
          A.toast(u.error ? 'No se pudo guardar.' : 'Horario guardado.', u.error ? 'error' : '');
        } })]);

      // Documentos que se piden en cada servicio
      var listas = Object.assign({}, cfg.checklists || {});
      var svc = el('select', { class: 'input sm', 'aria-label': 'Servicio' }, Object.keys(A.SERVICIOS).filter(function (k) { return !A.SERVICIOS[k].oculto || k === 'notaria'; }).map(function (k) { return el('option', { value: k, text: A.SERVICIOS[k].label }); }));
      var docs = el('textarea', { class: 'input', style: 'min-height:190px', maxlength: 4000, 'aria-label': 'Documentos, uno por línea' });
      function mostrar() { docs.value = (listas[svc.value] || []).join('\n'); }
      svc.addEventListener('change', mostrar); mostrar();
      var docCard = el('div', { class: 'card' }, [el('h3', { class: 't', text: 'Documentos por servicio' }),
        el('p', { class: 'muted', style: 'margin-bottom:10px', text: 'Lo que se le pide al cliente en cada servicio, uno por línea. Cada caso nuevo copia esta lista; en cada caso puedes agregar o quitar.' }),
        el('div', { class: 'field' }, [el('label', { text: 'Servicio' }), svc]), el('div', { class: 'field', style: 'margin-top:10px' }, [el('label', { text: 'Documentos (uno por línea)' }), docs]),
        el('button', { class: 'btn btn-dark btn-sm', type: 'button', style: 'margin-top:14px', text: 'Guardar lista', onclick: async function () {
          listas[svc.value] = docs.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 40);
          var u = await sb.from('ajustes').update({ valor: listas }).eq('clave', 'checklists');
          A.toast(u.error ? 'No se pudo guardar.' : 'Lista de ' + A.SERVICIOS[svc.value].label + ' guardada.', u.error ? 'error' : '');
        } })]);

      // Integraciones
      var intCard = el('div', { class: 'card' }, [el('h3', { class: 't', text: 'Integraciones' }), el('p', { class: 'muted', style: 'margin-bottom:12px', text: 'El CRM ya está preparado para cada una. Las que dicen «Por conectar» se activan al registrar las claves de tus cuentas.' })]);
      var integ = await A.integraciones();
      INTEG.forEach(function (x) {
        var on = x[2] === true || (x[2] && integ[x[2]]);
        intCard.appendChild(el('div', { class: 'integ' }, [el('span', { class: 'ti-ico' }, [A.icon(x[3], 'icon-sm')]), el('div', null, [el('b', { text: x[0] }), el('span', { class: 'muted', text: x[1] })]),
          el('span', { class: 'pill ' + (on ? 'completado' : 'pendiente'), text: on ? 'Activo' : 'Por conectar' })]));
      });
      // Direcciones para configurar en Meta y Stripe
      function copiar(txt) { return el('button', { class: 'mini-btn', type: 'button', text: 'Copiar', onclick: function () { navigator.clipboard.writeText(txt).then(function () { A.toast('Copiado.'); }); } }); }
      intCard.appendChild(el('div', { class: 'field', style: 'margin-top:14px' }, [el('label', { text: 'Webhook para Meta (WhatsApp, Instagram, Messenger y anuncios)' }),
        el('div', { style: 'display:flex;gap:8px;align-items:center' }, [el('code', { style: 'flex:1;min-width:0;overflow-wrap:anywhere;font-size:12px', text: FN + 'meta-webhook' }), copiar(FN + 'meta-webhook')])]));
      intCard.appendChild(el('div', { class: 'field', style: 'margin-top:10px' }, [el('label', { text: 'Webhook para Stripe' }),
        el('div', { style: 'display:flex;gap:8px;align-items:center' }, [el('code', { style: 'flex:1;min-width:0;overflow-wrap:anywhere;font-size:12px', text: FN + 'stripe-webhook' }), copiar(FN + 'stripe-webhook')])]));
      // Últimos eventos recibidos
      var ev = await sb.from('integraciones_eventos').select('*').order('created_at', { ascending: false }).limit(8);
      if ((ev.data || []).length) {
        intCard.appendChild(el('h3', { class: 't', style: 'margin-top:18px', text: 'Actividad reciente' }));
        ev.data.forEach(function (e) {
          intCard.appendChild(el('div', { class: 'muted', style: 'display:flex;gap:8px;justify-content:space-between;padding:6px 0;border-top:1px solid var(--line);font-size:13px' }, [
            el('span', { text: (e.ok ? '✓ ' : '✕ ') + FUENTES[e.fuente] + ' · ' + e.tipo.replace(/_/g, ' ') + (e.detalle ? ' · ' + e.detalle : '') }), el('span', { style: 'flex:none', text: A.hace(e.created_at) })]));
        });
      }

      // Claves de integración: se guardan cifradas y no se pueden volver a leer desde el panel
      var CLAVES = [
        ['META_APP_SECRET', 'Clave secreta de la app de Meta', 'developers.facebook.com → AVA CRM → Configuración → Básica → Clave secreta'],
        ['WHATSAPP_TOKEN', 'Token del usuario del sistema', 'Portafolio → Usuarios del sistema → Generar token (no vence)'],
        ['WHATSAPP_PHONE_ID', 'Phone number ID de WhatsApp', 'App → WhatsApp → Configuración de la API (número largo, no el teléfono)'],
        ['META_PAGE_ID', 'ID de la página de Facebook', 'Página de AVA → Información → Identificador'],
        ['WHATSAPP_TEMPLATE', 'Nombre de la plantilla de avisos (opcional)', 'Si no se llena se usa «aviso_ava»'],
        ['STRIPE_SECRET_KEY', 'Clave secreta de Stripe', 'Stripe → Developers → API keys (sk_live_…)'],
        ['STRIPE_WEBHOOK_SECRET', 'Firma del webhook de Stripe', 'Stripe → Developers → Webhooks (whsec_…)']
      ];
      var claveCard = el('div', { class: 'card' }, [el('h3', { class: 't', text: 'Claves de integración' }),
        el('p', { class: 'muted', style: 'margin-bottom:12px', text: 'Pega aquí las claves de Meta y Stripe. Se guardan cifradas y nadie puede volver a verlas; para cambiar una, pega la nueva.' })]);
      var cfgClaves = (await sb.rpc('claves_configuradas')).data || {};
      CLAVES.forEach(function (c) {
        var inp = el('input', { class: 'input sm', type: c[0] === 'WHATSAPP_PHONE_ID' || c[0] === 'META_PAGE_ID' || c[0] === 'WHATSAPP_TEMPLATE' ? 'text' : 'password', autocomplete: 'off', placeholder: cfgClaves[c[0]] ? '•••••••• (guardada)' : 'Pegar aquí', 'aria-label': c[1] });
        var pill = el('span', { class: 'pill ' + (cfgClaves[c[0]] ? 'completado' : 'pendiente'), text: cfgClaves[c[0]] ? 'Guardada' : 'Falta' });
        claveCard.appendChild(el('div', { class: 'field', style: 'margin-top:10px' }, [
          el('label', { style: 'display:flex;justify-content:space-between;gap:8px;align-items:center' }, [el('span', { text: c[1] }), pill]),
          el('div', { style: 'display:flex;gap:8px' }, [inp, el('button', { class: 'mini-btn', type: 'button', text: 'Guardar', onclick: async function () {
            var v = inp.value.trim(); if (!v) { inp.focus(); return; }
            var r = await sb.rpc('guardar_clave_integracion', { p_nombre: c[0], p_valor: v });
            if (r.error) { A.toast('No se pudo guardar la clave.', 'error'); return; }
            inp.value = ''; inp.placeholder = '•••••••• (guardada)'; pill.className = 'pill completado'; pill.textContent = 'Guardada';
            A.limpiarIntegraciones(); A.toast(c[1] + ' guardada. Se activa en 1 minuto.');
          } })]),
          el('span', { class: 'muted', style: 'font-size:12px', text: c[2] })
        ]));
      });

      // Automáticos
      var autoCard = el('div', { class: 'card' }, [el('h3', { class: 't', text: 'Tareas automáticas' }),
        el('p', { class: 'muted', text: 'Cada día: recordatorios de citas, pagos y documentos. El día 1 de cada mes: casos de contabilidad mensual. El 1 de abril: casos y avisos de Franchise Tax para clientes con LLC.' }),
        el('div', { class: 'row2', style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:12px' }, [
          el('button', { class: 'mini-btn', type: 'button', text: 'Generar contabilidad de este mes', onclick: async function () { var r = await sb.rpc('generar_contabilidad_mes', { p_fecha: A.hoyISO() }); A.toast(r.error ? 'No se pudo.' : r.data + ' casos creados.', r.error ? 'error' : ''); } }),
          el('button', { class: 'mini-btn', type: 'button', text: 'Generar Franchise Tax ' + new Date().getFullYear(), onclick: async function () { if (!confirm('¿Crear los casos de Franchise Tax ' + new Date().getFullYear() + ' para tus clientes con LLC?')) return; var r = await sb.rpc('generar_franchise_tax', { p_anio: new Date().getFullYear() }); A.toast(r.error ? 'No se pudo.' : r.data + ' casos creados.', r.error ? 'error' : ''); } })
        ])]);

      cont.appendChild(el('div', { class: 'cols' }, [el('div', null, [negCard, citCard, docCard]), el('div', null, [intCard, claveCard, autoCard])]));
    }
  });
})();
