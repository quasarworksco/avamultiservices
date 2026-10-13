/* Panel CRM — Clientes: lista y ficha */
(function () {
  'use strict';
  var A = window.AVA, el = A.el, sb = A.sb;

  var filas = [];
  var filtro = { q: '', servicio: '' };
  var ui = {};

  /* Busca un cliente con el mismo correo o teléfono */
  A.buscarDuplicado = async function (email, telefono, exceptoId) {
    var r = await sb.from('clientes').select('id,nombre,apellidos,email,telefono').limit(5000);
    if (r.error || !r.data) return null;
    var e = String(email || '').trim().toLowerCase();
    var t = A.soloDigitos(telefono).slice(-10);
    return r.data.filter(function (c) {
      if (c.id === exceptoId) return false;
      return (e && String(c.email || '').toLowerCase() === e) || (t.length >= 7 && A.soloDigitos(c.telefono).slice(-10) === t);
    })[0] || null;
  };

  function camposCliente(c) {
    c = c || {};
    return [
      { k: 'nombre', label: 'Nombre', required: true, value: c.nombre, max: 120 },
      { k: 'apellidos', label: 'Apellidos', value: c.apellidos, max: 120 },
      { k: 'telefono', label: 'Teléfono', type: 'tel', value: c.telefono, max: 40 },
      { k: 'email', label: 'Correo', type: 'email', value: c.email },
      { k: 'fecha_nacimiento', label: 'Fecha de nacimiento', type: 'date', value: c.fecha_nacimiento },
      { k: 'origen', label: '¿Cómo llegó?', type: 'select', value: c.origen || 'whatsapp', options: Object.keys(A.ORIGENES).map(function (k) { return [k, A.ORIGENES[k]]; }) },
      { k: 'idioma', label: 'Idioma', type: 'select', value: c.idioma || 'es', options: [['es', 'Español'], ['en', 'Inglés']] },
      { k: 'etiquetas', label: 'Etiquetas (separadas por coma)', value: (c.etiquetas || []).join(', '), placeholder: 'VIP, referido de Carmen' },
      { k: 'direccion', label: 'Dirección', full: true, value: c.direccion, max: 300 },
      { k: 'ciudad', label: 'Ciudad', value: c.ciudad, max: 120 },
      { k: 'region', label: 'Estado', value: c.region, max: 80, placeholder: 'TX' },
      { k: 'codigo_postal', label: 'Código postal', value: c.codigo_postal, max: 20 }
    ];
  }
  function limpiar(d) {
    d.etiquetas = d.etiquetas ? d.etiquetas.split(',').map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 20) : [];
    return d;
  }

  A.nuevoCliente = function (alCrear) {
    var campos = camposCliente();
    campos.push({ k: 'notas', label: 'Notas', type: 'textarea', full: true, placeholder: 'Qué necesita, cómo te contactó…' });
    A.modal({
      titulo: 'Nuevo cliente', ok: 'Crear cliente', campos: campos,
      guardar: async function (d, aviso) {
        var dup = await A.buscarDuplicado(d.email, d.telefono);
        if (dup && !confirm('Ya existe un cliente con ese correo o teléfono: ' + A.nombreDe(dup) + '. ¿Crear otro de todas formas?')) {
          A.ir('clientes/' + dup.id); return true;
        }
        var r = await sb.from('clientes').insert(limpiar(d)).select('id').single();
        if (r.error) { A.msg(aviso, 'No se pudo crear el cliente. Revisa los datos.'); return false; }
        A.toast('Cliente creado.');
        if (alCrear) alCrear(r.data.id); else A.ir('clientes/' + r.data.id);
      }
    });
  };

  function editarCliente(c, alGuardar) {
    A.modal({
      titulo: 'Editar cliente', campos: camposCliente(c),
      guardar: async function (d, aviso) {
        var r = await sb.from('clientes').update(limpiar(d)).eq('id', c.id).select('*').single();
        if (r.error) { A.msg(aviso, 'No se pudo guardar.'); return false; }
        A.toast('Datos guardados.');
        alGuardar(r.data);
      },
      borrar: async function () {
        var r = await sb.from('clientes').delete().eq('id', c.id);
        if (r.error) { A.toast('No se pudo eliminar.', 'error'); return false; }
        A.toast('Cliente eliminado.');
        A.ir('clientes');
      },
      borrarTexto: 'Eliminar cliente',
      borrarConfirm: '¿Eliminar a ' + A.nombreDe(c) + ' y todos sus casos? Esta acción no se puede deshacer.'
    });
  }

  function chipsServicios(casos) {
    var vistos = {};
    return el('span', { class: 'chips' }, (casos || []).filter(function (k) {
      if (k.estado === 'cancelado' || vistos[k.servicio]) return false;
      return (vistos[k.servicio] = true);
    }).map(function (k) {
      return el('span', { class: 'chip-s', 'data-svc': k.servicio }, [el('i'), A.SERVICIOS[k.servicio].corto]);
    }));
  }

  /* ---------- Lista ---------- */
  A.vista('clientes', {
    permiso: 'clientes',
    render: function (cont, params) {
      if (params[0]) { ficha(cont, params[0]); return; }
      ui.stats = el('div', { class: 'stats' });
      ui.list = el('div', { class: 'list' });
      var sel = el('select', { class: 'input', 'aria-label': 'Servicio', onchange: function () { filtro.servicio = this.value; pintar(); } },
        [el('option', { value: '', text: 'Todos los servicios' })].concat(Object.keys(A.SERVICIOS).map(function (k) { return el('option', { value: k, text: A.SERVICIOS[k].label }); })));
      sel.value = filtro.servicio;
      cont.appendChild(A.cabecera('Tu cartera', 'Clientes', 'de AVA', [
        el('button', { class: 'btn btn-ghost btn-sm', onclick: exportar }, [A.icon('i-download'), el('span', { text: 'Exportar' })]),
        el('button', { class: 'btn btn-dark btn-sm', onclick: function () { A.nuevoCliente(); } }, [A.icon('i-plus'), el('span', { text: 'Nuevo cliente' })])
      ]));
      cont.appendChild(ui.stats);
      cont.appendChild(el('div', { class: 'tools' }, [
        el('input', { class: 'input search', type: 'search', placeholder: 'Buscar por nombre, correo, teléfono o etiqueta', value: filtro.q, oninput: function () { filtro.q = this.value; pintar(); } }),
        sel
      ]));
      cont.appendChild(ui.list);
      cargar();
    }
  });

  async function cargar() {
    ui.list.innerHTML = '';
    ui.list.appendChild(el('div', { class: 'empty', text: 'Cargando…' }));
    var r = await sb.from('clientes').select('*, casos(id,servicio,estado,etapa)').order('created_at', { ascending: false }).limit(5000);
    if (r.error) { ui.list.innerHTML = ''; ui.list.appendChild(el('div', { class: 'empty', text: 'No se pudieron cargar los clientes.' })); return; }
    filas = r.data || [];
    pintar();
  }

  function pintar() {
    var mes = new Date(); mes.setDate(1); mes.setHours(0, 0, 0, 0);
    var activos = filas.filter(function (c) { return (c.casos || []).some(function (k) { return k.estado === 'activo'; }); }).length;
    var stats = [
      [filas.length, 'Clientes'],
      [filas.filter(function (c) { return new Date(c.created_at) >= mes; }).length, 'Nuevos este mes'],
      [activos, 'Con casos activos'],
      [filas.filter(function (c) { return !(c.casos || []).length; }).length, 'Sin casos']
    ];
    ui.stats.innerHTML = '';
    stats.forEach(function (s) { ui.stats.appendChild(el('div', { class: 'stat', style: 'cursor:default' }, [el('div', { class: 'k', text: s[0] }), el('div', { class: 'l', text: s[1] })])); });

    var q = filtro.q.toLowerCase();
    var vis = filas.filter(function (c) {
      if (filtro.servicio && !(c.casos || []).some(function (k) { return k.servicio === filtro.servicio; })) return false;
      return !q || [A.nombreDe(c), c.email, c.telefono, A.soloDigitos(c.telefono), (c.etiquetas || []).join(' '), c.ciudad].join(' ').toLowerCase().indexOf(q) !== -1;
    });
    var list = ui.list;
    list.innerHTML = '';
    list.appendChild(el('div', { class: 'row cli head' }, [
      el('span', { text: 'Cliente' }), el('span', { class: 'hide-m', text: 'Correo' }), el('span', { class: 'hide-m', text: 'Servicios' }),
      el('span', { class: 'hide-m', text: 'Origen' }), el('span', { text: 'Desde' })
    ]));
    if (!vis.length) {
      list.appendChild(el('div', { class: 'empty' }, filas.length ? ['No hay resultados con esos filtros.'] : [
        el('b', { text: 'Tu primera ficha te espera' }), 'Crea un cliente o convierte una solicitud del sitio en cliente.'
      ]));
      return;
    }
    vis.forEach(function (c) {
      list.appendChild(el('a', { class: 'row cli', href: '#/clientes/' + c.id }, [
        el('span', { class: 'who-cell' }, [el('span', { class: 'avatar', text: A.iniciales(A.nombreDe(c)) }), el('div', null, [el('div', { class: 'name', text: A.nombreDe(c) }), el('div', { class: 'muted', text: c.telefono || '' })])]),
        el('span', { class: 'muted hide-m', text: c.email || '—' }),
        el('span', { class: 'hide-m' }, [chipsServicios(c.casos)]),
        el('span', { class: 'muted hide-m', text: A.ORIGENES[c.origen] || '' }),
        el('span', { class: 'muted', text: A.fecha(c.created_at) })
      ]));
    });
  }

  function exportar() {
    A.csv('clientes', [
      ['Creado', function (c) { return A.fecha(c.created_at); }], ['Nombre', 'nombre'], ['Apellidos', 'apellidos'], ['Correo', 'email'],
      ['Teléfono', 'telefono'], ['Ciudad', 'ciudad'], ['Estado', 'region'], ['Origen', function (c) { return A.ORIGENES[c.origen]; }],
      ['Servicios', function (c) { return (c.casos || []).map(function (k) { return A.SERVICIOS[k.servicio].corto + ' (' + k.etapa + ')'; }).join('; '); }],
      ['Etiquetas', function (c) { return (c.etiquetas || []).join(', '); }]
    ], filas);
  }

  /* ---------- Ficha ---------- */
  async function ficha(cont, id) {
    cont.appendChild(el('div', { class: 'empty', text: 'Cargando ficha…' }));
    var r = await sb.from('clientes').select('*, casos(*)').eq('id', id).maybeSingle();
    cont.innerHTML = '';
    cont.appendChild(el('a', { class: 'back', href: '#/clientes' }, [A.icon('i-chevron-left', 'icon-sm'), 'Clientes']));
    if (r.error || !r.data) { cont.appendChild(el('div', { class: 'empty' }, [el('b', { text: 'No encontramos este cliente' }), 'Puede que se haya eliminado.'])); return; }
    pintarFicha(cont, r.data);
  }

  function pintarFicha(cont, c) {
    var back = cont.firstChild;
    cont.innerHTML = '';
    cont.appendChild(back);
    var tel = A.soloDigitos(c.telefono);
    var wa = tel.length === 10 ? '1' + tel : tel;
    var recargar = function () { cont.innerHTML = ''; cont.appendChild(back); ficha(cont, c.id); };

    cont.appendChild(el('div', { class: 'ph' }, [
      el('div', { class: 'profile' }, [
        el('span', { class: 'avatar', text: A.iniciales(A.nombreDe(c)) }),
        el('div', null, [
          el('div', { class: 'kicker', text: 'Cliente desde ' + A.fecha(c.created_at) }),
          el('h1', { text: A.nombreDe(c) }),
          (c.etiquetas || []).length ? el('div', { class: 'chips', style: 'margin-top:8px' }, c.etiquetas.map(function (t) { return el('span', { class: 'chip-s', text: t }); })) : null
        ])
      ]),
      el('div', { class: 'acts' }, [
        el('button', { class: 'btn btn-ghost btn-sm', onclick: function () { editarCliente(c, function (n) { Object.assign(c, n); pintarFicha(cont, c); }); } }, [A.icon('i-edit'), el('span', { text: 'Editar' })]),
        A.puede('casos') ? el('button', { class: 'btn btn-dark btn-sm', onclick: function () { A.editarCaso(null, { cliente_id: c.id }, recargar); } }, [A.icon('i-plus'), el('span', { text: 'Nuevo caso' })]) : null
      ])
    ]));

    cont.appendChild(el('div', { class: 'quick' }, [
      tel.length >= 7 ? el('a', { href: 'https://wa.me/' + wa, target: '_blank', rel: 'noopener' }, [A.icon('i-whatsapp'), 'WhatsApp']) : null,
      tel.length >= 7 ? el('a', { href: 'tel:+' + wa }, [A.icon('i-phone'), 'Llamar']) : null,
      c.email ? el('a', { href: 'mailto:' + c.email }, [A.icon('i-mail'), 'Correo']) : null,
      c.solicitud_id && A.puede('solicitudes') ? el('a', { href: '#/solicitudes/' + c.solicitud_id }, [A.icon('i-inbox'), 'Ver solicitud original']) : null
    ]));

    // Casos
    var casos = (c.casos || []).slice().sort(function (a, b) { return (a.estado === 'activo' ? 0 : 1) - (b.estado === 'activo' ? 0 : 1) || new Date(b.created_at) - new Date(a.created_at); });
    var casosCard = el('div', { class: 'card' }, [el('div', { class: 'card-h' }, [el('h3', { class: 't', text: 'Casos · ' + casos.length })])]);
    if (!casos.length) casosCard.appendChild(el('div', { class: 'muted', text: 'Este cliente aún no tiene casos. Crea uno para darle seguimiento.' }));
    casos.forEach(function (k) {
      var s = A.SERVICIOS[k.servicio], idx = s.etapas.indexOf(k.etapa);
      casosCard.appendChild(el('button', { class: 'caso', type: 'button', 'data-svc': k.servicio, onclick: function () { if (A.puede('casos')) A.editarCaso(k, null, recargar); } }, [
        el('div', { class: 'top' }, [el('b', { text: k.titulo || s.label }), el('span', { class: 'pill ' + k.estado, text: { activo: 'Activo', completado: 'Completado', cancelado: 'Cancelado' }[k.estado] })]),
        el('div', { class: 'sub', text: [s.corto + ' · ' + k.etapa, k.precio != null ? A.dinero(k.precio) : '', k.fecha_entrega ? 'Entrega ' + A.fecha(k.fecha_entrega) : ''].filter(Boolean).join(' · ') }),
        el('div', { class: 'steps' }, s.etapas.map(function (_, i) { return el('i', { class: i <= idx ? 'done' : '' }); }))
      ]));
    });

    // Notas
    var notas = el('textarea', { class: 'input', placeholder: 'Anota llamadas, acuerdos y pendientes de este cliente…', style: 'min-height:140px' });
    notas.value = c.notas || '';
    var notasCard = el('div', { class: 'card' }, [
      el('div', { class: 'card-h' }, [el('h3', { class: 't', text: 'Notas' }), el('button', { class: 'mini-btn', type: 'button', text: 'Guardar notas', onclick: async function () {
        var r = await sb.from('clientes').update({ notas: notas.value.trim() || null }).eq('id', c.id);
        A.toast(r.error ? 'No se pudieron guardar las notas.' : 'Notas guardadas.', r.error ? 'error' : '');
        if (!r.error) c.notas = notas.value.trim();
      } })]),
      notas
    ]);

    // Datos
    var dl = el('dl', { class: 'kv', style: 'grid-template-columns:120px 1fr' });
    [['Teléfono', c.telefono], ['Correo', c.email], ['Nacimiento', A.fecha(c.fecha_nacimiento)], ['Dirección', [c.direccion, c.ciudad, c.region, c.codigo_postal].filter(Boolean).join(', ')],
      ['Idioma', c.idioma === 'en' ? 'Inglés' : 'Español'], ['Llegó por', A.ORIGENES[c.origen]]].forEach(function (p) {
      dl.appendChild(el('dt', { text: p[0] })); dl.appendChild(el('dd', { text: p[1] || '—' }));
    });
    var derecha = [el('div', { class: 'card' }, [el('h3', { class: 't', text: 'Datos de contacto' }), dl])];

    if (c.solicitud_id && A.puede('solicitudes')) {
      var docsCard = el('div', { class: 'card' }, [el('div', { class: 'muted', text: 'Cargando documentos…' })]);
      derecha.push(docsCard);
      sb.from('solicitudes').select('id,documentos').eq('id', c.solicitud_id).maybeSingle().then(function (s) {
        docsCard.innerHTML = '';
        if (s.data) docsCard.appendChild(A.documentosSolicitud(s.data));
        else docsCard.appendChild(el('div', { class: 'muted', text: 'La solicitud original ya no existe.' }));
      });
    }
    if (A.puede('equipo')) {
      var act = el('div', { class: 'card' }, [el('h3', { class: 't', text: 'Actividad' })]);
      derecha.push(act);
      var ids = [c.id].concat(casos.map(function (k) { return k.id; }));
      sb.from('actividad').select('*').in('entidad_id', ids).order('created_at', { ascending: false }).limit(15).then(function (r) {
        var tl = el('div', { class: 'timeline' });
        (r.data || []).forEach(function (a) {
          tl.appendChild(el('div', { class: 'tl-i' }, [el('div', null, [(a.usuario || 'Alguien') + ' ' + a.accion + ' ' + (a.entidad === 'casos' ? 'el caso ' + A.resumenCaso(a.resumen) : 'la ficha'), el('span', { text: A.hace(a.created_at) })])]));
        });
        if (!(r.data || []).length) tl.appendChild(el('div', { class: 'muted', text: 'Sin actividad registrada.' }));
        act.appendChild(tl);
      });
    }

    cont.appendChild(el('div', { class: 'cols' }, [el('div', null, [casosCard, notasCard]), el('div', null, derecha)]));
  }
})();
