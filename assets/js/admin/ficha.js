/* Panel CRM — Ficha del caso de crédito, con el formato de la planilla de trabajo.
   Pestaña «Ficha»: 01 datos del cliente y puntajes, 02 cuentas a trabajar, 03 inquiries, 04 historial de disputas y 05 notas.
   Pagos y documentos van en sus propias pestañas. Lo propio de la ficha se guarda en «fichas_credito» (uso interno). */
(function () {
  'use strict';
  var A = window.AVA, el = A.el, sb = A.sb;
  var BUROS3 = [['transunion', 'TransUnion'], ['experian', 'Experian'], ['equifax', 'Equifax']];
  var ESTADOS = ['Nuevo', 'En proceso', 'En pausa', 'Finalizado', 'Cancelado'];
  var BUROS_PLANILLA = ['TransUnion', 'Experian', 'Equifax', 'Innovis'];
  var RESULTADO_FILA = ['', 'PENDIENTE', 'ELIMINADA', 'VERIFICADA', 'ACTUALIZADA', 'SIN RESPUESTA'];
  var RESULTADOS = { pendiente: 'Pendiente', eliminado: 'Eliminado', corregido: 'Corregido', verificado: 'Verificado', sin_respuesta: 'Sin respuesta' };
  var ESTADO_CFPB = { preparada: 'Preparada', enviada: 'Enviada', en_revision: 'En revisión', respondida: 'Respondida', cerrada: 'Cerrada' };

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
    fd.notas = fd.notas || [];

    /* Guardado automático de la ficha */
    var estado = el('span', { class: 'fi-estado muted', text: 'Los cambios se guardan solos' });
    var espera = null;
    function guardar() {
      clearTimeout(espera);
      estado.textContent = 'Guardando…';
      espera = setTimeout(function () {
        espera = null;
        sb.from('fichas_credito').upsert({ caso_id: k.id, datos: fd, updated_at: new Date().toISOString() }).then(function (u) {
          estado.textContent = u.error ? 'No se pudo guardar' : 'Guardado ✓';
          estado.classList.toggle('error', !!u.error);
        });
      }, 700);
    }
    function salir() { if (espera) { clearTimeout(espera); sb.from('fichas_credito').upsert({ caso_id: k.id, datos: fd, updated_at: new Date().toISOString() }); } window.removeEventListener('hashchange', salir); }
    window.addEventListener('hashchange', salir);
    function campoFicha(obj, clave, tipo, extra) {
      var inp = tipo === 'textarea' ? el('textarea', Object.assign({ class: 'input', rows: 4, maxlength: 8000 }, extra || {})) : el('input', Object.assign({ class: 'input sm', type: tipo || 'text', maxlength: 300 }, extra || {}));
      inp.value = obj[clave] != null ? obj[clave] : '';
      inp.addEventListener('input', function () { obj[clave] = inp.value; guardar(); });
      return inp;
    }
    function seccion(num, titulo, hijos) {
      return el('section', { class: 'fi-sec' }, [el('h2', { class: 'fi-h' }, [el('span', { text: num }), titulo])].concat(hijos));
    }
    function campo(label, input) { return el('label', { class: 'fi-campo' }, [el('span', { text: label }), input]); }

    /* Cabecera y pestañas */
    cont.appendChild(el('div', { class: 'ph' }, [
      el('div', null, [el('div', { class: 'kicker', text: 'Ficha del cliente · uso interno' }), el('h1', null, [A.nombreDe(c) + ' ', el('span', { class: 'serif', text: (A.SERVICIOS[k.servicio] || {}).corto || '' })])]),
      el('div', { class: 'acts' }, [estado,
        el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: function () { A.verCaso(k.id); } }, [A.icon('i-layout'), el('span', { text: 'Abrir el caso' })]),
        el('button', { class: 'btn btn-dark btn-sm', type: 'button', onclick: function () { imprimir(ctx); } }, [A.icon('i-file'), el('span', { text: 'Imprimir ficha' })])])
    ]));
    var paneles = {}, botones = {};
    var tabs = [['ficha', 'Ficha']].concat(pagos ? [['pagos', 'Pagos · ' + pagos.length]] : [], A.puede('documentos') ? [['docs', 'Documentos']] : []);
    var barra = el('div', { class: 'fi-tabs', role: 'tablist' });
    tabs.forEach(function (t) {
      paneles[t[0]] = el('div', { class: 'fi-panel', role: 'tabpanel', hidden: t[0] !== 'ficha' || null });
      botones[t[0]] = el('button', { class: 'fi-tabb' + (t[0] === 'ficha' ? ' on' : ''), type: 'button', role: 'tab', 'aria-selected': t[0] === 'ficha' ? 'true' : 'false', text: t[1], onclick: function () { verTab(t[0]); } });
      barra.appendChild(botones[t[0]]);
    });
    var cargados = {};
    function verTab(id) {
      Object.keys(paneles).forEach(function (x) { paneles[x].hidden = x !== id; botones[x].classList.toggle('on', x === id); botones[x].setAttribute('aria-selected', x === id ? 'true' : 'false'); });
      if (id === 'docs' && !cargados.docs) { cargados.docs = true; paneles.docs.appendChild(A.tarjetaDocumentos(c.id, k.servicio)); }
    }
    if (tabs.length > 1) cont.appendChild(barra);
    tabs.forEach(function (t) { cont.appendChild(paneles[t[0]]); });
    var ficha = paneles.ficha;

    /* 01 Datos del cliente + puntajes */
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
    var analizados = fd.buros_analizados = fd.buros_analizados || [];
    var chipsBuros = el('div', { class: 'fi-checks fi-checks-4' }, BUROS_PLANILLA.map(function (b) {
      var i = el('input', { type: 'checkbox' }); i.checked = analizados.indexOf(b) !== -1;
      i.addEventListener('change', function () { var x = analizados.indexOf(b); if (i.checked && x === -1) analizados.push(b); if (!i.checked && x !== -1) analizados.splice(x, 1); guardar(); });
      return el('label', { class: 'fi-check' }, [i, el('span', { text: b })]);
    }));

    // Seguro Social y claves: guardados aparte, solo con el permiso «Datos sensibles» y cada vista queda registrada
    var tiene = ctx.protegido || {}, prot = null;
    var celdas = { ssn: el('div', { class: 'fi-prot' }), cfpb: el('div', { class: 'fi-prot' }), correo2: el('div', { class: 'fi-prot' }) };
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
          { k: 'correo2', label: 'Correo secundario (correo y clave)', type: 'textarea', value: actual.correo2, max: 600, full: true }
        ],
        extra: el('p', { class: 'muted', style: 'margin-top:10px;font-size:12.5px', text: 'Se guardan aparte de la ficha. Solo los ve quien tiene el permiso «Datos sensibles» y queda registrado cada vez que alguien los abre o los cambia. No salen en la ficha impresa.' }),
        guardar: async function (d, aviso) {
          d.monitor = actual.monitor || null; // el acceso del monitor ya no se muestra, pero no se borra
          var u = await sb.rpc('ficha_protegida_guardar', { p_caso: k.id, p_datos: d });
          if (u.error) { A.msg(aviso, 'No se pudieron guardar.'); return false; }
          prot = { ssn: d.ssn || '', cfpb: d.cfpb || '', correo2: d.correo2 || '', monitor: d.monitor || '' };
          tiene = { ssn: !!d.ssn, cfpb: !!d.cfpb, correo2: !!d.correo2 };
          ctx.protegido = tiene; ctx.protegidoVisto = prot; pintarProt(); A.toast('Datos protegidos guardados.');
        } });
    }
    pintarProt();

    ficha.appendChild(seccion('01', 'Datos del cliente', [
      el('div', { class: 'fi-kv' }, [
        fila('Cliente', [el('div', { class: 'fi-ro', text: A.nombreDe(c) })]),
        fila('Dirección', [el('div', { class: 'fi-dir' }, [campoCliente('direccion', 'text', { placeholder: 'Calle y número' }), campoCliente('ciudad', 'text', { placeholder: 'Ciudad' }), campoCliente('region', 'text', { placeholder: 'Estado' }), campoCliente('codigo_postal', 'text', { placeholder: 'ZIP' })])]),
        fila('Social', [celdas.ssn]),
        fila('Fecha de nacimiento', [campoCliente('fecha_nacimiento', 'date')]),
        fila('Burós analizados', [chipsBuros]),
        fila('Correo cliente', [campoCliente('email', 'email')]),
        fila('Teléfono', [campoCliente('telefono', 'tel')]),
        fila('CFPB', [celdas.cfpb]),
        fila('Correo secundario', [celdas.correo2])
      ]),
      accionesProt,
      el('div', { class: 'fi-grid', style: 'margin-top:16px' }, [campo('Fecha inicio', inicio), campo('Estado del cliente', est), campo('Asesor', asesor)]),
      el('div', { class: 'fi-bloque' }, [el('h3', { text: 'Puntajes' }), tablaPuntajes(ctx)])
    ]));

    /* 02 Cuentas a trabajar y 03 Inquiries a disputar: tablas de la planilla */
    function buroCorto(b) { return { equifax: 'EQ', experian: 'EX', transunion: 'TU', innovis: 'IN' }[b] || b; }
    var cuentas = fd.cuentas = fd.cuentas || [];
    var cuentasDelReporte = rep ? (rep.cuentas || []).filter(function (x) { return x.negativa; }).map(function (x) {
      var bs = Object.keys(x.buros || {}).filter(function (b) { return x.buros[b]; });
      var d0 = x.buros[bs[0]] || {};
      return { acreedor: x.nombre || '', numero: x.numero || d0.numero || '', balance: d0.saldo || '', buros: ['transunion', 'experian', 'equifax'].filter(function (b) { return bs.indexOf(b) !== -1; }).map(buroCorto).join(','), abierta: d0.abierta || '', disputado: '', resultado: '' };
    }) : [];
    ficha.appendChild(seccion('02', 'Cuentas a trabajar', [tablaEditable(cuentas, [
      { k: 'acreedor', t: 'Acreedor', w: '1.5fr' }, { k: 'numero', t: 'N° cuenta', w: '1fr' }, { k: 'balance', t: 'Balance', w: '.8fr' },
      { k: 'buros', t: 'Buró', w: '.75fr', ph: 'TU,EX,EQ' }, { k: 'abierta', t: 'Fecha', w: '1.05fr', ph: 'MM/DD/AAAA' },
      { k: 'disputado', t: 'Disputado', w: '1.45fr', tipo: 'date' }, { k: 'resultado', t: 'Resultado', w: '1.15fr', opciones: RESULTADO_FILA }
    ], 'cuenta', cuentasDelReporte, function (x) { return (x.acreedor + '|' + x.numero).toLowerCase(); })]));

    var inqs = fd.inquiries = fd.inquiries || [];
    var inqDelReporte = rep ? (rep.consultas || []).map(function (q) { return { acreedor: q.acreedor || '', fecha: q.fecha || '', buro: (q.buro || '').toUpperCase(), disputado: '', resultado: '' }; }) : [];
    ficha.appendChild(seccion('03', 'Inquiries a disputar', [tablaEditable(inqs, [
      { k: 'acreedor', t: 'Acreedor', w: '1.8fr' }, { k: 'fecha', t: 'Fecha', w: '1fr', ph: 'MM/DD/AAAA' },
      { k: 'buro', t: 'Buró', w: '1.1fr', opciones: ['', 'EQUIFAX', 'EXPERIAN', 'TRANSUNION', 'INNOVIS'] },
      { k: 'disputado', t: 'Disputado', w: '1.25fr', tipo: 'date' }, { k: 'resultado', t: 'Resultado', w: '1.15fr', opciones: RESULTADO_FILA }
    ], 'inquiry', inqDelReporte, function (x) { return (x.acreedor + '|' + x.fecha + '|' + x.buro).toLowerCase(); })]));

    // Tabla que se edita como la planilla: se guarda sola, se agregan filas y se pueden traer del reporte de SmartCredit
    function tablaEditable(lista, cols, nombre, delReporte, clave) {
      var caja = el('div', { class: 'fi-tab' });
      var plantilla = '26px ' + cols.map(function (x) { return x.w; }).join(' ') + ' 28px';
      function nueva() { var o = {}; cols.forEach(function (x) { o[x.k] = ''; }); return o; }
      function pintarT() {
        caja.innerHTML = '';
        if (!lista.length) lista.push(nueva(), nueva(), nueva());
        caja.appendChild(el('div', { class: 'fi-tab-f cab', style: 'grid-template-columns:' + plantilla }, [el('span', { text: '#' })].concat(cols.map(function (x) { return el('span', { text: x.t }); }), [el('span')])));
        lista.forEach(function (f, n) {
          caja.appendChild(el('div', { class: 'fi-tab-f', style: 'grid-template-columns:' + plantilla }, [el('span', { class: 'n', text: n + 1 })].concat(cols.map(function (x) {
            var inp;
            if (x.opciones) {
              inp = el('select', { class: 'input sm', 'aria-label': x.t }, x.opciones.map(function (o) { return el('option', { value: o, text: o || '—' }); }));
              inp.value = f[x.k] || '';
              inp.addEventListener('change', function () { f[x.k] = inp.value; guardar(); });
            } else {
              inp = el('input', { class: 'input sm', type: x.tipo || 'text', maxlength: 160, placeholder: x.ph || '', 'aria-label': x.t });
              inp.value = f[x.k] || '';
              inp.addEventListener('input', function () { f[x.k] = inp.value; guardar(); });
            }
            return el('label', { class: 'fi-tab-c', 'data-t': x.t }, [inp]);
          }), [el('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Quitar fila ' + (n + 1), title: 'Quitar fila', onclick: function () {
            if (cols.some(function (x) { return f[x.k]; }) && !confirm('¿Quitar la fila ' + (n + 1) + '?')) return;
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

    /* 04 Historial de disputas */
    ficha.appendChild(seccion('04', 'Historial de disputas', [tabla(['Fecha', 'Elemento disputado', 'Buró', 'Ronda', 'Resultado'], disp.map(function (d) {
      return [A.fecha(d.fecha_envio), d.acreedor, (d.buro || '').replace(/^./, function (x) { return x.toUpperCase(); }), String(d.ronda), RESULTADOS[d.resultado] || d.resultado];
    }), 'Aún no hay disputas registradas. Se agregan desde el caso, en «Disputas».'),
      quejas.length ? el('div', { class: 'fi-bloque' }, [el('h3', { text: 'Quejas del CFPB' }), tabla(['Ronda', 'Fecha', 'Número', 'Burós', 'Estado'], quejas.map(function (q) {
        return [String(q.ronda), A.fecha(q.fecha), q.numero || '', (q.buros || []).join(', '), ESTADO_CFPB[q.estado]];
      }), '')]) : null]));

    /* 05 Notas (incluye el diagnóstico) */
    if (fd.inq_disputables && !fd.notas_trabajo) { fd.notas_trabajo = 'Inquiries disputables: ' + fd.inq_disputables; delete fd.inq_disputables; guardar(); }
    if (fd.diagnostico && !fd.diagnostico_en_notas) {
      fd.notas_trabajo = 'Diagnóstico: ' + fd.diagnostico + (fd.notas_trabajo ? '\n\n' + fd.notas_trabajo : '');
      fd.diagnostico_en_notas = true; guardar();
    }
    var notas = el('div', { class: 'fi-notas' });
    function pintarNotas() {
      notas.innerHTML = '';
      fd.notas.slice().reverse().forEach(function (n) {
        notas.appendChild(el('div', { class: 'fi-nota-i' }, [el('div', { class: 'fi-nota-h' }, [el('b', { text: n.autor || 'Equipo' }), el('span', { class: 'muted', text: A.fecha(n.fecha.slice(0, 10)) }),
          el('button', { class: 'link-btn', type: 'button', text: 'Quitar', onclick: function () { if (!confirm('¿Quitar esta nota?')) return; fd.notas.splice(fd.notas.indexOf(n), 1); guardar(); pintarNotas(); } })]), el('p', { text: n.texto })]));
      });
    }
    var nueva = el('textarea', { class: 'input', rows: 2, maxlength: 4000, placeholder: 'Agregar una observación con fecha (queda quién la escribió)…' });
    ficha.appendChild(seccion('05', 'Notas', [
      campoFicha(fd, 'notas_trabajo', 'textarea', { rows: 7, placeholder: 'Diagnóstico del caso y notas de trabajo. Ej.: Carta de información personal a TransUnion, Equifax y Experian enviada el 29 de septiembre.' }),
      el('div', { class: 'fi-bloque' }, [el('h3', { text: 'Observaciones con fecha' }), nueva,
        el('button', { class: 'btn btn-dark btn-sm', type: 'button', style: 'margin:8px 0 12px', onclick: function () {
          var t = nueva.value.trim(); if (!t) { A.toast('Escribe la observación en la casilla y después toca Agregar.', 'error'); nueva.focus(); return; }
          var yo = A.yo() || {};
          fd.notas.push({ fecha: new Date().toISOString(), autor: yo.nombre || yo.email || 'Equipo', texto: t });
          nueva.value = ''; guardar(); pintarNotas();
        } }, [A.icon('i-plus', 'icon-sm'), el('span', { text: 'Agregar' })]), notas])
    ]));
    pintarNotas();

    /* Pestaña Pagos */
    if (pagos) {
      paneles.pagos.appendChild(el('section', { class: 'fi-sec' }, [
        el('div', { class: 'card-h' }, [el('h2', { class: 'fi-h', style: 'margin:0' }, ['Pagos del caso']),
          el('button', { class: 'mini-btn', type: 'button', text: 'Registrar pago', onclick: function () { A.registrarPago({ cliente_id: k.cliente_id, caso_id: k.id }, function () { A.ir('ficha/' + k.id); }); } })]),
        tabla(['Fecha', 'Concepto', 'Monto', 'Método'], pagos.map(function (p) {
          return [A.fecha(p.fecha), p.nota || 'Pago #' + p.numero, A.dinero(p.monto), (A.METODOS || {})[p.metodo] || p.metodo];
        }), 'Aún no hay pagos registrados en este caso.')
      ]));
    }
  }

  function tabla(cab, filas, vacio) {
    if (!filas.length) return el('div', { class: 'muted', text: vacio });
    return el('div', { class: 'tbl-wrap fi-tbl' }, [el('table', { class: 'tbl' }, [el('thead', null, [el('tr', null, cab.map(function (h) { return el('th', { text: h }); }))]),
      el('tbody', null, filas.map(function (f) { return el('tr', null, f.map(function (v) { return el('td', { text: v == null || v === '' ? '—' : v }); })); }))])]);
  }

  /* Puntajes: inicial (primer registro) y actual (último) de los 3 burós */
  function inicialActual(pts, b) {
    var con = pts.filter(function (p) { return p[b] != null; });
    return { ini: con.length ? con[0][b] : null, act: con.length ? con[con.length - 1][b] : null };
  }
  function tablaPuntajes(ctx) {
    var t = el('div', { class: 'fi-pts fi-pts-3' });
    t.appendChild(el('span', { class: 'cab' })); BUROS3.forEach(function (b) { t.appendChild(el('span', { class: 'cab', text: b[1] })); });
    [['Inicial', 'ini'], ['Actual', 'act']].forEach(function (f) {
      t.appendChild(el('span', { class: 'lab', text: f[0] }));
      BUROS3.forEach(function (b) { var v = inicialActual(ctx.pts, b[0])[f[1]]; t.appendChild(el('span', { class: 'val', text: v != null ? v : '—' })); });
    });
    var f = { fecha: el('input', { class: 'input sm', type: 'date', value: A.hoyISO(), 'aria-label': 'Fecha' }) };
    BUROS3.forEach(function (b) { f[b[0]] = el('input', { class: 'input sm', type: 'number', min: '300', max: '850', placeholder: b[1], 'aria-label': b[1] }); });
    var form = el('form', { class: 'inline-form fi-pts-form', onsubmit: async function (e) {
      e.preventDefault();
      var d = { caso_id: ctx.k.id, fecha: f.fecha.value || A.hoyISO() }, alguno = false, malo = false;
      BUROS3.forEach(function (b) { var v = f[b[0]].value.trim(); if (v) { var n = Number(v); if (!(n >= 300 && n <= 850)) malo = true; d[b[0]] = n; alguno = true; } });
      if (!alguno || malo) { A.toast('Escribe puntajes entre 300 y 850.', 'error'); return; }
      var ins = await sb.from('puntajes').insert(d);
      if (ins.error) { A.toast('No se pudieron guardar los puntajes.', 'error'); return; }
      A.toast('Puntajes registrados.'); A.ir('ficha/' + ctx.k.id);
    } }, [f.fecha].concat(BUROS3.map(function (b) { return f[b[0]]; })).concat([el('button', { class: 'btn btn-dark btn-sm', type: 'submit', text: 'Registrar' })]));
    return el('div', null, [t, form, ctx.rep ? el('p', { class: 'muted fi-nota', text: 'Al importar un reporte de SmartCredit en el caso, sus puntajes se registran solos.' }) : null]);
  }

  /* ---------- Imprimir la ficha con el formato de la planilla ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function mdy(iso) { return iso ? String(iso).replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$2/$3/$1') : ''; }
  function imprimir(ctx) {
    var k = ctx.k, c = ctx.c, fd = ctx.fd;
    var asesor = ctx.equipo.filter(function (m) { return m.user_id === k.responsable; })[0];
    // Seguro Social y claves no se imprimen: solo los últimos 4 del Social si se vieron en pantalla
    var pv = ctx.protegidoVisto, pr = ctx.protegido || {};
    var ssnTxt = pv && pv.ssn ? '***-**-' + String(pv.ssn).replace(/\D/g, '').slice(-4) : pr.ssn ? 'Guardado en el CRM (protegido)' : '';
    function prot(kk) { return pr[kk] ? 'Guardado en el CRM (protegido)' : ''; }
    function kv(label, valor) { return '<tr><th>' + esc(label) + '</th><td>' + esc(valor) + '</td></tr>'; }
    function tablaP(cab, filas, minimo) {
      var cuerpo = filas.map(function (f, n) { return '<tr><td class="n">' + (n + 1) + '</td>' + f.map(function (v) { return '<td>' + esc(v) + '</td>'; }).join('') + '</tr>'; });
      for (var n = filas.length; n < minimo; n++) cuerpo.push('<tr><td class="n">' + (n + 1) + '</td>' + cab.map(function () { return '<td>&nbsp;</td>'; }).join('') + '</tr>');
      return '<table class="pl"><tr><th class="n">#</th>' + cab.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr>' + cuerpo.join('') + '</table>';
    }
    function llena(x, ks) { return ks.some(function (q) { return x[q]; }); }
    var pts = '<table class="g"><tr><th></th>' + BUROS3.map(function (b) { return '<th>' + b[1] + '</th>'; }).join('') + '</tr>' +
      [['Inicial', 'ini'], ['Actual', 'act']].map(function (f) { return '<tr><th>' + f[0] + '</th>' + BUROS3.map(function (b) { var v = inicialActual(ctx.pts, b[0])[f[1]]; return '<td>' + esc(v != null ? v : '') + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>';
    var cuentasP = (fd.cuentas || []).filter(function (x) { return llena(x, ['acreedor', 'numero', 'balance', 'buros', 'abierta', 'disputado', 'resultado']); })
      .map(function (x) { return [x.acreedor, x.numero, x.balance, x.buros, x.abierta, mdy(x.disputado), x.resultado]; });
    var inqP = (fd.inquiries || []).filter(function (x) { return llena(x, ['acreedor', 'fecha', 'buro', 'disputado', 'resultado']); })
      .map(function (x) { return [x.acreedor, x.fecha, x.buro, mdy(x.disputado), x.resultado]; });
    var dsp = ctx.disp.length ? '<table class="g"><tr><th>Fecha</th><th>Elemento disputado</th><th>Buró</th><th>Ronda</th><th>Resultado</th></tr>' + ctx.disp.map(function (d) {
      return '<tr><td>' + esc(A.fecha(d.fecha_envio)) + '</td><td>' + esc(d.acreedor) + '</td><td>' + esc((d.buro || '').replace(/^./, function (x) { return x.toUpperCase(); })) + '</td><td>' + d.ronda + '</td><td>' + esc(RESULTADOS[d.resultado] || d.resultado) + '</td></tr>'; }).join('') + '</table>' : '<div class="tx">Sin disputas registradas.</div>';
    var cfpb = ctx.quejas.length ? '<h3>Quejas del CFPB</h3><table class="g"><tr><th>Ronda</th><th>Fecha</th><th>Número</th><th>Burós</th><th>Estado</th></tr>' + ctx.quejas.map(function (q) {
      return '<tr><td>' + q.ronda + '</td><td>' + esc(A.fecha(q.fecha)) + '</td><td>' + esc(q.numero) + '</td><td>' + esc((q.buros || []).join(', ')) + '</td><td>' + esc(ESTADO_CFPB[q.estado] || q.estado) + '</td></tr>'; }).join('') + '</table>' : '';
    var obs = (fd.notas || []).map(function (n) { return '<p><b>' + esc(A.fecha(n.fecha.slice(0, 10))) + ' · ' + esc(n.autor) + ':</b> ' + esc(n.texto).replace(/\n/g, '<br>') + '</p>'; }).join('');
    var html = '<h1>PLANILLA DE TRABAJO DEL CLIENTE</h1>' +
      '<h2>Datos del cliente</h2><table class="kv">' +
      kv('Cliente', A.nombreDe(c).toUpperCase()) +
      kv('Dirección', [c.direccion, c.ciudad, [c.region, c.codigo_postal].filter(Boolean).join(' ')].filter(Boolean).join(' ').toUpperCase()) +
      kv('Social', ssnTxt) + kv('Fecha de nacimiento', mdy(c.fecha_nacimiento)) +
      kv('Burós analizados', (fd.buros_analizados || []).join(' · ')) + kv('Correo cliente', c.email) +
      kv('Teléfono', c.telefono ? String(c.telefono).replace(/^\+?1?(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3') : '') +
      kv('CFPB', prot('cfpb')) + kv('Correo secundario', prot('correo2')) +
      kv('Asesor · Estado', [asesor ? asesor.nombre || asesor.email : '', fd.estado_cliente, k.fecha_inicio ? 'desde ' + A.fecha(k.fecha_inicio) : ''].filter(Boolean).join(' · ')) + '</table>' +
      '<h3>Puntajes</h3>' + pts +
      '<h2>Cuentas a trabajar</h2>' + tablaP(['Acreedor', 'N° cuenta', 'Balance', 'Buró', 'Fecha', 'Disputado', 'Resultado'], cuentasP, 14) +
      '<h2>Inquiries a disputar</h2>' + tablaP(['Acreedor', 'Fecha', 'Buró', 'Disputado', 'Resultado'], inqP, 22) +
      '<h2>Historial de disputas</h2>' + dsp + cfpb +
      '<h2>Notas</h2><div class="notas">' + esc(fd.notas_trabajo || '').replace(/\n/g, '<br>') + (obs ? '<div class="obs">' + obs + '</div>' : '') + '</div>';
    var w = window.open('', '_blank');
    if (!w) { A.toast('El navegador bloqueó la ventana. Permite ventanas emergentes para este sitio.', 'error'); return; }
    w.document.write('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Planilla · ' + esc(A.nombreDe(c)) + '</title><style>' +
      '@page{size:letter;margin:0.5in}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font-family:Helvetica,Arial,sans-serif;font-size:10pt;color:#3a2a22;margin:0}' +
      'h1{text-align:center;font-size:15pt;letter-spacing:.02em;margin:6px 0 10px;padding-bottom:10px;border-bottom:1.5px solid #d9aaa0}' +
      'h2{margin:18px 0 0;padding:6px 6px;background:#3d2b22;color:#fff;font-size:10.5pt;letter-spacing:.02em;text-transform:uppercase}h3{margin:10px 0 4px;font-size:9.5pt;color:#6a5848;text-transform:uppercase;letter-spacing:.06em}' +
      'table{width:100%;border-collapse:collapse;margin-bottom:4px}th,td{border:1px solid #e2b8ae;padding:4px 6px;text-align:left;vertical-align:top;font-size:9.5pt}th{background:#f8f1e7;font-weight:700}.kv th{width:34%}' +
      '.g th{text-align:center}.g td{text-align:center}.g td:first-child{text-align:left}' +
      '.pl th{background:#363b52;color:#fff;text-align:center}.pl td{height:17px}.pl tr:nth-child(odd) td{background:#f8f1e7}.pl .n{width:28px;text-align:center;font-weight:700;background:#f8f1e7}.pl th.n{background:#363b52}' +
      '.notas{border:1px solid #e2b8ae;border-top:0;min-height:1.6in;padding:6px;font-size:9.5pt}.obs{margin-top:10px;padding-top:6px;border-top:1px dotted #e2b8ae}.obs p{margin:0 0 5px}.tx{border:1px solid #e2b8ae;padding:6px 8px;font-size:9.5pt}' +
      'h2{page-break-after:avoid}tr{page-break-inside:avoid}' +
      '@media screen{body{background:#eee}main{background:#fff;max-width:7.6in;margin:20px auto;padding:.5in;box-shadow:0 2px 12px rgba(0,0,0,.15)}}' +
      '</style></head><body><main>' + html + '</main><script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>');
    w.document.close();
  }
})();
