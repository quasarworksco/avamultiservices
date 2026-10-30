/* Panel CRM — Formularios › Contratos: plantillas de contrato editables y contratos enviados a firmar */
(function () {
  'use strict';
  var A = window.AVA, el = A.el, sb = A.sb;
  var BASE = 'https://avamultiservices.com/';
  var EST = { borrador: 'Borrador', enviado: 'Por firmar', firmado: 'Firmado', anulado: 'Anulado' };
  var PILL = { borrador: 'archivado', enviado: 'pendiente', firmado: 'completado', anulado: 'archivado' };
  // Variables que se llenan solas con la ficha del cliente
  var AUTO = { nombre: 'Nombre completo', direccion: 'Dirección', ciudad_estado_zip: 'Ciudad, estado y ZIP', fecha_nacimiento: 'Fecha de nacimiento', telefono: 'Teléfono', email: 'Correo', fecha: 'Fecha de hoy' };
  // Variables que se preguntan al crear el contrato
  var PREGUNTAR = { pago: 'Condiciones de pago', servicio: 'Servicio', monto_consulta: 'Monto de la consulta y revisión inicial', esquema_pago: 'Esquema de pago por etapas' };
  var VACIO = '__________';

  /* ---------- Plantillas ---------- */
  // La primera vez copia las plantillas originales a la base
  A.plantillasContrato = async function () {
    var r = await sb.from('contrato_plantillas').select('*').order('orden').order('created_at');
    if (r.error) return [];
    if (!r.data.length && window.AVA_PLANTILLAS_CONTRATO) {
      var ins = await sb.from('contrato_plantillas').insert(window.AVA_PLANTILLAS_CONTRATO.map(function (p) { return { clave: p.clave, titulo: p.titulo, servicio: p.servicio, contenido: p.contenido, orden: p.orden }; })).select('*');
      if (!ins.error) return ins.data;
    }
    return r.data;
  };
  A.variablesContrato = function (texto) {
    var v = {};
    String(texto || '').replace(/\{([a-z_]+)\}/g, function (_, k) { v[k] = 1; });
    return Object.keys(v);
  };
  // Llena el texto con los datos del cliente y lo que se preguntó
  A.llenarContrato = function (texto, c, extra) {
    var ciudad = [c.ciudad, [c.region, c.codigo_postal].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    var datos = {
      nombre: A.nombreDe(c), direccion: c.direccion, ciudad_estado_zip: ciudad, fecha_nacimiento: c.fecha_nacimiento ? A.fecha(c.fecha_nacimiento) : '',
      telefono: c.telefono, email: c.email, fecha: A.fecha(A.hoyISO())
    };
    Object.keys(extra || {}).forEach(function (k) { if (extra[k]) datos[k] = extra[k]; });
    return String(texto || '').replace(/\{([a-z_]+)\}/g, function (todo, k) { return datos[k] ? String(datos[k]) : (k in AUTO || k in PREGUNTAR ? VACIO : todo); });
  };
  A.PREGUNTAR_CONTRATO = PREGUNTAR;

  A.pestanasFormularios = function (activa) {
    return el('div', { class: 'tabs', role: 'tablist', style: 'margin-top:16px' }, [['formularios', 'Formularios', 'i-clipboard'], ['contratos', 'Contratos', 'i-edit']].map(function (t) {
      return el('a', { class: 'tab' + (t[0] === activa ? ' on' : ''), role: 'tab', 'aria-selected': String(t[0] === activa), href: '#/' + t[0] }, [A.icon(t[2], 'icon-sm'), el('span', { text: t[1] })]);
    }));
  };

  A.vista('contratos', {
    permiso: 'solicitudes',
    render: function (cont, partes) {
      if (partes[0]) { editor(cont, partes[0]); return; }
      lista(cont);
    }
  });

  async function lista(cont) {
    cont.appendChild(A.cabecera('Formularios', 'Contratos', 'con firma', [
      el('a', { class: 'btn btn-dark btn-sm', href: '#/contratos/nueva' }, [A.icon('i-plus'), el('span', { text: 'Nueva plantilla' })])
    ]));
    cont.appendChild(A.pestanasFormularios('contratos'));
    cont.appendChild(el('div', { class: 'alert ok', style: 'margin-top:14px' }, [A.icon('i-sparkles', 'icon-sm'),
      'Aquí escribes tus contratos completos, del largo que quieras. Para mandarlo a firmar, entra a la ficha del cliente → Contratos → Nuevo contrato: se llena solo con sus datos y el cliente lo firma desde el celular.']));
    var grid = el('div', { class: 'fm-grid' }, [el('div', { class: 'empty', text: 'Cargando…' })]);
    var enviados = el('div', { class: 'list' });
    cont.append(grid, el('h3', { class: 'ct-h', text: 'Contratos enviados' }), enviados);
    var r = await Promise.all([A.plantillasContrato(), sb.from('contratos').select('id,titulo,estado,token,created_at,enviado_at,firmado_at,firmado_nombre,cliente_id, clientes(id,nombre,apellidos)').neq('estado', 'borrador').order('created_at', { ascending: false }).limit(300)]);
    grid.innerHTML = '';
    r[0].forEach(function (p, i) {
      var vars = A.variablesContrato(p.contenido);
      var palabras = String(p.contenido).split(/\s+/).filter(Boolean).length;
      grid.appendChild(el('div', { class: 'fm-card' + (p.activo ? '' : ' off'), style: 'animation-delay:' + Math.min(i * 50, 400) + 'ms', 'data-svc': p.servicio || 'otro' }, [
        el('div', { class: 'fm-top' }, [el('span', { class: 'fm-ico' }, [A.icon('i-edit', 'icon-sm')]), el('div', { class: 'fm-tt' }, [el('b', { text: p.titulo }),
          el('span', { class: 'muted', text: palabras + ' palabras' + (p.servicio && A.SERVICIOS[p.servicio] ? ' · ' + A.SERVICIOS[p.servicio].corto : '') + (p.activo ? '' : ' · oculta') })])]),
        vars.length ? el('div', { class: 'chips' }, vars.slice(0, 8).map(function (v) { return el('span', { class: 'chip-s', text: '{' + v + '}' }); })) : el('p', { class: 'muted', style: 'font-size:12.5px', text: 'Sin datos automáticos del cliente.' }),
        el('div', { class: 'fm-acc' }, [
          el('a', { class: 'btn btn-dark btn-sm', href: '#/contratos/' + p.id }, [A.icon('i-edit', 'icon-sm'), el('span', { text: 'Editar' })]),
          el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: function () { vistaPrevia(p.titulo, p.contenido); } }, [A.icon('i-eye', 'icon-sm'), el('span', { text: 'Ver' })]),
          el('button', { class: 'btn btn-ghost btn-sm', type: 'button', title: 'Enlace para que cualquier cliente llene sus datos y firme', onclick: function () { compartir(p); } }, [A.icon('i-copy', 'icon-sm'), el('span', { text: 'Copiar enlace' })])
        ])
      ]));
    });
    if (!r[0].length) grid.appendChild(el('div', { class: 'empty fm-vacio' }, [el('b', { text: 'Sin plantillas' }), 'Crea tu primer contrato con «Nueva plantilla».']));

    var ks = (r[1].data || []);
    enviados.appendChild(el('div', { class: 'row ct head' }, [el('span', { text: 'Cliente' }), el('span', { class: 'hide-m', text: 'Contrato' }), el('span', { class: 'hide-m', text: 'Enviado' }), el('span', { text: 'Estado' })]));
    if (!ks.length) enviados.appendChild(el('div', { class: 'empty', text: 'Todavía no has mandado contratos a firmar.' }));
    ks.forEach(function (k) {
      enviados.appendChild(el('a', { class: 'row ct', href: BASE + 'firmar/?t=' + k.token, target: '_blank', rel: 'noopener' }, [
        el('span', { class: 'who-cell' }, [el('span', { class: 'avatar', text: A.iniciales(A.nombreDe(k.clientes || {}) || '?') }), el('div', null, [el('div', { class: 'name', text: A.nombreDe(k.clientes || {}) || 'Cliente' }), el('div', { class: 'muted', text: k.firmado_at ? 'Firmó ' + A.fecha(k.firmado_at) : '' })])]),
        el('span', { class: 'muted hide-m', text: k.titulo }),
        el('span', { class: 'muted hide-m', text: A.fecha(k.enviado_at || k.created_at) }),
        el('span', null, [el('span', { class: 'pill ' + PILL[k.estado], text: EST[k.estado] })])
      ]));
    });
  }

  /* ---------- Enlace para compartir ---------- */
  // Un solo enlace por plantilla: el cliente llena sus datos, lo firma y queda en su ficha
  A.urlContratoPublico = function (p) { return BASE + 'firmar/?p=' + p.token; };
  function copiar(url, texto) {
    var ok = function () { A.toast(texto || 'Enlace copiado. Pégalo en WhatsApp, Instagram o donde quieras.'); };
    var mal = function () { window.prompt('Copia este enlace:', url); };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(ok, mal); else mal();
  }
  function faltanValores(p) {
    var v = p.valores || {};
    return A.variablesContrato(p.contenido).filter(function (k) { return k in PREGUNTAR && !String(v[k] || '').trim(); });
  }
  function compartir(p) {
    if (!p.activo) { A.toast('Esta plantilla está oculta. Entra a Editar y marca «Disponible para mandar a firmar».', 'error'); return; }
    if (p.enlace_activo === false) { A.toast('El enlace de esta plantilla está apagado. Actívalo en Editar.', 'error'); return; }
    var falta = faltanValores(p);
    if (!falta.length) { copiar(A.urlContratoPublico(p)); return; }
    // Lo que normalmente se pregunta al crear el contrato se deja fijo para el enlace
    A.modal({
      titulo: 'Antes de compartir', ok: 'Guardar y copiar enlace',
      extra: el('p', { class: 'muted', style: 'font-size:13px;margin-top:10px', text: 'Esto queda escrito igual para todos los que firmen con el enlace. Lo puedes cambiar después en Editar.' }),
      campos: falta.map(function (k) { return { k: k, label: PREGUNTAR[k], full: true, max: 500, required: true, type: 'textarea', value: (p.valores || {})[k] || '' }; }),
      guardar: async function (d, aviso) {
        var valores = Object.assign({}, p.valores || {}, d);
        var r = await sb.from('contrato_plantillas').update({ valores: valores }).eq('id', p.id);
        if (r.error) { A.msg(aviso, 'No se pudo guardar.'); return false; }
        p.valores = valores;
        copiar(A.urlContratoPublico(p));
      }
    });
  }

  function vistaPrevia(titulo, texto) {
    A.modal({ titulo: titulo, ok: 'Cerrar', campos: [], guardar: function () { }, extra: el('div', { class: 'fx-doc fx-modal', html: window.AVA_FORMATO(texto) }) });
  }

  /* ---------- Editor ---------- */
  async function editor(cont, id) {
    var p = { titulo: '', servicio: null, contenido: '# 1. Servicios\nDescribe aquí los servicios.\n\n# 2. Pago\n{pago}\n\nAl firmar, el Cliente confirma que leyó y acepta este contrato.', activo: true };
    if (id !== 'nueva') {
      var r = await sb.from('contrato_plantillas').select('*').eq('id', id).maybeSingle();
      if (!r.data) { cont.appendChild(el('div', { class: 'empty', text: 'No encontramos esta plantilla.' })); return; }
      p = r.data;
    }
    var original = p.clave && (window.AVA_PLANTILLAS_CONTRATO || []).filter(function (x) { return x.clave === p.clave; })[0];
    var sucio = false;
    cont.appendChild(el('a', { class: 'back', href: '#/contratos' }, [A.icon('i-chevron-left', 'icon-sm'), 'Contratos']));
    var titulo = el('input', { class: 'input', maxlength: 160, value: p.titulo, placeholder: 'Por ejemplo: Contrato de reparación de crédito' });
    var serv = el('select', { class: 'input sm' }, [el('option', { value: '', text: 'Cualquier servicio' })].concat(A.serviciosVisibles().map(function (k) { return el('option', { value: k, text: A.SERVICIOS[k].label }); })));
    serv.value = p.servicio || '';
    var activo = el('input', { type: 'checkbox', checked: p.activo || null });
    var ta = el('textarea', { class: 'input ct-ta', maxlength: 30000, spellcheck: 'true' });
    ta.value = p.contenido;
    var prev = el('div', { class: 'fx-doc ct-prev' });
    var cuenta = el('span', { class: 'muted', style: 'font-size:12px' });
    function pintar() { prev.innerHTML = window.AVA_FORMATO(ta.value); cuenta.textContent = ta.value.length.toLocaleString('es-US') + ' / 30,000 caracteres'; if (typeof pintarValores === 'function') pintarValores(); }
    var t = null;
    ta.addEventListener('input', function () { sucio = true; clearTimeout(t); t = setTimeout(pintar, 200); });
    [titulo, serv, activo].forEach(function (x) { x.addEventListener('input', function () { sucio = true; }); x.addEventListener('change', function () { sucio = true; }); });
    function insertar(txt) {
      var s = ta.selectionStart, e = ta.selectionEnd;
      ta.setRangeText(txt, s, e, 'end'); ta.focus(); sucio = true; pintar();
    }
    var ayuda = el('div', { class: 'ct-ayuda' }, [
      el('div', { class: 'ct-ay-g' }, [el('b', { text: 'Formato' }),
        el('button', { type: 'button', class: 'chip-s', text: '# Título de sección', onclick: function () { insertar('\n# 1. Título\n'); } }),
        el('button', { type: 'button', class: 'chip-s', text: '## Subtítulo', onclick: function () { insertar('\n## Subtítulo\n'); } }),
        el('button', { type: 'button', class: 'chip-s', text: '- Viñeta', onclick: function () { insertar('\n- '); } }),
        el('button', { type: 'button', class: 'chip-s', text: '**Negrita**', onclick: function () { insertar('**texto**'); } }),
        el('button', { type: 'button', class: 'chip-s', text: '*Cursiva*', onclick: function () { insertar('*texto*'); } }),
        el('button', { type: 'button', class: 'chip-s', text: '> Recuadro', onclick: function () { insertar('\n> Aviso importante\n'); } })]),
      el('div', { class: 'ct-ay-g' }, [el('b', { text: 'Datos del cliente (se llenan solos)' })].concat(Object.keys(AUTO).map(function (k) {
        return el('button', { type: 'button', class: 'chip-s', title: AUTO[k], text: '{' + k + '}', onclick: function () { insertar('{' + k + '}'); } });
      }))),
      el('div', { class: 'ct-ay-g' }, [el('b', { text: 'Se preguntan al crear el contrato' })].concat(Object.keys(PREGUNTAR).map(function (k) {
        return el('button', { type: 'button', class: 'chip-s', title: PREGUNTAR[k], text: '{' + k + '}', onclick: function () { insertar('{' + k + '}'); } });
      })))
    ]);
    var guardarBtn = el('button', { class: 'btn btn-dark btn-sm', type: 'button', onclick: guardar }, [A.icon('i-check', 'icon-sm'), el('span', { text: 'Guardar' })]);
    cont.appendChild(A.cabecera('Formularios › Contratos', id === 'nueva' ? 'Nueva plantilla' : 'Editar', 'contrato', [
      original ? el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: function () {
        if (!confirm('¿Volver al texto original de esta plantilla? Se pierden los cambios que le hiciste.')) return;
        ta.value = original.contenido; titulo.value = original.titulo; sucio = true; pintar();
      } }, [A.icon('i-refresh', 'icon-sm'), el('span', { text: 'Texto original' })]) : null,
      guardarBtn
    ]));
    cont.appendChild(el('div', { class: 'card', style: 'margin-top:16px' }, [el('div', { class: 'grid2' }, [
      el('div', { class: 'field full' }, [el('label', { text: 'Título del contrato *' }), titulo]),
      el('div', { class: 'field' }, [el('label', { text: 'Servicio' }), serv]),
      el('label', { class: 'field', style: 'flex-direction:row;align-items:center;gap:10px;margin-top:22px' }, [activo, el('span', { text: 'Disponible para mandar a firmar' })])
    ])]));
    // Enlace para compartir: lo que se pregunta queda fijo y se puede apagar
    var valores = Object.assign({}, p.valores || {});
    var enlaceOn = el('input', { type: 'checkbox', checked: p.enlace_activo === false ? null : true });
    var camposValor = {};
    var filas = Object.keys(PREGUNTAR).map(function (k) {
      var inp = el('textarea', { class: 'input', rows: 2, maxlength: 500, placeholder: k === 'monto_consulta' ? 'Por ejemplo: $99' : k === 'esquema_pago' ? 'Por ejemplo: $300 cada 3 semanas, al terminar cada ronda' : '' });
      inp.value = valores[k] || '';
      inp.addEventListener('input', function () { sucio = true; });
      camposValor[k] = inp;
      return el('div', { class: 'field full', 'data-k': k }, [el('label', { text: PREGUNTAR[k] }), inp]);
    });
    var urlBox = id === 'nueva' ? el('p', { class: 'muted', style: 'font-size:13px', text: 'Guarda la plantilla para tener su enlace.' })
      : el('div', { class: 'ct-link' }, [el('code', { text: A.urlContratoPublico(p) }),
        el('button', { class: 'btn btn-dark btn-sm', type: 'button', onclick: function () {
          if (sucio) { A.toast('Guarda los cambios primero.', 'error'); return; }
          if (!enlaceOn.checked) { A.toast('Activa el enlace y guarda.', 'error'); return; }
          copiar(A.urlContratoPublico(p));
        } }, [A.icon('i-copy', 'icon-sm'), el('span', { text: 'Copiar enlace' })])]);
    var sinPreguntas = el('p', { class: 'muted', style: 'font-size:13px', text: 'Este contrato no tiene datos para preguntar: el cliente solo llena los suyos.' });
    function pintarValores() {
      var usadas = A.variablesContrato(ta.value), alguna = false;
      filas.forEach(function (f) { var u = usadas.indexOf(f.getAttribute('data-k')) !== -1; f.hidden = !u; alguna = alguna || u; });
      sinPreguntas.hidden = alguna;
    }
    enlaceOn.addEventListener('change', function () { sucio = true; });
    cont.appendChild(el('div', { class: 'card', style: 'margin-top:16px' }, [
      el('div', { class: 'ct-col-h' }, [el('b', { text: 'Enlace para compartir' })]),
      el('p', { class: 'muted', style: 'font-size:13px;margin:4px 0 12px', text: 'Mándalo por WhatsApp o redes: el cliente escribe sus datos, firma desde el celular y queda como cliente con su caso, el contrato firmado y una tarea para ti.' }),
      urlBox,
      el('label', { class: 'field', style: 'flex-direction:row;align-items:center;gap:10px;margin:12px 0' }, [enlaceOn, el('span', { text: 'Enlace activo (si lo apagas, el enlace deja de funcionar)' })]),
      el('div', { class: 'grid2' }, filas.concat([sinPreguntas]))
    ]));
    cont.appendChild(ayuda);
    cont.appendChild(el('div', { class: 'ct-edit' }, [
      el('div', { class: 'ct-col' }, [el('div', { class: 'ct-col-h' }, [el('b', { text: 'Texto' }), cuenta]), ta]),
      el('div', { class: 'ct-col' }, [el('div', { class: 'ct-col-h' }, [el('b', { text: 'Así lo verá el cliente' })]), prev])
    ]));
    if (id !== 'nueva') cont.appendChild(el('button', { class: 'link-btn danger', type: 'button', style: 'margin-top:16px', text: 'Eliminar plantilla', onclick: async function () {
      sucio = false; A.ir('contratos');
      A.conDeshacer('Plantilla «' + p.titulo + '» eliminada', async function () {
        var d = await sb.from('contrato_plantillas').delete().eq('id', id);
        if (d.error) A.toast('No se pudo eliminar la plantilla.', 'error');
        else if (location.hash === '#/contratos') A.ir('contratos');
      }, function () { A.ir('contratos/' + id); });
    } }));
    pintar();

    async function guardar() {
      Object.keys(camposValor).forEach(function (k) { var v = camposValor[k].value.trim(); if (v) valores[k] = v; else delete valores[k]; });
      var d = { titulo: titulo.value.trim(), servicio: serv.value || null, contenido: ta.value, activo: activo.checked, valores: valores, enlace_activo: enlaceOn.checked, updated_at: new Date().toISOString() };
      if (!d.titulo) { A.toast('Ponle un título al contrato.', 'error'); titulo.focus(); return; }
      if (!d.contenido.trim()) { A.toast('El contrato está vacío.', 'error'); return; }
      guardarBtn.disabled = true;
      var r = id === 'nueva' ? await sb.from('contrato_plantillas').insert(d).select('id').single() : await sb.from('contrato_plantillas').update(d).eq('id', id).select('id').single();
      guardarBtn.disabled = false;
      if (r.error) { A.toast('No se pudo guardar.', 'error'); return; }
      sucio = false; A.toast('Plantilla guardada.');
      if (id === 'nueva') { id = r.data.id; history.replaceState(null, '', '#/contratos/' + id); A.ir('contratos/' + id); }
    }
    window.addEventListener('beforeunload', function avisar(e) { if (!ta.isConnected) { window.removeEventListener('beforeunload', avisar); return; } if (sucio) { e.preventDefault(); e.returnValue = ''; } });
  }
})();
