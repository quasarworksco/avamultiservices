/* Panel CRM — Ficha del caso de crédito: la ficha de observaciones de AVA dentro del CRM.
   Junta datos del cliente, puntajes, reporte, plan de trabajo, monitor, disputas, pagos, documentos y notas.
   Lo propio de la ficha se guarda en «fichas_credito» (uso interno: el portal del cliente no la ve). */
(function () {
  'use strict';
  var A = window.AVA, el = A.el, sb = A.sb;
  var BUROS4 = [['equifax', 'Equifax'], ['experian', 'Experian'], ['transunion', 'TransUnion'], ['innovis', 'Innovis']];
  var BUROS3 = [['experian', 'Experian'], ['equifax', 'Equifax'], ['transunion', 'TransUnion']];
  var ESTADOS = ['Nuevo', 'En proceso', 'En pausa', 'Finalizado', 'Cancelado'];
  var SERVICIOS = ['Disputa de cuentas negativas', 'Eliminación de inquiries', 'Burós secundarios', 'Construcción de crédito', 'Tradeline AU', 'CreditStrong / Kikoff', 'Goodwill letter', 'Pay-for-delete', 'Validación de deuda (FDCPA)', 'Business credit (EIN)', 'Asesoría hipotecaria', 'Educación financiera'];
  var BUROS_TRABAJO = ['Equifax', 'Experian', 'TransUnion', 'Innovis', 'ChexSystems', 'LexisNexis'];
  var CARTAS = ['FCRA §611', 'FCRA §609', 'PPL / Gramm-Leach-Bliley', 'Goodwill', 'Pay-for-Delete', 'Debt Validation'];
  var PLATAFORMAS = ['SmartCredit', 'IdentityIQ', 'MyScoreIQ', 'MyFICO', 'Experian', 'Credit Karma', 'Otra'];
  var RESULTADOS = { pendiente: 'Pendiente', eliminado: 'Eliminado', corregido: 'Corregido', verificado: 'Verificado', sin_respuesta: 'Sin respuesta' };

  A.vista('ficha', {
    permiso: 'casos',
    render: function (cont, partes) { if (partes[0]) pintar(cont, partes[0]); else A.ir('casos'); }
  });

  async function pintar(cont, casoId) {
    cont.appendChild(el('div', { class: 'empty', text: 'Cargando la ficha…' }));
    var r = await Promise.all([
      sb.from('casos').select('*, clientes(*)').eq('id', casoId).maybeSingle(),
      sb.from('fichas_credito').select('datos').eq('caso_id', casoId).maybeSingle(),
      sb.from('puntajes').select('*').eq('caso_id', casoId).order('fecha'),
      sb.from('reportes_credito').select('fecha_reporte,created_at,cuentas,consultas').eq('caso_id', casoId).order('created_at', { ascending: false }).limit(1),
      sb.from('disputas').select('*').eq('caso_id', casoId).order('fecha_envio', { ascending: false }),
      sb.from('quejas_cfpb').select('*').eq('caso_id', casoId).order('fecha'),
      A.puede('cobros') ? sb.from('pagos').select('*').eq('caso_id', casoId).order('fecha', { ascending: false }) : Promise.resolve({ data: null }),
      A.equipo()
    ]);
    cont.innerHTML = '';
    var k = r[0].data;
    if (!k) { cont.appendChild(el('div', { class: 'empty' }, [el('b', { text: 'No se encontró el caso' }), el('a', { href: '#/casos', class: 'link-btn', text: 'Volver a Casos' })])); return; }
    var c = k.clientes || {};
    var fd = (r[1].data && r[1].data.datos) || {};
    var pts = r[2].data || [], rep = (r[3].data || [])[0] || null, disp = r[4].data || [], quejas = r[5].data || [], pagos = r[6].data, equipo = r[7] || [];
    var ctx = { k: k, c: c, fd: fd, pts: pts, rep: rep, disp: disp, quejas: quejas, pagos: pagos, equipo: equipo };
    fd.plan = fd.plan || {}; fd.meta = fd.meta || {}; fd.monitor = fd.monitor || {}; fd.notas = fd.notas || [];

    /* Guardado automático de la ficha */
    var estado = el('span', { class: 'fi-estado muted', text: 'Los cambios se guardan solos' });
    var espera = null, enCurso = Promise.resolve();
    function guardar() {
      clearTimeout(espera);
      estado.textContent = 'Guardando…';
      espera = setTimeout(function () {
        enCurso = sb.from('fichas_credito').upsert({ caso_id: k.id, datos: fd, updated_at: new Date().toISOString() }).then(function (u) {
          estado.textContent = u.error ? 'No se pudo guardar' : 'Guardado ✓';
          estado.classList.toggle('error', !!u.error);
        });
      }, 700);
    }
    function salir() { if (espera) { clearTimeout(espera); sb.from('fichas_credito').upsert({ caso_id: k.id, datos: fd, updated_at: new Date().toISOString() }); } window.removeEventListener('hashchange', salir); }
    window.addEventListener('hashchange', salir);
    function campoFicha(obj, clave, tipo, extra) {
      var inp = tipo === 'textarea' ? el('textarea', Object.assign({ class: 'input', rows: 4, maxlength: 6000 }, extra || {})) : el('input', Object.assign({ class: 'input sm', type: tipo || 'text', maxlength: 300 }, extra || {}));
      inp.value = obj[clave] != null ? obj[clave] : '';
      inp.addEventListener('input', function () { obj[clave] = inp.value; guardar(); });
      return inp;
    }
    function checks(lista, clave) {
      var sel = fd.plan[clave] = fd.plan[clave] || [];
      return el('div', { class: 'fi-checks' }, lista.map(function (t) {
        var i = el('input', { type: 'checkbox' }); i.checked = sel.indexOf(t) !== -1;
        i.addEventListener('change', function () { var p = sel.indexOf(t); if (i.checked && p === -1) sel.push(t); if (!i.checked && p !== -1) sel.splice(p, 1); guardar(); });
        return el('label', { class: 'fi-check' }, [i, el('span', { text: t })]);
      }));
    }
    function seccion(num, titulo, hijos) {
      return el('section', { class: 'fi-sec' }, [el('h2', { class: 'fi-h' }, [el('span', { text: num }), titulo])].concat(hijos));
    }
    function bloque(titulo, hijos) { return el('div', { class: 'fi-bloque' }, [el('h3', { text: titulo })].concat(hijos)); }
    function campo(label, input, full) { return el('label', { class: 'fi-campo' + (full ? ' full' : '') }, [el('span', { text: label }), input]); }

    /* Cabecera */
    cont.appendChild(el('div', { class: 'ph' }, [
      el('div', null, [el('div', { class: 'kicker', text: 'Ficha del cliente · uso interno' }), el('h1', null, [A.nombreDe(c) + ' ', el('span', { class: 'serif', text: (A.SERVICIOS[k.servicio] || {}).corto || '' })])]),
      el('div', { class: 'acts' }, [estado,
        el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: function () { A.verCaso(k.id); } }, [A.icon('i-layout'), el('span', { text: 'Abrir el caso' })]),
        el('button', { class: 'btn btn-dark btn-sm', type: 'button', onclick: function () { imprimir(ctx); } }, [A.icon('i-file'), el('span', { text: 'Imprimir ficha' })])])
    ]));

    /* 01 Datos del cliente */
    function campoCliente(clave, tipo) {
      var inp = el('input', { class: 'input sm', type: tipo || 'text', maxlength: 200 }); inp.value = c[clave] || '';
      inp.addEventListener('change', async function () {
        var cambio = {}; cambio[clave] = inp.value.trim() || null;
        var u = await sb.from('clientes').update(cambio).eq('id', c.id);
        if (u.error) { A.toast('No se pudo guardar el dato del cliente.', 'error'); return; }
        c[clave] = cambio[clave]; A.limpiarClientes(); estado.textContent = 'Guardado ✓';
      });
      return inp;
    }
    var nombre = el('div', { class: 'fi-ro', text: A.nombreDe(c) });
    var inicio = el('input', { class: 'input sm', type: 'date' }); inicio.value = k.fecha_inicio || '';
    inicio.addEventListener('change', async function () { var u = await sb.from('casos').update({ fecha_inicio: inicio.value || null }).eq('id', k.id); if (!u.error) { k.fecha_inicio = inicio.value; estado.textContent = 'Guardado ✓'; } });
    var asesor = el('select', { class: 'input sm' }, [el('option', { value: '', text: 'Sin asignar' })].concat(equipo.map(function (m) { return el('option', { value: m.user_id, text: m.nombre || m.email || 'Equipo' }); })));
    asesor.value = k.responsable || '';
    asesor.addEventListener('change', async function () { var u = await sb.from('casos').update({ responsable: asesor.value || null }).eq('id', k.id); if (!u.error) { k.responsable = asesor.value || null; estado.textContent = 'Guardado ✓'; } });
    var est = el('select', { class: 'input sm' }, ESTADOS.map(function (s) { return el('option', { value: s, text: s }); }));
    est.value = fd.estado_cliente || 'En proceso'; fd.estado_cliente = est.value;
    est.addEventListener('change', function () { fd.estado_cliente = est.value; guardar(); });

    var s1 = seccion('01', 'Datos del cliente', [
      el('div', { class: 'fi-grid' }, [
        campo('Nombre completo', nombre, true), campo('Teléfono', campoCliente('telefono', 'tel')), campo('Email', campoCliente('email', 'email')),
        campo('Dirección', campoCliente('direccion'), true), campo('Ciudad', campoCliente('ciudad')), campo('Estado', campoCliente('region')), campo('ZIP', campoCliente('codigo_postal')),
        campo('Fecha de nacimiento', campoCliente('fecha_nacimiento', 'date')), campo('Fecha inicio', inicio), campo('Estado del cliente', est), campo('Asesor', asesor)
      ]),
      bloque('Puntajes — Equifax · Experian · TransUnion · Innovis', [tablaPuntajes(ctx, guardar, campoFicha)]),
      bloque('Cuentas negativas por buró', [negativas(ctx, campoFicha)]),
      bloque('Inquiries', [inquiries(ctx), campo('Inquiries disputables', campoFicha(fd, 'inq_disputables', 'textarea', { rows: 3, placeholder: 'Cuáles se pueden disputar y por qué…' }), true)])
    ]);
    cont.appendChild(s1);

    /* 02 Diagnóstico */
    cont.appendChild(seccion('02', 'Diagnóstico inicial', [campo('Diagnóstico general del caso', campoFicha(fd, 'diagnostico', 'textarea', { rows: 6, placeholder: 'Situación del crédito, causas, oportunidades…' }), true)]));

    /* 03 Plan de trabajo */
    var prio = el('div', { class: 'fi-prio' });
    function pintarPrio() {
      prio.innerHTML = '';
      var lista = fd.plan.prioridades = fd.plan.prioridades || [];
      while (lista.length < 4) lista.push({ accion: '', buros: '', plazo: '' });
      prio.appendChild(el('div', { class: 'fi-prio-f cab' }, ['#', 'Acción a trabajar', 'Buró(s)', 'Plazo estimado', ''].map(function (t) { return el('span', { text: t }); })));
      lista.forEach(function (p, i) {
        prio.appendChild(el('div', { class: 'fi-prio-f' }, [el('span', { class: 'n', text: i + 1 }), campoFicha(p, 'accion', 'text', { placeholder: 'Ej.: Disputar colecciones de LVNV' }), campoFicha(p, 'buros', 'text', { placeholder: 'EQ · EX · TU' }), campoFicha(p, 'plazo', 'text', { placeholder: '30 días' }),
          lista.length > 4 ? el('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Quitar fila', onclick: function () { lista.splice(i, 1); guardar(); pintarPrio(); } }, [A.icon('i-x', 'icon-sm')]) : el('span')]));
      });
      prio.appendChild(el('button', { class: 'link-btn', type: 'button', text: '+ Agregar prioridad', onclick: function () { lista.push({ accion: '', buros: '', plazo: '' }); pintarPrio(); } }));
    }
    pintarPrio();
    cont.appendChild(seccion('03', 'Plan de trabajo — qué se va a trabajar', [
      bloque('Servicios incluidos', [checks(SERVICIOS, 'servicios')]),
      bloque('Burós a trabajar', [checks(BUROS_TRABAJO, 'buros')]),
      bloque('Tipo de disputa / cartas', [checks(CARTAS, 'cartas')]),
      bloque('Prioridades de trabajo', [prio]),
      campo('Notas del plan de trabajo', campoFicha(fd.plan, 'notas', 'textarea', { rows: 4 }), true)
    ]));

    /* 04 Monitor de crédito: la contraseña no se guarda aquí */
    var plat = el('select', { class: 'input sm' }, [el('option', { value: '', text: 'Elegir…' })].concat(PLATAFORMAS.map(function (p) { return el('option', { value: p, text: p }); })));
    plat.value = fd.monitor.plataforma || '';
    plat.addEventListener('change', function () { fd.monitor.plataforma = plat.value; guardar(); });
    var acceso = el('div', { class: 'fi-acceso' });
    if (A.puede('sensibles') && c.solicitud_id) {
      acceso.appendChild(el('button', { class: 'mini-btn', type: 'button', text: 'Ver acceso guardado en su solicitud', onclick: async function () {
        var v = await sb.rpc('ver_sensible', { p_id: c.solicitud_id });
        if (v.error) { A.toast('No se pudo ver el acceso.', 'error'); return; }
        acceso.innerHTML = '';
        acceso.appendChild(el('div', { class: 'fi-ro', text: (v.data && v.data.monitor_credito) || 'La solicitud no trae datos del monitor.' }));
        acceso.appendChild(el('span', { class: 'muted', text: 'Queda registrado que lo viste.' }));
      } }));
    }
    cont.appendChild(seccion('04', 'Monitor de crédito', [
      el('div', { class: 'fi-grid' }, [
        campo('Plataforma de monitoreo', plat), campo('Usuario (sin contraseña)', campoFicha(fd.monitor, 'usuario', 'text', { autocomplete: 'off' })),
        campo('Burós principales (EQ · EX · TU)', campoFicha(fd.monitor, 'principales', 'text', { placeholder: 'Ej.: los 3 activos' })), campo('Burós secundarios', campoFicha(fd.monitor, 'secundarios', 'text', { placeholder: 'Innovis, LexisNexis, ChexSystems…' }))
      ]),
      el('p', { class: 'muted fi-nota', text: 'Las contraseñas no se escriben en la ficha. Si el cliente las dio en su solicitud, quedan en los datos protegidos y solo las ve quien tiene ese permiso.' }), acceso
    ]));

    /* 05 Historial de disputas */
    cont.appendChild(seccion('05', 'Historial de disputas', [tabla(['Fecha', 'Elemento disputado', 'Buró', 'Ronda', 'Resultado'], disp.map(function (d) {
      return [A.fecha(d.fecha_envio), d.acreedor, (d.buro || '').replace(/^./, function (x) { return x.toUpperCase(); }), String(d.ronda), RESULTADOS[d.resultado] || d.resultado];
    }), 'Aún no hay disputas. Se crean al marcar las cartas como enviadas en el caso.'),
      quejas.length ? el('div', { class: 'fi-bloque' }, [el('h3', { text: 'Quejas del CFPB' }), tabla(['Ronda', 'Fecha', 'Número', 'Burós', 'Estado'], quejas.map(function (q) {
        return [String(q.ronda), A.fecha(q.fecha), q.numero || '', (q.buros || []).join(', '), { preparada: 'Preparada', enviada: 'Enviada', en_revision: 'En revisión', respondida: 'Respondida', cerrada: 'Cerrada' }[q.estado]];
      }), '')]) : null]));

    /* 06 Pagos */
    if (pagos) cont.appendChild(seccion('06', 'Seguimiento de pagos', [tabla(['Fecha', 'Concepto', 'Monto', 'Método'], pagos.map(function (p) {
      return [A.fecha(p.fecha), p.nota || 'Pago #' + p.numero, A.dinero(p.monto), (A.METODOS || {})[p.metodo] || p.metodo];
    }), 'Aún no hay pagos registrados en este caso.')]));

    /* Documentos del cliente */
    if (A.puede('documentos')) cont.appendChild(await documentos(ctx));

    /* 07 Notas */
    var notas = el('div', { class: 'fi-notas' });
    function pintarNotas() {
      notas.innerHTML = '';
      fd.notas.slice().reverse().forEach(function (n) {
        notas.appendChild(el('div', { class: 'fi-nota-i' }, [el('div', { class: 'fi-nota-h' }, [el('b', { text: n.autor || 'Equipo' }), el('span', { class: 'muted', text: A.fecha(n.fecha.slice(0, 10)) }),
          el('button', { class: 'link-btn', type: 'button', text: 'Quitar', onclick: function () { if (!confirm('¿Quitar esta nota?')) return; fd.notas.splice(fd.notas.indexOf(n), 1); guardar(); pintarNotas(); } })]), el('p', { text: n.texto })]));
      });
      if (!fd.notas.length) notas.appendChild(el('div', { class: 'muted', text: 'Aún no hay notas.' }));
    }
    var nueva = el('textarea', { class: 'input', rows: 3, maxlength: 4000, placeholder: 'Escribe una observación del caso…' });
    cont.appendChild(seccion('07', 'Notas y observaciones del caso', [nueva,
      el('button', { class: 'btn btn-dark btn-sm', type: 'button', style: 'margin:8px 0 14px', onclick: function () {
        var t = nueva.value.trim(); if (!t) { nueva.focus(); return; }
        var yo = A.yo() || {};
        fd.notas.push({ fecha: new Date().toISOString(), autor: yo.nombre || yo.email || 'Equipo', texto: t });
        nueva.value = ''; guardar(); pintarNotas();
      } }, [A.icon('i-plus', 'icon-sm'), el('span', { text: 'Agregar nota' })]), notas]));
    pintarNotas();
  }

  function tabla(cab, filas, vacio) {
    if (!filas.length) return el('div', { class: 'muted', text: vacio });
    return el('div', { class: 'tbl-wrap fi-tbl' }, [el('table', { class: 'tbl' }, [el('thead', null, [el('tr', null, cab.map(function (h) { return el('th', { text: h }); }))]),
      el('tbody', null, filas.map(function (f) { return el('tr', null, f.map(function (v) { return el('td', { text: v == null || v === '' ? '—' : v }); })); }))])]);
  }

  /* Puntajes: inicial (primer registro), actual (último) y meta */
  function inicialActual(pts, b) {
    var con = pts.filter(function (p) { return p[b] != null; });
    return { ini: con.length ? con[0][b] : null, act: con.length ? con[con.length - 1][b] : null };
  }
  function tablaPuntajes(ctx, guardar) {
    var t = el('div', { class: 'fi-pts' });
    t.appendChild(el('span', { class: 'cab' })); BUROS4.forEach(function (b) { t.appendChild(el('span', { class: 'cab', text: b[1] })); });
    [['Inicial', 'ini'], ['Actual', 'act']].forEach(function (f) {
      t.appendChild(el('span', { class: 'lab', text: f[0] }));
      BUROS4.forEach(function (b) { var v = inicialActual(ctx.pts, b[0])[f[1]]; t.appendChild(el('span', { class: 'val', text: v != null ? v : '—' })); });
    });
    t.appendChild(el('span', { class: 'lab', text: 'Meta' }));
    BUROS4.forEach(function (b) {
      var i = el('input', { class: 'input sm', type: 'number', min: '300', max: '900', 'aria-label': 'Meta ' + b[1] }); i.value = ctx.fd.meta[b[0]] || '';
      i.addEventListener('input', function () { ctx.fd.meta[b[0]] = i.value ? Number(i.value) : null; guardar(); });
      t.appendChild(i);
    });
    // Registrar puntajes nuevos (incluye Innovis)
    var f = { fecha: el('input', { class: 'input sm', type: 'date', value: A.hoyISO(), 'aria-label': 'Fecha' }) };
    BUROS4.forEach(function (b) { f[b[0]] = el('input', { class: 'input sm', type: 'number', min: '300', max: '900', placeholder: b[1], 'aria-label': b[1] }); });
    var form = el('form', { class: 'inline-form fi-pts-form', onsubmit: async function (e) {
      e.preventDefault();
      var d = { caso_id: ctx.k.id, fecha: f.fecha.value || A.hoyISO() }, alguno = false, malo = false;
      BUROS4.forEach(function (b) { var v = f[b[0]].value.trim(); if (v) { var n = Number(v); if (n < 300 || n > 900) malo = true; d[b[0]] = n; alguno = true; } });
      if (!alguno || malo) { A.toast('Escribe puntajes entre 300 y 900.', 'error'); return; }
      var ins = await sb.from('puntajes').insert(d);
      if (ins.error) { A.toast('No se pudieron guardar los puntajes.', 'error'); return; }
      A.toast('Puntajes registrados.'); A.ir('ficha/' + ctx.k.id);
    } }, [f.fecha].concat(BUROS4.map(function (b) { return f[b[0]]; })).concat([el('button', { class: 'btn btn-dark btn-sm', type: 'submit', text: 'Registrar' })]));
    var desde = ctx.rep ? el('p', { class: 'muted fi-nota', text: 'Al importar un reporte de SmartCredit en el caso, sus puntajes se registran solos.' }) : null;
    return el('div', null, [t, form, desde]);
  }

  function negativas(ctx, campoFicha) {
    var rep = ctx.rep;
    if (!rep) {
      var man = ctx.fd.negativas = ctx.fd.negativas || {};
      return el('div', null, [el('div', { class: 'fi-3' }, BUROS3.map(function (b) { return el('label', { class: 'fi-campo' }, [el('span', { text: b[1] }), campoFicha(man, b[0], 'textarea', { rows: 4 })]); })),
        el('p', { class: 'muted fi-nota', text: 'Importa el reporte de SmartCredit en el caso y estas listas se llenan solas.' })]);
    }
    return el('div', null, [el('div', { class: 'fi-3' }, BUROS3.map(function (b) {
      var lista = (rep.cuentas || []).filter(function (c) { return c.buros[b[0]] && c.buros[b[0]].negativa; });
      return el('div', { class: 'fi-col' }, [el('b', { text: b[1] + ' · ' + lista.length })].concat(lista.map(function (c) {
        var d = c.buros[b[0]];
        return el('div', { class: 'fi-item' }, [el('span', { text: c.nombre + ' ' + (d.numero || c.numero || '') }), el('small', { class: 'muted', text: [d.estado_pago, d.saldo].filter(Boolean).join(' · ') })]);
      })).concat(lista.length ? [] : [el('span', { class: 'muted', text: 'Sin cuentas negativas' })]));
    })), el('p', { class: 'muted fi-nota', text: 'Del reporte del ' + A.fecha(rep.fecha_reporte || rep.created_at.slice(0, 10)) + '.' })]);
  }
  function inquiries(ctx) {
    var rep = ctx.rep;
    if (!rep) return el('p', { class: 'muted fi-nota', text: 'Las consultas aparecen aquí al importar el reporte de SmartCredit en el caso.' });
    var ord = [['equifax', 'EQ Inquiries'], ['experian', 'EX Inquiries'], ['transunion', 'TU Inquiries']];
    return el('div', { class: 'fi-3' }, ord.map(function (b) {
      var lista = (rep.consultas || []).filter(function (q) { return q.buro === b[0]; });
      return el('div', { class: 'fi-col' }, [el('b', { text: b[1] + ' · ' + lista.length })].concat(lista.map(function (q) { return el('div', { class: 'fi-item' }, [el('span', { text: q.acreedor }), el('small', { class: 'muted', text: q.fecha })]); })));
    }));
  }

  async function documentos(ctx) {
    var caja = el('div');
    var archivo = el('input', { type: 'file', hidden: true, multiple: true });
    async function cargar() {
      var r = await sb.from('documentos').select('*').eq('cliente_id', ctx.c.id).order('created_at', { ascending: false }).limit(100);
      caja.innerHTML = '';
      var docs = r.data || [];
      if (!docs.length) { caja.appendChild(el('div', { class: 'muted', text: 'Aún no hay documentos de este cliente.' })); return; }
      docs.forEach(function (d) {
        caja.appendChild(el('div', { class: 'fi-doc' }, [A.icon('i-file', 'icon-sm'), el('span', { class: 'fi-doc-n', text: d.nombre }), el('span', { class: 'muted', text: A.fecha(d.created_at.slice(0, 10)) }),
          el('button', { class: 'mini-btn', type: 'button', text: 'Abrir', onclick: async function () {
            var w = window.open('', '_blank');
            var u = await sb.storage.from('documentos').createSignedUrl(d.path, 300);
            if (u.data && w) w.location.href = u.data.signedUrl; else { if (w) w.close(); A.toast('No se pudo abrir.', 'error'); }
          } })]));
      });
    }
    archivo.addEventListener('change', async function () {
      var fs = Array.prototype.slice.call(archivo.files); archivo.value = '';
      for (var i = 0; i < fs.length; i++) {
        var f = fs[i];
        if (f.size > 25 * 1024 * 1024) { A.toast(f.name + ' supera 25 MB.', 'error'); continue; }
        var ruta = 'clientes/' + ctx.c.id + '/' + Date.now() + '-' + String(f.name).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_').slice(-80);
        var up = await sb.storage.from('documentos').upload(ruta, f, { contentType: f.type || 'application/octet-stream' });
        if (up.error) { A.toast('No se pudo subir ' + f.name + '.', 'error'); continue; }
        await sb.from('documentos').insert({ cliente_id: ctx.c.id, caso_id: ctx.k.id, nombre: f.name.slice(0, 200), path: ruta, tipo: f.type || 'application/octet-stream', tamano: f.size });
      }
      A.toast('Documentos subidos.', 'ok'); cargar();
    });
    await cargar();
    return el('section', { class: 'fi-sec' }, [el('h2', { class: 'fi-h' }, [el('span', { text: '◆' }), 'Documentos del cliente']), archivo,
      el('button', { class: 'btn btn-ghost btn-sm', type: 'button', style: 'margin-bottom:10px', onclick: function () { archivo.click(); } }, [A.icon('i-upload', 'icon-sm'), el('span', { text: 'Subir archivos' })]), caja]);
  }

  /* ---------- Imprimir la ficha con el formato de AVA ---------- */
  function esc(s) { return String(s == null || s === '' ? '—' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function imprimir(ctx) {
    var k = ctx.k, c = ctx.c, fd = ctx.fd, rep = ctx.rep, p = fd.plan || {};
    var asesor = ctx.equipo.filter(function (m) { return m.user_id === k.responsable; })[0];
    function fila(pares) { return '<tr>' + pares.map(function (x) { return '<th>' + esc(x[0]) + '</th><td' + (x[2] ? ' colspan="' + x[2] + '"' : '') + '>' + esc(x[1]) + '</td>'; }).join('') + '</tr>'; }
    function caja(lista, marcados) { return '<div class="ck">' + lista.map(function (t) { return '<span>' + ((marcados || []).indexOf(t) !== -1 ? '☑' : '☐') + ' ' + esc(t) + '</span>'; }).join('') + '</div>'; }
    function texto(t) { return '<div class="tx">' + esc(t).replace(/\n/g, '<br>') + '</div>'; }
    var pts = '<table class="g"><tr><th></th>' + BUROS4.map(function (b) { return '<th>' + b[1] + '</th>'; }).join('') + '</tr>' +
      [['Inicial', 'ini'], ['Actual', 'act']].map(function (f) { return '<tr><th>' + f[0] + '</th>' + BUROS4.map(function (b) { return '<td>' + esc(inicialActual(ctx.pts, b[0])[f[1]]) + '</td>'; }).join('') + '</tr>'; }).join('') +
      '<tr><th>Meta</th>' + BUROS4.map(function (b) { return '<td>' + esc(fd.meta && fd.meta[b[0]]) + '</td>'; }).join('') + '</tr></table>';
    var neg = '<table class="g"><tr>' + BUROS3.map(function (b) { return '<th>' + b[1] + '</th>'; }).join('') + '</tr><tr>' + BUROS3.map(function (b) {
      if (!rep) return '<td>' + esc((fd.negativas || {})[b[0]]).replace(/\n/g, '<br>') + '</td>';
      var l = (rep.cuentas || []).filter(function (x) { return x.buros[b[0]] && x.buros[b[0]].negativa; });
      return '<td>' + (l.length ? l.map(function (x) { return esc(x.nombre + ' ' + (x.buros[b[0]].numero || x.numero || '')) + '<br><small>' + esc([x.buros[b[0]].estado_pago, x.buros[b[0]].saldo].filter(Boolean).join(' · ')) + '</small>'; }).join('<hr>') : '—') + '</td>';
    }).join('') + '</tr></table>';
    var inq = '<table class="g"><tr><th>EQ Inquiries</th><th>EX Inquiries</th><th>TU Inquiries</th></tr><tr>' + ['equifax', 'experian', 'transunion'].map(function (b) {
      var l = rep ? (rep.consultas || []).filter(function (q) { return q.buro === b; }) : [];
      return '<td>' + (l.length ? l.map(function (q) { return esc(q.acreedor) + ' <small>' + esc(q.fecha) + '</small>'; }).join('<br>') : '—') + '</td>';
    }).join('') + '</tr></table>';
    var prio = '<table class="g"><tr><th>#</th><th>Acción a trabajar</th><th>Buró(s)</th><th>Plazo estimado</th></tr>' + (p.prioridades || []).filter(function (x) { return x.accion || x.buros || x.plazo; }).map(function (x, i) {
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(x.accion) + '</td><td>' + esc(x.buros) + '</td><td>' + esc(x.plazo) + '</td></tr>'; }).join('') + '</table>';
    var dsp = '<table class="g"><tr><th>Fecha</th><th>Elemento disputado</th><th>Buró</th><th>Resultado</th></tr>' + ctx.disp.map(function (d) {
      return '<tr><td>' + esc(A.fecha(d.fecha_envio)) + '</td><td>' + esc(d.acreedor) + '</td><td>' + esc((d.buro || '').replace(/^./, function (x) { return x.toUpperCase(); })) + '</td><td>' + esc(RESULTADOS[d.resultado] || d.resultado) + '</td></tr>'; }).join('') + '</table>';
    var pag = ctx.pagos ? '<table class="g"><tr><th>Fecha</th><th>Concepto</th><th>Monto</th><th>Método</th></tr>' + ctx.pagos.map(function (x) {
      return '<tr><td>' + esc(A.fecha(x.fecha)) + '</td><td>' + esc(x.nota || 'Pago #' + x.numero) + '</td><td>' + esc(A.dinero(x.monto)) + '</td><td>' + esc((A.METODOS || {})[x.metodo] || x.metodo) + '</td></tr>'; }).join('') + '</table>' : '';
    var notas = (fd.notas || []).map(function (n) { return '<p><b>' + esc(A.fecha(n.fecha.slice(0, 10))) + ' · ' + esc(n.autor) + ':</b> ' + esc(n.texto).replace(/\n/g, '<br>') + '</p>'; }).join('') || '—';
    var html = '<header><b>FICHA DE OBSERVACIONES DE CLIENTE</b><span>Uso interno — Documento confidencial</span></header>' +
      '<h2>01 · Datos del cliente</h2><table class="kv">' +
      fila([['Nombre completo', A.nombreDe(c), 3]]) + fila([['Teléfono', c.telefono ? String(c.telefono).replace(/^\+?1?(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3') : ''], ['Email', c.email]]) + fila([['Dirección', c.direccion, 3]]) +
      fila([['Ciudad', c.ciudad], ['Estado / ZIP', [c.region, c.codigo_postal].filter(Boolean).join(' ')]]) + fila([['Fecha inicio', k.fecha_inicio ? A.fecha(k.fecha_inicio) : ''], ['Estado cliente', fd.estado_cliente]]) +
      fila([['Asesor', asesor ? asesor.nombre || asesor.email : '', 3]]) + '</table>' +
      '<h3>Puntajes — Equifax · Experian · TransUnion · Innovis</h3>' + pts + '<h3>Cuentas negativas por buró</h3>' + neg + '<h3>Inquiries</h3>' + inq +
      '<h3>Inquiries disputables</h3>' + texto(fd.inq_disputables) +
      '<h2>02 · Diagnóstico inicial</h2>' + texto(fd.diagnostico) +
      '<h2>03 · Plan de trabajo</h2><h3>Servicios incluidos</h3>' + caja(SERVICIOS, p.servicios) + '<h3>Burós a trabajar</h3>' + caja(BUROS_TRABAJO, p.buros) +
      '<h3>Tipo de disputa / cartas</h3>' + caja(CARTAS, p.cartas) + '<h3>Prioridades de trabajo</h3>' + prio + '<h3>Notas del plan</h3>' + texto(p.notas) +
      '<h2>04 · Monitor de crédito</h2><table class="kv">' + fila([['Plataforma', fd.monitor && fd.monitor.plataforma], ['Usuario', fd.monitor && fd.monitor.usuario]]) +
      fila([['Burós principales', fd.monitor && fd.monitor.principales], ['Burós secundarios', fd.monitor && fd.monitor.secundarios]]) + '</table>' +
      '<h2>05 · Historial de disputas</h2>' + dsp + (ctx.quejas.length ? '<h3>Quejas del CFPB</h3><table class="g"><tr><th>Ronda</th><th>Fecha</th><th>Número</th><th>Burós</th><th>Estado</th></tr>' + ctx.quejas.map(function (q) {
        return '<tr><td>' + q.ronda + '</td><td>' + esc(A.fecha(q.fecha)) + '</td><td>' + esc(q.numero) + '</td><td>' + esc((q.buros || []).join(', ')) + '</td><td>' + esc(q.estado) + '</td></tr>'; }).join('') + '</table>' : '') + (ctx.pagos ? '<h2>06 · Seguimiento de pagos</h2>' + pag : '') +
      '<h2>07 · Notas y observaciones del caso</h2><div class="tx">' + notas + '</div>';
    var w = window.open('', '_blank');
    if (!w) { A.toast('El navegador bloqueó la ventana. Permite ventanas emergentes para este sitio.', 'error'); return; }
    w.document.write('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ficha · ' + esc(A.nombreDe(c)) + '</title><style>' +
      '@page{size:letter;margin:0.6in}body{font-family:Helvetica,Arial,sans-serif;font-size:10.5pt;color:#222;margin:0}' +
      'header{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #6a5848;padding-bottom:6px;margin-bottom:10px}header b{font-size:13pt;letter-spacing:.04em}header span{font-size:9pt;color:#777}' +
      'h2{margin:16px 0 6px;padding:5px 8px;background:#2a2a2a;color:#fff;font-size:10.5pt;letter-spacing:.06em;text-transform:uppercase}h3{margin:10px 0 4px;font-size:9.5pt;color:#6a5848;text-transform:uppercase;letter-spacing:.06em}' +
      'table{width:100%;border-collapse:collapse;margin-bottom:4px}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top;font-size:9.5pt}th{background:#f3efea;font-weight:600}.kv th{width:18%}' +
      'td hr{border:0;border-top:1px dotted #bbb;margin:3px 0}small{color:#777}.ck{display:grid;grid-template-columns:repeat(3,1fr);gap:3px 10px;font-size:9.5pt}.tx{border:1px solid #ccc;padding:6px 8px;min-height:24px;font-size:9.5pt}.tx p{margin:0 0 5px}' +
      'h2{page-break-after:avoid}table,.tx{page-break-inside:auto}tr{page-break-inside:avoid}' +
      '@media screen{body{background:#eee}main{background:#fff;max-width:7.6in;margin:20px auto;padding:.5in;box-shadow:0 2px 12px rgba(0,0,0,.15)}}' +
      '</style></head><body><main>' + html + '</main><script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>');
    w.document.close();
  }
})();
