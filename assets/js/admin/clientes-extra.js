/* Panel CRM — Ficha del cliente: portal, contratos con firma electrónica y planes mensuales */
(function () {
  'use strict';
  var A = window.AVA, el = A.el, sb = A.sb;
  var BASE = 'https://avamultiservices.com/';

  /* ---------- Portal del cliente ---------- */
  A.tarjetaPortal = function (c) {
    var card = el('div', { class: 'card' }, [el('h3', { class: 't', text: 'Portal del cliente' })]);
    sb.from('portal_accesos').select('created_at,email').eq('cliente_id', c.id).maybeSingle().then(function (r) {
      if (r.data) {
        card.appendChild(el('div', { class: 'alert ok', style: 'margin-bottom:10px' }, [A.icon('i-check', 'icon-sm'), 'Tiene acceso desde el ' + A.fecha(r.data.created_at) + ' con ' + r.data.email]));
        card.appendChild(el('p', { class: 'muted', text: 'Entra en avamultiservices.com/portal con su correo: ve la etapa de sus casos, sube documentos, firma contratos y ve sus pagos.' }));
        card.appendChild(el('button', { class: 'mini-btn danger', type: 'button', style: 'margin-top:10px', text: 'Quitar acceso', onclick: async function () {
          if (!confirm('¿Quitar el acceso al portal a ' + A.nombreDe(c) + '?')) return;
          var d = await sb.from('portal_accesos').delete().eq('cliente_id', c.id);
          A.toast(d.error ? 'No se pudo quitar.' : 'Acceso quitado.', d.error ? 'error' : '');
          if (!d.error) { card.replaceWith(A.tarjetaPortal(c)); }
        } }));
      } else {
        card.appendChild(el('p', { class: 'muted', style: 'margin-bottom:10px', text: c.email ? 'Invítalo para que vea el avance de su caso, suba documentos y firme desde su celular.' : 'Agrega el correo del cliente para poder invitarlo.' }));
        if (c.email) card.appendChild(el('button', { class: 'btn btn-dark btn-sm', type: 'button', onclick: async function () {
          this.disabled = true;
          var res = await sb.functions.invoke('portal-invitar', { body: { cliente_id: c.id } });
          this.disabled = false;
          if (res.error) { A.toast('No se pudo enviar la invitación.', 'error'); return; }
          A.toast('Invitación al portal enviada a ' + c.email + '.');
          card.replaceWith(A.tarjetaPortal(c));
        } }, [A.icon('i-mail'), el('span', { text: 'Invitar al portal' })]));
      }
    });
    return card;
  };

  /* ---------- Contratos ---------- */
  var PLANTILLAS = {
    credito: { t: 'Contrato de servicios de reparación de crédito', x:
'CONTRATO DE SERVICIOS DE REPARACIÓN DE CRÉDITO\n\nEntre AVA Multiservices ("la Empresa") y {nombre} ("el Cliente"), con fecha {fecha}.\n\n1. SERVICIOS. La Empresa revisará los reportes de crédito del Cliente de Equifax, Experian y TransUnion, preparará y enviará disputas de información inexacta, incompleta o no verificable, y dará seguimiento a las respuestas de los burós.\n\n2. PAGO. {pago}\n\n3. SIN GARANTÍAS. La Empresa no garantiza la eliminación de información ni un aumento específico del puntaje. La información correcta y verificable no puede eliminarse legalmente.\n\n4. DERECHO A CANCELAR. Usted puede cancelar este contrato sin penalidad ni obligación en cualquier momento antes de la medianoche del tercer día hábil después de la fecha en que lo firmó. Para cancelar, avise por escrito a AVA Multiservices.\n\n5. SUS DERECHOS. Usted tiene derecho a disputar directamente y sin costo la información inexacta de su reporte de crédito ante los burós. Ninguna persona puede eliminar información correcta, reciente y verificable de su reporte.\n\n6. DURACIÓN. Este contrato estará vigente hasta completar las rondas de disputa acordadas o hasta que alguna de las partes lo cancele por escrito.\n\nAl firmar, el Cliente confirma que leyó y entiende este contrato y que recibió una copia.' },
    contabilidad: { t: 'Acuerdo de contabilidad mensual', x:
'ACUERDO DE SERVICIOS DE CONTABILIDAD MENSUAL\n\nEntre AVA Multiservices ("la Empresa") y {nombre} ("el Cliente"), con fecha {fecha}.\n\n1. SERVICIOS. Cada mes la Empresa solicitará los estados de cuenta del negocio del Cliente, conciliará sus ingresos y gastos y le entregará un reporte mensual.\n\n2. RESPONSABILIDADES DEL CLIENTE. Enviar sus estados de cuenta y comprobantes dentro de los primeros 5 días de cada mes.\n\n3. PAGO. {pago}\n\n4. DURACIÓN Y CANCELACIÓN. El servicio se renueva cada mes. Cualquiera de las partes puede cancelarlo avisando por escrito con 15 días de anticipación.\n\nAl firmar, el Cliente confirma que leyó y acepta este acuerdo.' },
    general: { t: 'Acuerdo de servicios', x:
'ACUERDO DE SERVICIOS\n\nEntre AVA Multiservices ("la Empresa") y {nombre} ("el Cliente"), con fecha {fecha}.\n\n1. SERVICIO. {servicio}\n\n2. PAGO. {pago}\n\n3. ACLARACIÓN. AVA Multiservices prepara documentos con la información que el Cliente proporciona; no somos abogados ni ofrecemos asesoría legal.\n\nAl firmar, el Cliente confirma que leyó y acepta este acuerdo.' }
  };
  var EST = { borrador: 'Borrador', enviado: 'Enviado para firma', firmado: 'Firmado', anulado: 'Anulado' };

  A.tarjetaContratos = function (c) {
    var card = el('div', { class: 'card' });
    async function pintar() {
      var r = await sb.from('contratos').select('id,titulo,estado,token,created_at,firmado_at,firmado_nombre').eq('cliente_id', c.id).order('created_at', { ascending: false });
      card.innerHTML = '';
      card.appendChild(el('div', { class: 'card-h' }, [el('h3', { class: 't', text: 'Contratos · ' + (r.data || []).length }), el('button', { class: 'mini-btn', type: 'button', text: 'Nuevo contrato', onclick: function () { nuevoContrato(c, pintar); } })]));
      if (!(r.data || []).length) card.appendChild(el('div', { class: 'muted', text: 'Crea el contrato desde una plantilla y envíale el enlace para que lo firme desde su celular.' }));
      (r.data || []).forEach(function (k) {
        var link = BASE + 'firmar/?t=' + k.token;
        card.appendChild(el('div', { class: 'pay', style: 'align-items:center' }, [
          el('span', null, [el('b', { text: k.titulo }), el('span', { class: 'muted', style: 'display:block;font-size:12px', text: EST[k.estado] + (k.firmado_at ? ' · ' + A.fecha(k.firmado_at) + ' por ' + k.firmado_nombre : '') })]),
          el('span', { class: 'doc-a' }, [
            k.estado === 'borrador' ? el('button', { class: 'mini-btn', type: 'button', text: 'Enviar', onclick: async function () {
              var u = await sb.from('contratos').update({ estado: 'enviado', enviado_at: new Date().toISOString() }).eq('id', k.id);
              if (u.error) { A.toast('No se pudo enviar.', 'error'); return; }
              compartir(c, link); pintar();
            } }) : null,
            k.estado === 'enviado' ? el('button', { class: 'mini-btn', type: 'button', text: 'Compartir enlace', onclick: function () { compartir(c, link); } }) : null,
            k.estado !== 'borrador' ? el('a', { class: 'mini-btn', href: link, target: '_blank', rel: 'noopener', text: k.estado === 'firmado' ? 'Ver firmado' : 'Ver' }) : el('button', { class: 'mini-btn', type: 'button', text: 'Editar', onclick: function () { editarContrato(k.id, pintar); } })
          ])
        ]));
      });
    }
    pintar();
    return card;
  };

  function compartir(c, link) {
    var tel = A.soloDigitos(c.telefono);
    var msg = 'Hola ' + c.nombre + ', aquí puedes leer y firmar tu contrato con AVA Multiservices: ' + link;
    if (navigator.clipboard) navigator.clipboard.writeText(link).catch(function () {});
    if (tel.length >= 7) window.open('https://wa.me/' + (tel.length === 10 ? '1' + tel : tel) + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
    A.toast('Enlace copiado' + (tel.length >= 7 ? ' y WhatsApp abierto.' : '.'));
  }

  async function nuevoContrato(c, alGuardar) {
    var casos = (await sb.from('casos').select('id,servicio,titulo,precio').eq('cliente_id', c.id).neq('estado', 'cancelado')).data || [];
    var planes = (await sb.from('planes').select('*').eq('cliente_id', c.id).eq('activo', true)).data || [];
    var m = A.modal({
      titulo: 'Nuevo contrato', ok: 'Crear borrador',
      campos: [
        { k: 'plantilla', label: 'Plantilla', type: 'select', value: casos.some(function (k) { return k.servicio === 'credito'; }) ? 'credito' : 'general', options: [['credito', 'Reparación de crédito'], ['contabilidad', 'Contabilidad mensual'], ['general', 'Servicio general']] },
        { k: 'caso_id', label: 'Caso relacionado', type: 'select', options: [['', 'Ninguno']].concat(casos.map(function (k) { return [k.id, k.titulo || A.SERVICIOS[k.servicio].label]; })) },
        { k: 'pago', label: 'Condiciones de pago', full: true, max: 500, value: planes[0] ? 'El Cliente pagará ' + A.dinero(planes[0].monto) + ' mensuales, los días ' + planes[0].dia_cobro + ' de cada mes.' : (casos[0] && casos[0].precio ? 'El Cliente pagará ' + A.dinero(casos[0].precio) + ' por el servicio.' : '') }
      ],
      extra: el('p', { class: 'muted', style: 'margin-top:12px;font-size:12.5px', text: 'Las plantillas son un punto de partida: revísalas con un abogado antes de usarlas, sobre todo la de reparación de crédito (leyes federales y de Texas).' }),
      guardar: async function (d, aviso) {
        var p = PLANTILLAS[d.plantilla];
        var caso = casos.filter(function (k) { return k.id === d.caso_id; })[0];
        var texto = p.x.replace(/\{nombre\}/g, A.nombreDe(c)).replace(/\{fecha\}/g, A.fecha(A.hoyISO()))
          .replace(/\{pago\}/g, d.pago || 'Según lo acordado entre las partes.')
          .replace(/\{servicio\}/g, caso ? (caso.titulo || A.SERVICIOS[caso.servicio].label) : 'Servicio acordado entre las partes.');
        var r = await sb.from('contratos').insert({ cliente_id: c.id, caso_id: d.caso_id || null, titulo: p.t, contenido: texto }).select('id').single();
        if (r.error) { A.msg(aviso, 'No se pudo crear.'); return false; }
        alGuardar();
        setTimeout(function () { editarContrato(r.data.id, alGuardar); }, 50);
      }
    });
    return m;
  }

  async function editarContrato(id, alGuardar) {
    var k = (await sb.from('contratos').select('*').eq('id', id).single()).data;
    if (!k) return;
    A.modal({
      titulo: 'Revisar contrato', ok: 'Guardar borrador',
      campos: [{ k: 'titulo', label: 'Título', full: true, value: k.titulo, max: 160, required: true }, { k: 'contenido', label: 'Texto del contrato', type: 'textarea', full: true, value: k.contenido, max: 30000, required: true }],
      guardar: async function (d, aviso) {
        var u = await sb.from('contratos').update(d).eq('id', id);
        if (u.error) { A.msg(aviso, 'No se pudo guardar.'); return false; }
        A.toast('Borrador guardado. Toca «Enviar» para mandarlo a firmar.'); alGuardar();
      },
      borrar: async function () { await sb.from('contratos').delete().eq('id', id); alGuardar(); },
      borrarTexto: 'Eliminar borrador'
    });
    var ta = document.getElementById('m-contenido');
    if (ta) ta.style.minHeight = '320px';
  }

  /* ---------- Planes mensuales (cobro recurrente) ---------- */
  var SERV_PLAN = { credito: 'Reparación de crédito', contabilidad: 'Contabilidad mensual', plan_irs: 'Plan de pago IRS', otro: 'Otro' };
  var COBRO = { manual: '', pendiente: 'esperando que el cliente registre su tarjeta', activo: 'se cobra solo con tarjeta', fallido: 'el último cobro con tarjeta falló', cancelado: 'cobro con tarjeta cancelado' };

  // Crea un enlace de pago de Square y lo comparte por WhatsApp con el cliente
  async function enlacePago(c, cuerpo, mensaje) {
    // La ventana se abre antes de esperar a Square para que el navegador no la bloquee
    var w = c.telefono ? window.open('', '_blank') : null;
    if (w) w.opener = null;
    var r = await sb.functions.invoke('square-pago', { body: cuerpo });
    if (r.error) {
      if (w) w.close();
      var e = {}; try { e = await r.error.context.json(); } catch (_) { /* */ }
      A.toast(e.error || 'No se pudo crear el enlace.', 'error'); return;
    }
    var texto = mensaje + ' ' + r.data.url;
    if (w) w.location.href = A.wa(c.telefono, texto);
    else { try { await navigator.clipboard.writeText(r.data.url); } catch (_) { /* */ } A.toast('Enlace copiado: el cliente no tiene teléfono.'); }
  }
  A.enlacePago = enlacePago;
  A.tarjetaPlanes = function (c) {
    var card = el('div', { class: 'card' });
    async function pintar() {
      var r = await sb.from('planes').select('*').eq('cliente_id', c.id).order('created_at');
      card.innerHTML = '';
      var integ = await A.integraciones();
      card.appendChild(el('div', { class: 'card-h' }, [el('h3', { class: 't', text: 'Cobros mensuales' }), el('div', { style: 'display:flex;gap:6px' }, [
        integ.pagos && A.puede('cobros') ? el('button', { class: 'mini-btn', type: 'button', text: 'Cobrar con tarjeta', onclick: function () { cobroUnico(c, pintar); } }) : null,
        el('button', { class: 'mini-btn', type: 'button', text: 'Nuevo plan', onclick: function () { editarPlan(c, null, pintar); } })])]));
      if (!(r.data || []).length) card.appendChild(el('div', { class: 'muted', text: 'Para crédito o contabilidad: registra el cobro mensual y el sistema te recordará cada pago (y a tu cliente).' }));
      (r.data || []).forEach(function (p) {
        card.appendChild(el('button', { class: 'saldo', type: 'button', onclick: function () { editarPlan(c, p, pintar); } }, [
          el('div', null, [el('b', { text: SERV_PLAN[p.servicio] + (p.descripcion ? ' · ' + p.descripcion : '') }), el('div', { class: 'muted', text: 'Día ' + p.dia_cobro + ' de cada mes' + (p.activo ? '' : ' · pausado') + (COBRO[p.estado_cobro] ? ' · ' + COBRO[p.estado_cobro] : '') + (p.servicio === 'contabilidad' && p.activo ? ' · crea el caso del mes automáticamente' : '') })]),
          el('b', { class: p.activo ? '' : 'muted', text: A.dinero(p.monto) + '/mes' })
        ]));
        if (integ.pagos && p.activo && A.puede('cobros')) {
          card.appendChild(el('button', { class: 'mini-btn', type: 'button', style: 'margin:-2px 0 10px', text: 'Enviar enlace de pago del mes',
            onclick: async function () {
              await enlacePago(c, { tipo: 'monto', cliente_id: c.id, plan_id: p.id, monto: Number(p.monto), descripcion: (SERV_PLAN[p.servicio] + (p.descripcion ? ' · ' + p.descripcion : '')) + ' (mensualidad)' },
                'Hola ' + (c.nombre || '') + ', aquí puedes pagar con tarjeta tu mensualidad de ' + A.dinero(p.monto) + ':');
              pintar();
            } }));
        }
      });
      // Enlaces de pago enviados y si ya se pagaron
      if (A.puede('cobros')) {
        var en = await sb.from('enlaces_pago').select('*').eq('cliente_id', c.id).order('created_at', { ascending: false }).limit(5);
        if ((en.data || []).length) {
          card.appendChild(el('div', { class: 'muted', style: 'margin:12px 0 4px;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase', text: 'Enlaces de pago con tarjeta' }));
          en.data.forEach(function (e) {
            var EST = { pendiente: ['pendiente', 'Esperando pago'], pagado: ['completado', 'Pagado'], cancelado: ['cancelado', 'Cancelado'] }[e.estado];
            card.appendChild(el('div', { class: 'saldo', style: 'cursor:default' }, [
              el('div', null, [el('b', { text: (e.concepto || 'Pago') + ' · ' + A.dinero(e.monto) }), el('div', { class: 'muted', text: 'Enviado ' + A.hace(e.created_at) + (e.pagado_at ? ' · pagado ' + A.fecha(e.pagado_at) : '') })]),
              el('div', { style: 'display:flex;gap:6px;align-items:center;flex:none' }, [
                el('span', { class: 'pill ' + EST[0], text: EST[1] }),
                e.estado === 'pendiente' ? el('button', { class: 'mini-btn', type: 'button', text: 'Copiar', onclick: function () { navigator.clipboard.writeText(e.url).then(function () { A.toast('Enlace copiado.'); }); } }) : null,
                e.estado === 'pendiente' ? el('button', { class: 'mini-btn', type: 'button', text: 'Cancelar', title: 'Marcar como cancelado en el CRM (el cliente ya no debería usarlo)', onclick: async function () {
                  if (!confirm('¿Marcar este enlace como cancelado?')) return;
                  await sb.from('enlaces_pago').update({ estado: 'cancelado' }).eq('id', e.id); pintar();
                } }) : null
              ])
            ]));
          });
        }
      }
    }
    pintar();
    return card;
  };
  function cobroUnico(c, alTerminar) {
    A.modal({
      titulo: 'Cobrar con tarjeta', ok: 'Crear enlace y enviar',
      campos: [
        { k: 'monto', label: 'Monto (USD)', type: 'number', required: true, min: '1', step: '0.01' },
        { k: 'descripcion', label: 'Concepto', max: 120, placeholder: 'Preparación de taxes 2025', full: true }
      ],
      extra: el('p', { class: 'muted', style: 'margin-top:10px;font-size:12.5px', text: 'Se abre WhatsApp con el enlace de pago seguro de Square. Cuando el cliente pague, el pago aparece solo en Cobros con su recibo.' }),
      guardar: async function (d) {
        await enlacePago(c, { tipo: 'monto', cliente_id: c.id, monto: Number(d.monto), descripcion: d.descripcion || 'Pago a AVA Multiservices' },
          'Hola ' + (c.nombre || '') + ', puedes pagar ' + A.dinero(d.monto) + (d.descripcion ? ' (' + d.descripcion + ')' : '') + ' con tarjeta aquí:');
        if (alTerminar) alTerminar();
      }
    });
  }
  function editarPlan(c, p, alGuardar) {
    var nuevo = !p; p = p || {};
    A.modal({
      titulo: nuevo ? 'Nuevo cobro mensual' : 'Cobro mensual', ok: nuevo ? 'Crear' : 'Guardar',
      campos: [
        { k: 'servicio', label: 'Servicio', type: 'select', value: p.servicio || 'credito', options: Object.keys(SERV_PLAN).map(function (k) { return [k, SERV_PLAN[k]]; }) },
        { k: 'monto', label: 'Monto mensual (USD)', type: 'number', required: true, min: '1', step: '0.01', value: p.monto },
        { k: 'dia_cobro', label: 'Día de cobro (1-28)', type: 'number', min: '1', step: '1', value: p.dia_cobro || 1 },
        { k: 'inicio', label: 'Desde', type: 'date', value: p.inicio || A.hoyISO() },
        { k: 'fin', label: 'Hasta (opcional)', type: 'date', value: p.fin },
        { k: 'activo', label: 'Estado', type: 'select', value: p.activo === false ? 'no' : 'si', options: [['si', 'Activo'], ['no', 'Pausado']] },
        { k: 'descripcion', label: 'Descripción', full: true, value: p.descripcion, max: 200, placeholder: 'Plan crédito 6 meses' }
      ],
      extra: el('p', { class: 'muted', style: 'margin-top:10px;font-size:12.5px', text: 'El sistema te avisa 2 días antes de cada cobro. Con Square conectado, toca «Enviar enlace de pago del mes» y el cliente paga con tarjeta desde su celular.' }),
      guardar: async function (d, aviso) {
        d.activo = d.activo !== 'no';
        d.dia_cobro = Math.min(28, Math.max(1, Number(d.dia_cobro) || 1));
        d.cliente_id = c.id;
        var q = nuevo ? sb.from('planes').insert(d) : sb.from('planes').update(d).eq('id', p.id);
        var r = await q;
        if (r.error) { A.msg(aviso, 'No se pudo guardar.'); return false; }
        if (nuevo && d.servicio === 'contabilidad') await sb.rpc('generar_contabilidad_mes', { p_fecha: A.hoyISO() });
        A.toast(nuevo ? 'Cobro mensual creado.' : 'Guardado.'); alGuardar();
      },
      borrar: nuevo ? null : async function () { await sb.from('planes').delete().eq('id', p.id); alGuardar(); }
    });
  }
})();
