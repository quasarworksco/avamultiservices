/* Panel CRM — Campañas por etiqueta, servicio u origen (temporada de taxes, Franchise Tax, promociones de crédito) */
(function () {
  'use strict';
  var A = window.AVA, el = A.el, sb = A.sb;
  var EST = { borrador: 'Borrador', en_cola: 'En «Por enviar»', enviada: 'Enviada' };
  var anioAnterior = new Date().getFullYear() - 1;
  var MODELOS = [
    { n: 'Temporada de taxes (clientes del año pasado)', f: { taxes_anio: String(anioAnterior) }, m: 'Hola {nombre}, ¡ya abrió la temporada de taxes! El año pasado preparamos tu declaración y este año queremos ayudarte otra vez. Agenda tu cita aquí: https://avamultiservices.com/citas/' },
    { n: 'Franchise Tax (clientes con LLC)', f: { servicio: 'llc' }, m: 'Hola {nombre}, recuerda que el Franchise Tax de Texas de tu LLC vence el 15 de mayo. Envíanos la información de ingresos de tu empresa para presentarlo a tiempo.' },
    { n: 'Promoción de crédito (clientes de taxes sin crédito)', f: { servicio: 'taxes', sin_servicio: 'credito' }, m: 'Hola {nombre}, ¿sabías que también te ayudamos a mejorar tu crédito? Este mes tenemos una promoción especial para clientes de AVA. Escríbenos y te contamos.' },
    { n: 'Contabilidad mensual (clientes con LLC)', f: { servicio: 'llc', sin_servicio: 'contabilidad' }, m: 'Hola {nombre}, para que tu LLC esté siempre al día te ofrecemos contabilidad mensual: conciliamos tus cuentas y te enviamos un reporte cada mes. ¿Te interesa?' }
  ];

  A.vista('campanas', {
    permiso: 'campanas',
    render: function (cont) {
      var lista = el('div', { class: 'card', style: 'margin-top:18px' });
      cont.appendChild(A.cabecera('Marketing', 'Campañas', 'por etiqueta', [
        el('button', { class: 'btn btn-dark btn-sm', type: 'button', onclick: function () { editar(null, null, cargar); } }, [A.icon('i-plus'), el('span', { text: 'Nueva campaña' })])
      ]));
      cont.appendChild(el('div', { class: 'gallery', style: 'grid-template-columns:repeat(auto-fill,minmax(240px,1fr))' }, MODELOS.map(function (mo) {
        return el('button', { type: 'button', class: 'g-card', style: 'padding:18px', onclick: function () { editar(null, mo, cargar); } }, [
          el('span', { class: 'ti-ico' }, [A.icon('i-sparkles', 'icon-sm')]), el('b', { style: 'margin-top:10px', text: mo.n }), el('span', { class: 'muted', style: 'font-size:12.5px', text: 'Usar esta plantilla' })
        ]);
      })));
      cont.appendChild(lista);
      function cargar() {
        sb.from('campanas').select('*').order('created_at', { ascending: false }).then(function (r) {
          lista.innerHTML = '';
          lista.appendChild(el('h3', { class: 't', text: 'Tus campañas' }));
          if (!(r.data || []).length) lista.appendChild(el('div', { class: 'muted', text: 'Aún no hay campañas. Empieza con una plantilla.' }));
          (r.data || []).forEach(function (c) {
            lista.appendChild(el('button', { type: 'button', class: 'saldo', onclick: function () { editar(c, null, cargar); } }, [
              el('div', null, [el('b', { text: c.nombre }), el('div', { class: 'muted', text: EST[c.estado] + (c.destinatarios ? ' · ' + c.destinatarios + ' destinatarios' : '') + ' · ' + A.fecha(c.created_at) })]),
              el('span', { class: 'pill ' + (c.estado === 'borrador' ? 'pendiente' : 'completado'), text: EST[c.estado] })
            ]));
          });
        });
      }
      cargar();
    }
  });

  async function editar(c, modelo, alGuardar) {
    var nueva = !c; c = c || {};
    var f = c.filtro || (modelo && modelo.f) || {};
    var soloLectura = c.estado && c.estado !== 'borrador';
    var m = A.modal({
      titulo: nueva ? 'Nueva campaña' : c.nombre, ok: soloLectura ? 'Cerrar' : 'Guardar borrador',
      campos: [
        { k: 'nombre', label: 'Nombre', required: true, full: true, max: 120, value: c.nombre || (modelo && modelo.n) },
        { k: 'etiquetas', label: 'Etiquetas (separadas por coma)', value: (f.etiquetas || []).join(', '), placeholder: 'VIP, taxes 2025' },
        { k: 'origen', label: 'Origen', type: 'select', value: f.origen || '', options: [['', 'Cualquiera']].concat(Object.keys(A.ORIGENES).map(function (k) { return [k, A.ORIGENES[k]]; })) },
        { k: 'servicio', label: 'Que tenga el servicio', type: 'select', value: f.servicio || '', options: [['', 'Cualquiera']].concat(A.serviciosVisibles().map(function (k) { return [k, A.SERVICIOS[k].label]; })) },
        { k: 'sin_servicio', label: 'Que NO tenga el servicio', type: 'select', value: f.sin_servicio || '', options: [['', 'No filtrar']].concat(A.serviciosVisibles().map(function (k) { return [k, A.SERVICIOS[k].label]; })) },
        { k: 'taxes_anio', label: 'Clientes de taxes del año', type: 'number', value: f.taxes_anio || '', placeholder: String(anioAnterior) },
        { k: 'programada_para', label: 'Enviar desde (opcional)', type: 'date', value: c.programada_para ? c.programada_para.slice(0, 10) : '' },
        { k: 'mensaje', label: 'Mensaje (usa {nombre})', type: 'textarea', full: true, required: true, max: 1500, value: c.mensaje || (modelo && modelo.m) }
      ],
      extra: el('div', { style: 'margin-top:14px' }, [el('div', { class: 'alert ok', id: 'camp-count' }, [A.icon('i-users', 'icon-sm'), 'Calculando destinatarios…'])]),
      guardar: async function (d, aviso) {
        if (soloLectura) return true;
        var row = filaDe(d);
        var r = nueva ? await sb.from('campanas').insert(row).select('id').single() : await sb.from('campanas').update(row).eq('id', c.id).select('id').single();
        if (r.error) { A.msg(aviso, 'No se pudo guardar.'); return false; }
        A.toast('Campaña guardada.'); alGuardar();
      },
      borrar: nueva || soloLectura ? null : async function () { await sb.from('campanas').delete().eq('id', c.id); alGuardar(); }
    });
    function filaDe(d) {
      return { nombre: d.nombre, mensaje: d.mensaje, programada_para: d.programada_para ? new Date(d.programada_para + 'T15:00:00Z').toISOString() : null,
        filtro: { etiquetas: d.etiquetas ? String(d.etiquetas).split(',').map(function (x) { return x.trim(); }).filter(Boolean) : [], origen: d.origen || '', servicio: d.servicio || '', sin_servicio: d.sin_servicio || '', taxes_anio: d.taxes_anio ? String(d.taxes_anio) : '' } };
    }
    function leer() { var d = {}; Object.keys(m.inputs).forEach(function (k) { d[k] = m.inputs[k].value.trim(); }); return d; }
    var contar = async function () {
      var box = document.getElementById('camp-count');
      if (!box) return;
      var r = await sb.rpc('contar_campana', { p_filtro: filaDe(leer()).filtro });
      box.lastChild.textContent = r.error ? 'No se pudo calcular.' : r.data + (r.data === 1 ? ' cliente recibirá' : ' clientes recibirán') + ' este mensaje (solo los que tienen teléfono).';
    };
    ['etiquetas', 'origen', 'servicio', 'sin_servicio', 'taxes_anio'].forEach(function (k) { m.inputs[k].addEventListener('change', contar); });
    contar();
    if (soloLectura) Object.keys(m.inputs).forEach(function (k) { m.inputs[k].disabled = true; });
    if (!nueva && c.estado === 'borrador') {
      var b = el('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: async function () {
        var d = leer();
        await sb.from('campanas').update(filaDe(d)).eq('id', c.id);
        if (!confirm('¿Preparar los mensajes de esta campaña? Quedarán en Mensajes → «Por enviar».')) return;
        var r = await sb.rpc('encolar_campana', { p_id: c.id });
        if (r.error) { A.toast('No se pudo preparar.', 'error'); return; }
        A.toast(r.data + ' mensajes listos en «Por enviar».');
        m.cerrar(); alGuardar(); A.contarBandeja && A.contarBandeja();
      } }, [A.icon('i-send'), el('span', { text: 'Preparar envío' })]);
      document.querySelector('.modal-foot').insertBefore(b, document.querySelector('.modal-foot button[type=submit]'));
    }
  }
})();
