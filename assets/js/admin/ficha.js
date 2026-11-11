/* Panel CRM — Ficha del caso de crédito: la ficha de observaciones de AVA dentro del CRM.
   Junta datos del cliente, puntajes, reporte, plan de trabajo, monitor, disputas, pagos, documentos y notas.
   Lo propio de la ficha se guarda en «fichas_credito» (uso interno: el portal del cliente no la ve). */
(function () {
  'use strict';
  var A = window.AVA, el = A.el, sb = A.sb;
  var BUROS4 = [['equifax', 'Equifax'], ['experian', 'Experian'], ['transunion', 'TransUnion'], ['innovis', 'Innovis']];
  var ESTADOS = ['Nuevo', 'En proceso', 'En pausa', 'Finalizado', 'Cancelado'];
  var SERVICIOS = ['Disputa de cuentas negativas', 'Eliminación de inquiries', 'Burós secundarios', 'Construcción de crédito', 'Tradeline AU', 'CreditStrong / Kikoff', 'Goodwill letter', 'Pay-for-delete', 'Validación de deuda (FDCPA)', 'Business credit (EIN)', 'Asesoría hipotecaria', 'Educación financiera'];
  var BUROS_TRABAJO = ['Equifax', 'Experian', 'TransUnion', 'Innovis', 'ChexSystems', 'LexisNexis'];
  var CARTAS = ['FCRA §611', 'FCRA §609', 'PPL / Gramm-Leach-Bliley', 'Goodwill', 'Pay-for-Delete', 'Debt Validation'];
  var BUROS_PLANILLA = ['TransUnion', 'Experian', 'Equifax', 'Innovis'];
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
      A.equipo(),
      sb.rpc('ficha_protegida_resumen', { p_caso: casoId })
    ]);
    cont.innerHTML = '';
    var k = r[0].data;
    if (!k) { cont.appendChild(el('div', { class: 'empty' }, [el('b', { text: 'No se encontró el caso' }), el('a', { href: '#/casos', class: 'link-btn', text: 'Volver a Casos' })])); return; }
    var c = k.clientes || {};
    var fd = (r[1].data && r[1].data.datos) || {};
    var pts = r[2].data || [], rep = (r[3].data || [])[0] || null, disp = r[4].data || [], quejas = r[5].data || [], pagos = r[6].data, equipo = r[7] || [];
    var ctx = { k: k, c: c, fd: fd, pts: pts, rep: rep, disp: disp, quejas: quejas, pagos: pagos, equipo: equipo, protegido: r[8].data || {} };
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

    /* 01 Datos del cliente (planilla de trabajo) */
    function campoCliente(clave, tipo, extra) {
      var inp = el('input', Object.assign({ class: 'input sm', type: tipo || 'text', maxlength: 200 }, extra || {})); inp.value = c[clave] || '';
      inp.addEventListener('change', async function () {
        var cambio = {}; cambio[clave] = inp.value.trim() || null;
        var u = await sb.from('clientes').update(cambio).eq('id', c.id);
        if (u.error) { A.toast('No se pudo guardar el dato del cliente.', 'error'); return; }
        c[clave] = cambio[clave]; A.limpiarClientes(); estado.textContent = 'Guardado ✓';
      });
      return inp;
    }
    function fila(label, hijos) { return el('div', { class: 'fi-kv-f' }, [el('span', { class: 'fi-kv-k', text: label }), el('div', { class: 'fi-kv-v' }, hijos)]); }
    var inicio = el('input', { class: 'input sm', type: 'date' }); inicio.value = k.fecha_inicio || '';
    inicio.addEventListener('change', async function () { var u = await sb.from('casos').update({ fecha_inicio: inicio.value || null }).eq('id', k.id); if (!u.error) { k.fecha_inicio = inicio.value; estado.textContent = 'Guardado ✓'; } });
    var asesor = el('select', { class: 'input sm' }, [el('option', { value: '', text: 'Sin asignar' })].concat(equipo.map(function (m) { return el('option', { value: m.user_id, text: m.nombre || m.email || 'Equipo' }); })));
    asesor.value = k.responsable || '';
    asesor.addEventListener('change', async function () { var u = await sb.from('casos').update({ responsable: asesor.value || null }).eq('id', k.id); if (!u.error) { k.responsable = asesor.value || null; estado.textContent = 'Guardado ✓'; } });
    var est = el('select', { class: 'input sm' }, ESTADOS.map(function (s) { return el('option', { value: s, text: s }); }));
    est.value = fd.estado_cliente || 'En proceso'; fd.estado_cliente = est.value;
    est.addEventListener('change', function () { fd.estado_cliente = est.value; guardar(); });
    // Burós analizados (TU · EX · EQ · Innovis)
    var analizados = fd.buros_analizados = fd.buros_analizados || [];
    var chipsBuros = el('div', { class: 'fi-checks fi-checks-4' }, BUROS_PLANILLA.map(function (b) {
      var i = el('input', { type: 'checkbox' }); i.checked = analizados.indexOf(b) !== -1;
      i.addEventListener('change', function () { var x = analizados.indexOf(b); if (i.checked && x === -1) analizados.push(b); if (!i.checked && x !== -1) analizados.splice(x, 1); guardar(); });
      return el('label', { class: 'fi-check' }, [i, el('span', { text: b })]);
    }));
    var plat = el('select', { class: 'input sm' }, [el('option', { value: '', text: 'Plataforma…' })].concat(PLATAFORMAS.map(function (p) { return el('option', { value: p, text: p }); })));
    plat.value = fd.monitor.plataforma || '';
    plat.addEventListener('change', function () { fd.monitor.plataforma = plat.value; guardar(); });

    // Seguro Social y claves: guardados aparte, solo con el permiso «Datos sensibles» y cada vista queda registrada
    var tiene = ctx.protegido || {}, prot = null;
    var celdas = { ssn: el('div', { class: 'fi-prot' }), cfpb: el('div', { class: 'fi-prot' }), correo2: el('div', { class: 'fi-prot' }), monitor: el('div', { class: 'fi-prot' }) };
    var accionesProt = el('div', { class: 'fi-prot-acc' });
    function pintarProt() {
      Object.keys(celdas).forEach(function (kk) {
        celdas[kk].textContent = prot ? (prot[kk] || '—') : (tiene[kk] ? '•••••••• (protegido)' : '—');
        celdas[kk].classList.toggle('visto', !!prot);
      });
      accionesProt.innerHTML = '';
      if (!A.puede('sensibles')) { accionesProt.appendChild(el('span', { class: 'muted', text: 'El Seguro Social y las claves solo los ve quien tiene el permiso «Datos sensibles».' })); return; }
      if (!prot) accionesProt.appendChild(el('button', { class: 'mini-btn', type: 'button', text: 'Ver datos protegidos', onclick: async function () {
        var v = await sb.rpc('ficha_protegida_ver', { p_caso: k.id });
        if (v.error) { A.toast('No se pudieron ver los datos protegidos.', 'error'); return; }
        prot = v.data || {}; ctx.protegidoVisto = prot; pintarProt();
      } }));
      else accionesProt.appendChild(el('button', { class: 'mini-btn', type: 'button', text: 'Ocultar', onclick: function () { prot = null; ctx.protegidoVisto = null; pintarProt(); } }));
      accionesProt.appendChild(el('button', { class: 'mini-btn', type: 'button', text: 'Editar datos protegidos', onclick: editarProt }));
      accionesProt.appendChild(el('span', { class: 'muted', text: prot ? 'Queda registrado que los viste.' : 'Se guardan aparte y queda registrado quién los ve.' }));
    }
    async function editarProt() {
      var actual = prot;
      if (!actual) { var v = await sb.rpc('ficha_protegida_ver', { p_caso: k.id }); if (v.error) { A.toast('No se pudieron abrir los datos protegidos.', 'error'); return; } actual = v.data || {}; }
      A.modal({ titulo: 'Datos protegidos', ok: 'Guardar',
        campos: [
          { k: 'ssn', label: 'Seguro Social / ITIN', value: actual.ssn, max: 20, full: true },
          { k: 'cfpb', label: 'CFPB (correo y clave)', type: 'textarea', value: actual.cfpb, max: 600, full: true, placeholder: 'correo@… Clave: …' },
          { k: 'correo2', label: 'Correo secundario (correo y clave)', type: 'textarea', value: actual.correo2, max: 600, full: true },
          { k: 'monitor', label: 'Monitor de crédito (usuario y clave)', type: 'textarea', value: actual.monitor, max: 600, full: true, placeholder: 'correo@… Clave: … · ' + (fd.monitor.plataforma || 'Plataforma') }
        ],
        extra: el('p', { class: 'muted', style: 'margin-top:10px;font-size:12.5px', text: 'Se guardan aparte de la ficha. Solo los ve quien tiene el permiso «Datos sensibles» y queda registrado cada vez que alguien los abre o los cambia. No salen en la ficha impresa.' }),
        guardar: async function (d, aviso) {
          var u = await sb.rpc('ficha_protegida_guardar', { p_caso: k.id, p_datos: d });
          if (u.error) { A.msg(aviso, 'No se pudieron guardar.'); return false; }
          prot = { ssn: d.ssn || '', cfpb: d.cfpb || '', correo2: d.correo2 || '', monitor: d.monitor || '' };
          tiene = { ssn: !!d.ssn, cfpb: !!d.cfpb, correo2: !!d.correo2, monitor: !!d.monitor };
          ctx.protegido = tiene; ctx.protegidoVisto = prot; pintarProt(); A.toast('Datos protegidos guardados.');
        } });
    }
    pintarProt();

    cont.appendChild(seccion('01', 'Datos del cliente', [
      el('div', { class: 'fi-kv' }, [
        fila('Cliente', [el('div', { class: 'fi-ro', text: A.nombreDe(c) })]),
        fila('Dirección', [el('div', { class: 'fi-dir' }, [campoCliente('direccion', 'text', { placeholder: 'Calle y número' }), campoCliente('ciudad', 'text', { placeholder: 'Ciudad' }), campoCliente('region', 'text', { placeholder: 'Estado' }), campoCliente('codigo_postal', 'text', { placeholder: 'ZIP' })])]),
        fila('Social', [celdas.ssn]),
        fila('Fecha de nacimiento', [campoCliente('fecha_nacimiento', 'date')]),
        fila('Burós analizados', [chipsBuros]),
        fila('Correo cliente', [campoCliente('email', 'email')]),
        fila('Teléfono', [campoCliente('telefono', 'tel')]),
        fila('CFPB', [celdas.cfpb]),
        fila('Correo secundario', [celdas.correo2]),
        fila('Monitor de crédito', [el('div', { class: 'fi-dir fi-mon' }, [plat, campoFicha(fd.monitor, 'usuario', 'text', { placeholder: 'Usuario o correo', autocomplete: 'off' })]), celdas.monitor])
      ]),
      accionesProt,
      el('div', { class: 'fi-grid', style: 'margin-top:16px' }, [campo('Fecha inicio', inicio), campo('Estado del cliente', est), campo('Asesor', asesor)])
    ]));

    /* 02 Cuentas a trabajar y 03 Inquiries a disputar: tablas de la planilla */
    function buroCorto(b) { return { equifax: 'EQ', experian: 'EX', transunion: 'TU', innovis: 'IN' }[b] || b; }
    var cuentas = fd.cuentas = fd.cuentas || [];
    var cuentasDelReporte = rep ? (rep.cuentas || []).filter(function (x) { return x.negativa; }).map(function (x) {
      var bs = Object.keys(x.buros || {}).filter(function (b) { return x.buros[b]; });
      var d0 = x.buros[bs[0]] || {};
      return { acreedor: x.nombre || '', numero: x.numero || d0.numero || '', balance: d0.saldo || '', buros: ['transunion', 'experian', 'equifax'].filter(function (b) { return bs.indexOf(b) !== -1; }).map(buroCorto).join(','), abierta: d0.abierta || '' };
    }) : [];
    cont.appendChild(seccion('02', 'Cuentas a trabajar', [tablaEditable(cuentas, [
      { k: 'acreedor', t: 'Acreedor', w: '2fr' }, { k: 'numero', t: 'N° cuenta', w: '1.2fr' }, { k: 'balance', t: 'Balance', w: '.9fr' },
      { k: 'buros', t: 'Burós', w: '.9fr', ph: 'TU,EX,EQ' }, { k: 'abierta', t: 'Date open', w: '1fr', ph: 'MM/DD/AAAA' }
    ], 'cuenta', cuentasDelReporte, function (x) { return (x.acreedor + '|' + x.numero).toLowerCase(); })]));

    var inqs = fd.inquiries = fd.inquiries || [];
    var inqDelReporte = rep ? (rep.consultas || []).map(function (q) { return { acreedor: q.acreedor || '', fecha: q.fecha || '', buro: (q.buro || '').toUpperCase(), disputado: '', resultado: '' }; }) : [];
    cont.appendChild(seccion('03', 'Inquiries a disputar', [tablaEditable(inqs, [
      { k: 'acreedor', t: 'Nombre del acreedor', w: '1.8fr' }, { k: 'fecha', t: 'Fecha', w: '1fr', ph: 'MM/DD/AAAA' },
      { k: 'buro', t: 'Buró', w: '1.1fr', opciones: ['', 'EQUIFAX', 'EXPERIAN', 'TRANSUNION', 'INNOVIS'] },
      { k: 'disputado', t: 'Disputado', w: '1.3fr', tipo: 'date' }, { k: 'resultado', t: 'Resultado', w: '1.1fr', opciones: ['', 'PENDIENTE', 'ELIMINADA', 'VERIFICADA', 'ACTUALIZADA', 'SIN RESPUESTA'] }
    ], 'inquiry', inqDelReporte, function (x) { return (x.acreedor + '|' + x.fecha + '|' + x.buro).toLowerCase(); })]));

    /* 04 Notas de trabajo (el recuadro de la planilla) */
    if (fd.inq_disputables && !fd.notas_trabajo) { fd.notas_trabajo = 'Inquiries disputables: ' + fd.inq_disputables; delete fd.inq_disputables; guardar(); }
    cont.appendChild(seccion('04', 'Notas de trabajo', [campoFicha(fd, 'notas_trabajo', 'textarea', { rows: 6, placeholder: 'Ej.: Carta de información personal a TransUnion, Equifax y Experian enviada el 29 de septiembre.' })]));

    // Tabla que se edita como la planilla: se guarda sola, se agregan filas y se pueden traer del reporte de SmartCredit
    function tablaEditable(lista, cols, nombre, delReporte, clave) {
      var caja = el('div', { class: 'fi-tab' });
      var plantilla = cols.map(function (x) { return x.w; }).join(' ');
      function nueva() { var o = {}; cols.forEach(function (x) { o[x.k] = ''; }); return o; }
      function pintarT() {
        caja.innerHTML = '';
        if (!lista.length) lista.push(nueva(), nueva(), nueva());
        caja.appendChild(el('div', { class: 'fi-tab-f cab', style: 'grid-template-columns:26px ' + plantilla + ' 28px' }, [el('span', { text: '#' })].concat(cols.map(function (x) { return el('span', { text: x.t }); }), [el('span')])));
        lista.forEach(function (fila, n) {
          caja.appendChild(el('div', { class: 'fi-tab-f', style: 'grid-template-columns:26px ' + plantilla + ' 28px' }, [el('span', { class: 'n', text: n + 1 })].concat(cols.map(function (x) {
            var inp;
            if (x.opciones) {
              inp = el('select', { class: 'input sm', 'aria-label': x.t }, x.opciones.map(function (o) { return el('option', { value: o, text: o || '—' }); }));
              inp.value = fila[x.k] || '';
              inp.addEventListener('change', function () { fila[x.k] = inp.value; guardar(); });
            } else {
              inp = el('input', { class: 'input sm', type: x.tipo || 'text', maxlength: 160, placeholder: x.ph || '', 'aria-label': x.t });
              inp.value = fila[x.k] || '';
              inp.addEventListener('input', function () { fila[x.k] = inp.value; guardar(); });
            }
            return el('label', { class: 'fi-tab-c', 'data-t': x.t }, [inp]);
          }), [el('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Quitar fila ' + (n + 1), title: 'Quitar fila', onclick: function () {
            var llena = cols.some(function (x) { return fila[x.k]; });
            if (llena && !confirm('¿Quitar la fila ' + (n + 1) + '?')) return;
            lista.splice(n, 1); guardar(); pintarT();
          } }, [A.icon('i-x', 'icon-sm')])])));
        });
        var acc = el('div', { class: 'fi-tab-acc' }, [el('button', { class: 'link-btn', type: 'button', text: '+ Agregar ' + nombre, onclick: function () { lista.push(nueva()); guardar(); pintarT(); } })]);
        var faltan = delReporte.filter(function (x) { return !lista.some(function (y) { return clave(y) === clave(x); }); });
        if (faltan.length) acc.appendChild(el('button', { class: 'mini-btn', type: 'button', text: 'Traer ' + faltan.length + ' del reporte de SmartCredit', onclick: function () {
          // Las filas vacías se reemplazan por las del reporte
          for (var q = lista.length - 1; q >= 0; q--) if (!cols.some(function (x) { return lista[q][x.k]; })) lista.splice(q, 1);
          faltan.forEach(function (x) { lista.push(x); }); guardar(); pintarT(); A.toast(faltan.length + ' agregada' + (faltan.length === 1 ? '' : 's') + ' del reporte.');
        } }));
        caja.appendChild(acc);
      }
      pintarT();
      return caja;
    }

    /* 05 Puntajes */
    cont.appendChild(seccion('05', 'Puntajes', [tablaPuntajes(ctx, guardar, campoFicha)]));

    /* 06 Diagnóstico */
    cont.appendChild(seccion('06', 'Diagnóstico inicial', [campo('Diagnóstico general del caso', campoFicha(fd, 'diagnostico', 'textarea', { rows: 6, placeholder: 'Situación del crédito, causas, oportunidades…' }), true)]));

    /* 07 Plan de trabajo */
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
    cont.appendChild(seccion('07', 'Plan de trabajo — qué se va a trabajar', [
      bloque('Servicios incluidos', [checks(SERVICIOS, 'servicios')]),
      bloque('Burós a trabajar', [checks(BUROS_TRABAJO, 'buros')]),
      bloque('Tipo de disputa / cartas', [checks(CARTAS, 'cartas')]),
      bloque('Prioridades de trabajo', [prio]),
      campo('Notas del plan de trabajo', campoFicha(fd.plan, 'notas', 'textarea', { rows: 4 }), true)
    ]));

    /* 08 Historial de disputas */
    cont.appendChild(seccion('08', 'Historial de disputas', [tabla(['Fecha', 'Elemento disputado', 'Buró', 'Ronda', 'Resultado'], disp.map(function (d) {
      return [A.fecha(d.fecha_envio), d.acreedor, (d.buro || '').replace(/^./, function (x) { return x.toUpperCase(); }), String(d.ronda), RESULTADOS[d.resultado] || d.resultado];
    }), 'Aún no hay disputas. Se crean al marcar las cartas como enviadas en el caso.'),
      quejas.length ? el('div', { class: 'fi-bloque' }, [el('h3', { text: 'Quejas del CFPB' }), tabla(['Ronda', 'Fecha', 'Número', 'Burós', 'Estado'], quejas.map(function (q) {
        return [String(q.ronda), A.fecha(q.fecha), q.numero || '', (q.buros || []).join(', '), { preparada: 'Preparada', enviada: 'Enviada', en_revision: 'En revisión', respondida: 'Respondida', cerrada: 'Cerrada' }[q.estado]];
      }), '')]) : null]));

    /* 09 Pagos */
    if (pagos) cont.appendChild(seccion('09', 'Seguimiento de pagos', [tabla(['Fecha', 'Concepto', 'Monto', 'Método'], pagos.map(function (p) {
      return [A.fecha(p.fecha), p.nota || 'Pago #' + p.numero, A.dinero(p.monto), (A.METODOS || {})[p.metodo] || p.metodo];
    }), 'Aún no hay pagos registrados en este caso.')]));

    /* Documentos del cliente */
    if (A.puede('documentos')) cont.appendChild(await documentos(ctx));

    /* 10 Notas */
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
    cont.appendChild(seccion('10', 'Notas y observaciones del caso', [nueva,
      el('button', { class: 'btn btn-dark btn-sm', type: 'button', style: 'margin:8px 0 14px', onclick: function () {
        var t = nueva.value.trim(); if (!t) { A.toast('Escribe la nota en la casilla y después toca Agregar nota.', 'error'); nueva.focus(); return; }
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
    BUROS4.forEach(function (b) { f[b[0]] = el('input', { class: 'input sm', type: 'number', min: '300', max: b[0] === 'innovis' ? '900' : '850', placeholder: b[1], 'aria-label': b[1] }); });
    var form = el('form', { class: 'inline-form fi-pts-form', onsubmit: async function (e) {
      e.preventDefault();
      var d = { caso_id: ctx.k.id, fecha: f.fecha.value || A.hoyISO() }, alguno = false, malo = false;
      BUROS4.forEach(function (b) { var v = f[b[0]].value.trim(); if (v) { var n = Number(v); if (!(n >= 300 && n <= (b[0] === 'innovis' ? 900 : 850))) malo = true; d[b[0]] = n; alguno = true; } });
      if (!alguno || malo) { A.toast('Escribe puntajes entre 300 y 850 (Innovis hasta 900).', 'error'); return; }
      var ins = await sb.from('puntajes').insert(d);
      if (ins.error) { A.toast('No se pudieron guardar los puntajes.', 'error'); return; }
      A.toast('Puntajes registrados.'); A.ir('ficha/' + ctx.k.id);
    } }, [f.fecha].concat(BUROS4.map(function (b) { return f[b[0]]; })).concat([el('button', { class: 'btn btn-dark btn-sm', type: 'submit', text: 'Registrar' })]));
    var desde = ctx.rep ? el('p', { class: 'muted fi-nota', text: 'Al importar un reporte de SmartCredit en el caso, sus puntajes se registran solos.' }) : null;
    return el('div', null, [t, form, desde]);
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
    var prio = '<table class="g"><tr><th>#</th><th>Acción a trabajar</th><th>Buró(s)</th><th>Plazo estimado</th></tr>' + (p.prioridades || []).filter(function (x) { return x.accion || x.buros || x.plazo; }).map(function (x, i) {
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(x.accion) + '</td><td>' + esc(x.buros) + '</td><td>' + esc(x.plazo) + '</td></tr>'; }).join('') + '</table>';
    var dsp = '<table class="g"><tr><th>Fecha</th><th>Elemento disputado</th><th>Buró</th><th>Resultado</th></tr>' + ctx.disp.map(function (d) {
      return '<tr><td>' + esc(A.fecha(d.fecha_envio)) + '</td><td>' + esc(d.acreedor) + '</td><td>' + esc((d.buro || '').replace(/^./, function (x) { return x.toUpperCase(); })) + '</td><td>' + esc(RESULTADOS[d.resultado] || d.resultado) + '</td></tr>'; }).join('') + '</table>';
    var pag = ctx.pagos ? '<table class="g"><tr><th>Fecha</th><th>Concepto</th><th>Monto</th><th>Método</th></tr>' + ctx.pagos.map(function (x) {
      return '<tr><td>' + esc(A.fecha(x.fecha)) + '</td><td>' + esc(x.nota || 'Pago #' + x.numero) + '</td><td>' + esc(A.dinero(x.monto)) + '</td><td>' + esc((A.METODOS || {})[x.metodo] || x.metodo) + '</td></tr>'; }).join('') + '</table>' : '';
    var notas = (fd.notas || []).map(function (n) { return '<p><b>' + esc(A.fecha(n.fecha.slice(0, 10))) + ' · ' + esc(n.autor) + ':</b> ' + esc(n.texto).replace(/\n/g, '<br>') + '</p>'; }).join('') || '—';
    // Seguro Social y claves no se imprimen: solo los últimos 4 del Social si se vieron en pantalla
    var pv = ctx.protegidoVisto, pr = ctx.protegido || {};
    var ssnTxt = pv && pv.ssn ? '***-**-' + String(pv.ssn).replace(/\D/g, '').slice(-4) : pr.ssn ? 'Guardado en el CRM (protegido)' : '';
    function prot(kk) { return pr[kk] ? 'Guardado en el CRM (protegido)' : ''; }
    function vacio(v) { return v == null || v === '' ? '' : esc(v); }
    function kv(label, valor) { return '<tr><th>' + esc(label) + '</th><td>' + vacio(valor) + '</td></tr>'; }
    function tablaP(cab, filas, minimo) {
      var cuerpo = filas.map(function (f, n) { return '<tr><td class="n">' + (n + 1) + '</td>' + f.map(function (v) { return '<td>' + vacio(v) + '</td>'; }).join('') + '</tr>'; });
      for (var n = filas.length; n < minimo; n++) cuerpo.push('<tr><td class="n">' + (n + 1) + '</td>' + cab.map(function () { return '<td>&nbsp;</td>'; }).join('') + '</tr>');
      return '<table class="pl"><tr><th class="n">#</th>' + cab.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr>' + cuerpo.join('') + '</table>';
    }
    function llena(x, ks) { return ks.some(function (q) { return x[q]; }); }
    var cuentasP = (fd.cuentas || []).filter(function (x) { return llena(x, ['acreedor', 'numero', 'balance', 'buros', 'abierta']); }).map(function (x) { return [x.acreedor, x.numero, x.balance, x.buros, x.abierta]; });
    var inqP = (fd.inquiries || []).filter(function (x) { return llena(x, ['acreedor', 'fecha', 'buro', 'disputado', 'resultado']); }).map(function (x) { return [x.acreedor, x.fecha, x.buro, x.disputado ? x.disputado.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$2/$3/$1') : '', x.resultado]; });
    var mon = [fd.monitor && fd.monitor.plataforma, fd.monitor && fd.monitor.usuario].filter(Boolean).join(' · ');
    var html = '<h1>PLANILLA DE TRABAJO DEL CLIENTE</h1>' +
      '<h2>Datos del cliente</h2><table class="kv">' +
      kv('Cliente', A.nombreDe(c).toUpperCase()) +
      kv('Dirección', [c.direccion, c.ciudad, [c.region, c.codigo_postal].filter(Boolean).join(' ')].filter(Boolean).join(' ').toUpperCase()) +
      kv('Social', ssnTxt) + kv('Fecha de nacimiento', c.fecha_nacimiento ? c.fecha_nacimiento.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$2/$3/$1') : '') +
      kv('Burós analizados', (fd.buros_analizados || []).join(' · ')) + kv('Correo cliente', c.email) +
      kv('Teléfono', c.telefono ? String(c.telefono).replace(/^\+?1?(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3') : '') +
      kv('CFPB', prot('cfpb')) + kv('Correo secundario', prot('correo2')) +
      kv('Monitor de crédito', [mon, prot('monitor') ? 'clave protegida en el CRM' : ''].filter(Boolean).join(' · ')) +
      kv('Asesor · Estado', [asesor ? asesor.nombre || asesor.email : '', fd.estado_cliente, k.fecha_inicio ? 'desde ' + A.fecha(k.fecha_inicio) : ''].filter(Boolean).join(' · ')) + '</table>' +
      '<h2>Cuentas a trabajar</h2>' + tablaP(['Acreedor', 'N° cuenta', 'Balance', 'Burós', 'Date open'], cuentasP, 14) +
      '<h2>Inquiries a disputar</h2>' + tablaP(['Nombre del acreedor', 'Fecha', 'Buró', 'Disputado', 'Resultado'], inqP, 22) +
      '<div class="notas">' + esc(fd.notas_trabajo || '').replace(/\n/g, '<br>') + '</div>' +
      '<div class="salto"></div><h2>Puntajes</h2>' + pts +
      '<h2>Diagnóstico inicial</h2>' + texto(fd.diagnostico) +
      '<h2>Plan de trabajo</h2><h3>Servicios incluidos</h3>' + caja(SERVICIOS, p.servicios) + '<h3>Burós a trabajar</h3>' + caja(BUROS_TRABAJO, p.buros) +
      '<h3>Tipo de disputa / cartas</h3>' + caja(CARTAS, p.cartas) + '<h3>Prioridades de trabajo</h3>' + prio + '<h3>Notas del plan</h3>' + texto(p.notas) +
      '<h2>Historial de disputas</h2>' + dsp + (ctx.quejas.length ? '<h3>Quejas del CFPB</h3><table class="g"><tr><th>Ronda</th><th>Fecha</th><th>Número</th><th>Burós</th><th>Estado</th></tr>' + ctx.quejas.map(function (q) {
        return '<tr><td>' + q.ronda + '</td><td>' + esc(A.fecha(q.fecha)) + '</td><td>' + esc(q.numero) + '</td><td>' + esc((q.buros || []).join(', ')) + '</td><td>' + esc(q.estado) + '</td></tr>'; }).join('') + '</table>' : '') + (ctx.pagos ? '<h2>Seguimiento de pagos</h2>' + pag : '') +
      '<h2>Notas y observaciones del caso</h2><div class="tx">' + notas + '</div>';
    var w = window.open('', '_blank');
    if (!w) { A.toast('El navegador bloqueó la ventana. Permite ventanas emergentes para este sitio.', 'error'); return; }
    w.document.write('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Planilla · ' + esc(A.nombreDe(c)) + '</title><style>' +
      '@page{size:letter;margin:0.5in}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font-family:Helvetica,Arial,sans-serif;font-size:10pt;color:#3a2a22;margin:0}' +
      'h1{text-align:center;font-size:15pt;letter-spacing:.02em;margin:6px 0 10px;padding-bottom:10px;border-bottom:1.5px solid #d9aaa0}' +
      'h2{margin:18px 0 0;padding:6px 6px;background:#3d2b22;color:#fff;font-size:10.5pt;letter-spacing:.02em;text-transform:uppercase}h3{margin:10px 0 4px;font-size:9.5pt;color:#6a5848;text-transform:uppercase;letter-spacing:.06em}' +
      'table{width:100%;border-collapse:collapse;margin-bottom:4px}th,td{border:1px solid #e2b8ae;padding:4px 6px;text-align:left;vertical-align:top;font-size:9.5pt}th{background:#f8f1e7;font-weight:700}.kv th{width:34%}' +
      '.pl th{background:#363b52;color:#fff;text-align:center}.pl td{height:17px}.pl tr:nth-child(odd) td{background:#f8f1e7}.pl .n{width:28px;text-align:center;font-weight:700;background:#f8f1e7}.pl th.n{background:#363b52}' +
      '.notas{border:1px solid #e2b8ae;border-top:0;min-height:1.9in;padding:6px;font-size:9.5pt}.salto{page-break-before:always}' +
      'td hr{border:0;border-top:1px dotted #bbb;margin:3px 0}small{color:#777}.ck{display:grid;grid-template-columns:repeat(3,1fr);gap:3px 10px;font-size:9.5pt}.tx{border:1px solid #ccc;padding:6px 8px;min-height:24px;font-size:9.5pt}.tx p{margin:0 0 5px}' +
      'h2{page-break-after:avoid}table,.tx{page-break-inside:auto}tr{page-break-inside:avoid}' +
      '@media screen{body{background:#eee}main{background:#fff;max-width:7.6in;margin:20px auto;padding:.5in;box-shadow:0 2px 12px rgba(0,0,0,.15)}}' +
      '</style></head><body><main>' + html + '</main><script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>');
    w.document.close();
  }
})();
