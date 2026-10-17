/* Panel CRM — Inicio: el negocio en números y lo que hay que hacer hoy */
(function () {
  'use strict';
  var A = window.AVA, el = A.el, sb = A.sb;

  function saludo() { var h = new Date().getHours(); return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'; }
  function masDias(n) { var d = new Date(); d.setDate(d.getDate() + n); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
  var vacio = Promise.resolve({ data: [] });

  /* Embudo de ventas: de contacto a cliente que paga, y qué origen trae clientes que pagan */
  var periodo = 'mes';
  function desdeDe(p) {
    var d = new Date();
    if (p === 'mes') return d.toISOString().slice(0, 7) + '-01';
    d.setDate(d.getDate() - (p === '90' ? 90 : 365));
    return d.toISOString().slice(0, 10);
  }
  function embudo() {
    var card = el('div', { class: 'card' });
    var cuerpo = el('div', { class: 'muted', text: 'Cargando…' });
    var tabs = el('div', { class: 'fn-tabs', role: 'tablist' });
    [['mes', 'Este mes'], ['90', '90 días'], ['365', '12 meses']].forEach(function (t) {
      tabs.appendChild(el('button', { type: 'button', role: 'tab', class: periodo === t[0] ? 'on' : '', 'aria-selected': String(periodo === t[0]), text: t[1], onclick: function () {
        periodo = t[0]; tabs.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b === this); b.setAttribute('aria-selected', String(b === this)); }, this); cargar();
      } }));
    });
    card.appendChild(el('div', { class: 'card-h' }, [el('h3', { class: 't', text: 'Embudo de ventas' }), tabs]));
    card.appendChild(cuerpo);
    async function cargar() {
      var desde = desdeDe(periodo), desdeTs = new Date(desde + 'T00:00:00').toISOString();
      var cobros = A.puede('cobros'), sol = A.puede('solicitudes'), msj = A.puede('mensajes');
      var r = await Promise.all([
        sol ? sb.from('solicitudes').select('id', { count: 'exact', head: true }).gte('created_at', desdeTs) : Promise.resolve({ count: 0 }),
        sol ? sb.from('mensajes_web').select('origen').gte('created_at', desdeTs) : Promise.resolve({ data: [] }),
        sb.from('clientes').select('id,origen').gte('created_at', desdeTs).limit(5000),
        sb.from('casos').select('cliente_id').gte('created_at', desdeTs).limit(10000),
        cobros ? sb.from('pagos').select('cliente_id,monto').gte('fecha', desde).limit(10000) : Promise.resolve({ data: [] }),
        msj ? sb.from('conversaciones').select('canal,etapa,cliente_id').eq('prospecto', true).gte('created_at', desdeTs).limit(5000) : Promise.resolve({ data: [] })
      ]);
      var prospectos = r[5].data || [];
      var contactos = (r[0].count || 0) + (r[1].data || []).length + prospectos.length;
      var nuevos = r[2].data || [];
      var conCaso = new Set((r[3].data || []).map(function (x) { return x.cliente_id; }));
      var pagoDe = {};
      (r[4].data || []).forEach(function (p) { pagoDe[p.cliente_id] = (pagoDe[p.cliente_id] || 0) + Number(p.monto); });
      var servicio = nuevos.filter(function (c) { return conCaso.has(c.id); }).length;
      var pagaron = nuevos.filter(function (c) { return pagoDe[c.id] > 0; }).length;
      var pasos = [];
      if (sol || msj) pasos.push(['Contactos', contactos, 'Solicitudes, mensajes del sitio, leads de anuncios y prospectos de WhatsApp, Messenger e Instagram']);
      pasos.push(['Clientes nuevos', nuevos.length, 'Personas que registraste como cliente']);
      pasos.push(['Con servicio', servicio, 'Clientes nuevos con al menos un caso']);
      if (cobros) pasos.push(['Pagaron', pagaron, 'Clientes nuevos con al menos un pago']);
      var max = Math.max.apply(null, pasos.map(function (p) { return p[1]; }).concat([1]));
      cuerpo.className = 'funnel'; cuerpo.innerHTML = '';
      if (!nuevos.length && !contactos) { cuerpo.className = 'muted'; cuerpo.textContent = 'Aún no hay contactos ni clientes nuevos en este periodo.'; return; }
      pasos.forEach(function (p, i) {
        cuerpo.appendChild(el('div', { class: 'fn-row', title: p[2] + ': ' + p[1] }, [
          el('span', { text: p[0] }), el('span', { class: 'fn-t' }, [el('i', { style: 'width:' + Math.max(p[1] ? 2 : 0, p[1] / max * 100) + '%;animation-delay:' + i * 90 + 'ms' })]), el('b', { text: p[1] })
        ]));
        var prev = pasos[i - 1];
        if (prev && prev[0] !== 'Contactos' && prev[1]) cuerpo.appendChild(el('div', { class: 'fn-row' }, [el('span'), el('span', { class: 'fn-step', text: Math.round(p[1] / prev[1] * 100) + '% de «' + prev[0].toLowerCase() + '»' })]));
      });
      // Por origen
      var org = {};
      nuevos.forEach(function (c) {
        var o = org[c.origen || 'otro'] = org[c.origen || 'otro'] || { n: 0, pag: 0, ing: 0 };
        o.n++; if (pagoDe[c.id] > 0) { o.pag++; o.ing += pagoDe[c.id]; }
      });
      var leadsMeta = (r[1].data || []).filter(function (m) { return m.origen === 'meta_ads'; }).length;
      var filas = Object.keys(org).map(function (k) { return [k, org[k]]; }).sort(function (a, b) { return (b[1].ing - a[1].ing) || (b[1].n - a[1].n); });
      if (filas.length) {
        var tb = el('tbody');
        filas.forEach(function (f) {
          tb.appendChild(el('tr', null, [el('td', { text: A.ORIGENES[f[0]] || f[0] }), el('td', { text: f[1].n }),
            cobros ? el('td', { text: f[1].pag }) : null, cobros ? el('td', { class: 'hide-m', text: Math.round(f[1].pag / f[1].n * 100) + '%' }) : null,
            cobros ? el('td', { text: A.dinero(f[1].ing) || '$0' }) : null]));
        });
        cuerpo.appendChild(el('table', { class: 'tbl-org' }, [el('thead', null, [el('tr', null, [el('th', { text: 'Origen' }), el('th', { text: 'Clientes' }),
          cobros ? el('th', { text: 'Pagaron' }) : null, cobros ? el('th', { class: 'hide-m', text: 'Conversión' }) : null, cobros ? el('th', { text: 'Ingresos' }) : null])]), tb]));
      }
      // Prospectos que escribieron por redes: cuántos se interesaron y cuántos se volvieron clientes
      if (prospectos.length) {
        var porCanal = {};
        prospectos.forEach(function (c) {
          var o = porCanal[c.canal] = porCanal[c.canal] || { n: 0, int: 0, cli: 0 };
          o.n++; if (['interesado', 'cita', 'cliente'].indexOf(c.etapa) >= 0 || c.cliente_id) o.int++; if (c.cliente_id) o.cli++;
        });
        var NOMBRE = { whatsapp: 'WhatsApp', messenger: 'Messenger', instagram: 'Instagram', sms: 'SMS' };
        var tp = el('tbody');
        Object.keys(porCanal).sort(function (a, b) { return porCanal[b].n - porCanal[a].n; }).forEach(function (k) {
          var o = porCanal[k];
          tp.appendChild(el('tr', null, [el('td', null, [el('span', { class: 'ch-txt ch-' + k, text: NOMBRE[k] || k })]), el('td', { text: o.n }), el('td', { text: o.int }), el('td', { text: o.cli }), el('td', { class: 'hide-m', text: Math.round(o.cli / o.n * 100) + '%' })]));
        });
        cuerpo.appendChild(el('table', { class: 'tbl-org' }, [el('thead', null, [el('tr', null, [el('th', { text: 'Prospectos por chat' }), el('th', { text: 'Llegaron' }), el('th', { text: 'Interesados' }), el('th', { text: 'Clientes' }), el('th', { class: 'hide-m', text: 'Conversión' })])]), tp]));
      }
      if (leadsMeta) cuerpo.appendChild(el('p', { class: 'muted', style: 'margin-top:10px;font-size:12.5px', text: leadsMeta + (leadsMeta === 1 ? ' lead llegó' : ' leads llegaron') + ' de tus anuncios de Meta en este periodo.' }));
    }
    cargar();
    return card;
  }

  A.vista('inicio', {
    permiso: null,
    render: async function (cont) {
      var yo = A.yo();
      var nombre = (yo.nombre || yo.email).split(' ')[0];
      cont.appendChild(el('div', { class: 'ph' }, [el('div', null, [
        el('div', { class: 'kicker', text: new Date().toLocaleDateString('es-US', { weekday: 'long', day: 'numeric', month: 'long' }) }),
        el('h1', null, [saludo() + ', ', el('span', { class: 'serif', text: nombre })])
      ])]));
      var kpis = el('div', { class: 'stats kpis' });
      var hoyBox = el('div', { class: 'card' }, [el('h3', { class: 't', text: 'Para hoy' }), el('div', { class: 'muted', text: 'Cargando…' })]);
      var der = el('div');
      cont.appendChild(kpis);
      var izq = el('div', null, [hoyBox]);
      cont.appendChild(el('div', { class: 'cols', style: 'grid-template-columns:minmax(0,1.25fr) minmax(0,1fr)' }, [izq, der]));
      if (A.puede('clientes')) izq.appendChild(embudo());

      var hoy = A.hoyISO(), en3 = masDias(3), mesIni = hoy.slice(0, 7) + '-01';
      var ini6 = new Date(); ini6.setDate(1); ini6.setMonth(ini6.getMonth() - 5);
      var ini6ISO = ini6.toISOString().slice(0, 7) + '-01';
      var c = A.puede('casos') || A.puede('clientes');
      var res = await Promise.all([
        c ? sb.from('casos').select('id,servicio,estado,etapa,precio,fecha_entrega,datos,titulo,cliente_id, clientes(id,nombre,apellidos)').neq('estado', 'cancelado') : vacio,
        sb.from('tareas').select('*, clientes(id,nombre,apellidos)').eq('hecha', false).lte('fecha', hoy).eq('asignada_a', yo.user_id).order('fecha'),
        A.puede('casos') ? sb.from('disputas').select('id,acreedor,buro,fecha_limite,caso_id, casos(id,cliente_id, clientes(id,nombre,apellidos))').eq('resultado', 'pendiente').lte('fecha_limite', en3).order('fecha_limite') : vacio,
        A.puede('cobros') ? sb.from('pagos').select('monto,fecha,caso_id').gte('fecha', ini6ISO) : vacio,
        A.puede('casos') ? sb.from('puntajes').select('caso_id,fecha,equifax,experian,transunion').order('fecha') : vacio,
        A.puede('solicitudes') ? sb.from('solicitudes').select('id', { count: 'exact', head: true }).eq('estado', 'nuevo') : Promise.resolve({ count: 0 }),
        A.puede('solicitudes') ? sb.from('mensajes_web').select('id', { count: 'exact', head: true }).eq('estado', 'nuevo') : Promise.resolve({ count: 0 }),
        A.puede('contenido') ? sb.from('contenido').select('id', { count: 'exact', head: true }).eq('estado', 'por_aprobar') : Promise.resolve({ count: 0 }),
        A.puede('cobros') ? sb.from('casos').select('precio, pagos(monto)').neq('estado', 'cancelado').not('precio', 'is', null) : vacio,
        A.puede('mensajes') ? sb.from('cola_mensajes').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente').lte('programado_para', new Date().toISOString()) : Promise.resolve({ count: 0 }),
        A.puede('citas') ? sb.from('citas').select('id', { count: 'exact', head: true }).in('estado', ['solicitada', 'confirmada']).gte('inicio', new Date(hoy + 'T00:00:00').toISOString()).lt('inicio', new Date(masDias(1) + 'T00:00:00').toISOString()) : Promise.resolve({ count: 0 })
      ]);
      var casos = res[0].data || [], tareas = res[1].data || [], disp = res[2].data || [], pagos = res[3].data || [], punt = res[4].data || [];
      var activos = casos.filter(function (k) { return k.estado === 'activo'; });
      var suma = function (l) { return l.reduce(function (a, p) { return a + Number(p.monto); }, 0); };

      // Puntos promedio ganados por cliente de crédito
      var porCaso = {};
      punt.forEach(function (p) { (porCaso[p.caso_id] = porCaso[p.caso_id] || []).push(p); });
      var ganancias = Object.keys(porCaso).filter(function (k) { return porCaso[k].length > 1; }).map(function (k) {
        var l = porCaso[k]; return A.promedio(l[l.length - 1]) - A.promedio(l[0]);
      });
      var puntos = ganancias.length ? Math.round(ganancias.reduce(function (a, b) { return a + b; }, 0) / ganancias.length) : null;

      var lista = [];
      if (c) lista.push([new Set(activos.map(function (k) { return k.cliente_id; })).size, 'Clientes activos', '#/clientes']);
      if (c) lista.push([activos.length, 'Casos en curso', '#/casos']);
      if (A.puede('cobros')) {
        lista.push([A.dinero(suma(pagos.filter(function (p) { return p.fecha >= mesIni; }))) || '$0', 'Ingresos del mes', '#/cobros']);
        var saldo = (res[8].data || []).reduce(function (a, k) { return a + Math.max(0, Number(k.precio) - suma(k.pagos || [])); }, 0);
        lista.push([A.dinero(saldo) || '$0', 'Por cobrar', '#/cobros']);
      }
      if (A.puede('casos')) lista.push([puntos != null ? (puntos >= 0 ? '+' : '') + puntos : '—', 'Puntos de crédito ganados (promedio)', '#/casos']);
      var nuevas = (res[5].count || 0) + (res[6].count || 0);
      if (A.puede('solicitudes')) lista.push([nuevas, 'Solicitudes nuevas', '#/solicitudes']);
      if (A.puede('contenido')) lista.push([res[7].count || 0, 'Diseños por aprobar', '#/contenido']);
      if (A.puede('mensajes')) lista.push([res[9].count || 0, 'Mensajes por enviar', '#/bandeja/cola']);
      if (A.puede('citas')) lista.push([res[10].count || 0, 'Citas hoy', '#/agenda']);
      lista.slice(0, 10).forEach(function (s, i) {
        kpis.appendChild(el('a', { class: 'stat', href: s[2], style: 'animation-delay:' + i * 60 + 'ms' }, [el('div', { class: 'k', text: s[0] }), el('div', { class: 'l', text: s[1] })]));
      });

      // Para hoy
      var items = [];
      tareas.forEach(function (t) { items.push({ f: t.fecha, nodo: A.filaTarea(t, function () { A.ir('inicio'); }, { cliente: true }) }); });
      disp.forEach(function (d) {
        var cl = d.casos && d.casos.clientes;
        items.push({ f: d.fecha_limite, nodo: el('button', { class: 'today-i', type: 'button', onclick: function () { A.verCaso(d.caso_id, function () { A.ir('inicio'); }); } }, [
          el('span', { class: 'ti-ico warn' }, [A.icon('i-alert', 'icon-sm')]),
          el('span', null, [el('b', { text: 'Respuesta del buró · ' + (cl ? A.nombreDe(cl) : '') }), el('span', { class: 'muted', text: d.acreedor + ' · ' + A.BUROS[d.buro].n + ' · ' + (d.fecha_limite < hoy ? 'venció el ' : 'vence el ') + A.fecha(d.fecha_limite) })])
        ]) });
      });
      activos.filter(function (k) { return k.fecha_entrega && k.fecha_entrega <= en3; }).forEach(function (k) {
        items.push({ f: k.fecha_entrega, nodo: el('button', { class: 'today-i', type: 'button', onclick: function () { A.verCaso(k.id, function () { A.ir('inicio'); }); } }, [
          el('span', { class: 'ti-ico', 'data-svc': k.servicio }, [A.icon('i-clock', 'icon-sm')]),
          el('span', null, [el('b', { text: 'Entrega · ' + A.nombreDe(k.clientes || {}) }), el('span', { class: 'muted', text: (k.titulo || A.SERVICIOS[k.servicio].label) + ' · ' + (k.fecha_entrega < hoy ? 'atrasada desde ' : '') + A.fecha(k.fecha_entrega) })])
        ]) });
      });
      casos.filter(function (k) { return k.servicio === 'credito' && k.datos && k.datos.fecha_contrato; }).forEach(function (k) {
        var fin = A.finCancelacion(k.datos.fecha_contrato);
        if (fin && hoy <= fin) items.push({ f: fin, nodo: el('button', { class: 'today-i', type: 'button', onclick: function () { A.verCaso(k.id); } }, [
          el('span', { class: 'ti-ico' }, [A.icon('i-shield', 'icon-sm')]),
          el('span', null, [el('b', { text: 'Periodo de cancelación · ' + A.nombreDe(k.clientes || {}) }), el('span', { class: 'muted', text: 'Hasta el ' + A.fecha(fin) + '. Aún no se puede cobrar ni disputar.' })])
        ]) });
      });
      casos.filter(function (k) { return k.estado === 'activo' && k.servicio === 'credito' && k.datos && k.datos.proxima_ronda && k.datos.proxima_ronda <= masDias(2); }).forEach(function (k) {
        items.push({ f: k.datos.proxima_ronda, nodo: el('button', { class: 'today-i', type: 'button', onclick: function () { A.verCaso(k.id, function () { A.ir('inicio'); }); } }, [
          el('span', { class: 'ti-ico', 'data-svc': 'credito' }, [A.icon('i-gauge', 'icon-sm')]),
          el('span', null, [el('b', { text: 'Siguiente ronda · ' + A.nombreDe(k.clientes || {}) }), el('span', { class: 'muted', text: k.etapa + ' · próxima ronda ' + A.fecha(k.datos.proxima_ronda) })])
        ]) });
      });
      casos.filter(function (k) { return k.estado !== 'cancelado' && k.servicio === 'inmigracion' && k.datos && k.datos.fecha_vencimiento && k.datos.fecha_vencimiento <= masDias(30); }).forEach(function (k) {
        items.push({ f: k.datos.fecha_vencimiento, nodo: el('button', { class: 'today-i', type: 'button', onclick: function () { A.verCaso(k.id, function () { A.ir('inicio'); }); } }, [
          el('span', { class: 'ti-ico warn' }, [A.icon('i-passport', 'icon-sm')]),
          el('span', null, [el('b', { text: 'Vencimiento migratorio · ' + A.nombreDe(k.clientes || {}) }), el('span', { class: 'muted', text: (k.datos.tramite || 'Trámite') + ' vence el ' + A.fecha(k.datos.fecha_vencimiento) + (k.datos.numero_recibo ? ' · ' + k.datos.numero_recibo : '') })])
        ]) });
      });
      items.sort(function (a, b) { return (a.f || '').localeCompare(b.f || ''); });
      hoyBox.innerHTML = '';
      hoyBox.appendChild(el('div', { class: 'card-h' }, [el('h3', { class: 't', text: 'Para hoy · ' + items.length }), A.puede('tareas') ? el('button', { class: 'mini-btn', type: 'button', text: 'Nueva tarea', onclick: function () { A.editarTarea(null, function () { A.ir('inicio'); }, { fecha: hoy }); } }) : null]));
      if (!items.length) hoyBox.appendChild(el('div', { class: 'today-ok' }, [A.icon('i-check'), el('span', null, [el('b', { text: 'Todo al día' }), el('span', { class: 'muted', text: 'No hay tareas, vencimientos ni entregas para hoy.' })])]));
      var box = el('div', { class: 'tasks' });
      items.forEach(function (i) { box.appendChild(i.nodo); });
      hoyBox.appendChild(box);

      // Temporadas: Franchise Tax (1 abr – 15 may) y taxes en enero
      var mes = new Date().getMonth(), dia = new Date().getDate(), anio = new Date().getFullYear();
      var temporada = null;
      if (A.puede('casos') && (mes === 3 || (mes === 4 && dia <= 15))) {
        var ft = casos.filter(function (k) { return k.servicio === 'franchise_tax' && k.datos && String(k.datos.anio) === String(anio); });
        var pend = ft.filter(function (k) { return k.estado === 'activo'; }).length;
        temporada = el('div', { class: 'season' }, [A.icon('i-building'), el('div', null, [el('b', { text: 'Temporada de Franchise Tax: vence el 15 de mayo' }),
          el('span', { text: ft.length ? pend + ' de ' + ft.length + ' LLC pendientes de presentar.' : 'Aún no se crean los casos de este año para tus clientes con LLC.' })]),
          ft.length ? el('a', { class: 'btn btn-white btn-sm', href: '#/casos' }, [el('span', { text: 'Ver casos' })]) : el('button', { class: 'btn btn-white btn-sm', type: 'button', onclick: async function () {
            var r = await sb.rpc('generar_franchise_tax', { p_anio: anio }); A.toast(r.error ? 'No se pudo.' : r.data + ' casos creados y avisos listos.', r.error ? 'error' : ''); A.ir('inicio');
          } }, [el('span', { text: 'Crear casos y avisos' })])]);
      } else if (A.puede('campanas') && mes === 0) {
        temporada = el('div', { class: 'season' }, [A.icon('i-calculator'), el('div', null, [el('b', { text: '¡Empieza la temporada de taxes!' }), el('span', { text: 'Avisa a tus clientes de taxes del año pasado para que agenden su cita.' })]),
          el('a', { class: 'btn btn-white btn-sm', href: '#/campanas' }, [el('span', { text: 'Crear campaña' })])]);
      }
      if (temporada) kpis.parentNode.insertBefore(temporada, kpis);

      // Oportunidades de venta
      if (c) {
        var porCliente = {};
        casos.forEach(function (k) { (porCliente[k.cliente_id] = porCliente[k.cliente_id] || { c: k.clientes, s: {} }).s[k.servicio] = k; });
        var ops = [];
        Object.keys(porCliente).forEach(function (id) {
          var x = porCliente[id];
          var t = x.s.taxes;
          if (t && (t.estado === 'completado' || A.esFinal('taxes', t.etapa)) && !x.s.credito) ops.push({ id: id, c: x.c, ofrecer: 'credito', t: 'Terminó sus taxes', o: 'Ofrécele reparación de crédito' });
          if (x.s.llc && !x.s.contabilidad) ops.push({ id: id, c: x.c, ofrecer: 'contabilidad', t: 'Abrió su LLC', o: 'Ofrécele contabilidad mensual' });
        });
        if (ops.length) {
          var opCard = el('div', { class: 'card' }, [el('h3', { class: 't', text: 'Oportunidades · ' + ops.length })]);
          ops.slice(0, 8).forEach(function (op) {
            opCard.appendChild(el('div', { class: 'today-i' }, [
              el('span', { class: 'ti-ico', 'data-svc': op.ofrecer }, [A.icon('i-sparkles', 'icon-sm')]),
              el('span', { style: 'flex:1' }, [el('a', { href: '#/clientes/' + op.id }, [el('b', { text: A.nombreDe(op.c || {}) })]), el('span', { class: 'muted', text: op.t + ' · ' + op.o })]),
              A.puede('casos') ? el('button', { class: 'mini-btn', type: 'button', text: 'Crear caso', onclick: function () { A.editarCaso(null, { cliente_id: op.id, servicio: op.ofrecer }, function () { A.ir('inicio'); }); } }) : null
            ]));
          });
          hoyBox.parentNode.appendChild(opCard);
        }
      }

      // Casos por servicio
      if (c) {
        var porSvc = Object.keys(A.SERVICIOS).map(function (s) { return [s, activos.filter(function (k) { return k.servicio === s; }).length]; }).filter(function (x) { return x[1]; }).sort(function (a, b) { return b[1] - a[1]; });
        var max = porSvc.length ? porSvc[0][1] : 1;
        var card = el('div', { class: 'card' }, [el('h3', { class: 't', text: 'Casos activos por servicio' })]);
        if (!porSvc.length) card.appendChild(el('div', { class: 'muted', text: 'Cuando tengas casos activos verás aquí cómo se reparten.' }));
        porSvc.forEach(function (x) {
          card.appendChild(el('a', { class: 'hbar', href: '#/casos', 'data-svc': x[0], title: A.SERVICIOS[x[0]].label + ': ' + x[1] }, [
            el('span', { class: 'hbar-l', text: A.SERVICIOS[x[0]].corto }),
            el('span', { class: 'hbar-t' }, [el('i', { style: 'width:' + Math.max(4, x[1] / max * 100) + '%' })]),
            el('b', { text: x[1] })
          ]));
        });
        der.appendChild(card);
      }

      // Ingresos de los últimos 6 meses
      if (A.puede('cobros')) {
        var meses = [];
        for (var i = 5; i >= 0; i--) { var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); meses.push(d.toISOString().slice(0, 7)); }
        var tot = meses.map(function (m) { return suma(pagos.filter(function (p) { return p.fecha.slice(0, 7) === m; })); });
        var mx = Math.max.apply(null, tot.concat([1]));
        var bars = el('div', { class: 'vbars', role: 'img', 'aria-label': 'Ingresos de los últimos 6 meses' });
        meses.forEach(function (m, i) {
          var n = new Date(m + '-15T12:00:00').toLocaleDateString('es-US', { month: 'short' });
          bars.appendChild(el('div', { class: 'vbar' + (i === 5 ? ' now' : ''), tabindex: '0', title: n + ': ' + (A.dinero(tot[i]) || '$0') }, [
            el('span', { class: 'vbar-v', text: A.dinero(tot[i]) || '$0' }),
            el('span', { class: 'vbar-t' }, [el('i', { style: 'height:' + Math.max(2, tot[i] / mx * 100) + '%' })]),
            el('span', { class: 'vbar-l', text: n })
          ]));
        });
        der.appendChild(el('div', { class: 'card' }, [el('h3', { class: 't', text: 'Ingresos · últimos 6 meses' }), bars]));

        // Ingresos por servicio (últimos 6 meses)
        var svcDe = {};
        casos.forEach(function (k) { svcDe[k.id] = k.servicio; });
        var porS = {};
        pagos.forEach(function (p) { var sv = svcDe[p.caso_id] || 'otro'; porS[sv] = (porS[sv] || 0) + Number(p.monto); });
        var filas = Object.keys(porS).map(function (k) { return [k, porS[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
        var mxs = filas.length ? filas[0][1] : 1;
        var ingCard = el('div', { class: 'card' }, [el('h3', { class: 't', text: 'Ingresos por servicio · últimos 6 meses' })]);
        if (!filas.length) ingCard.appendChild(el('div', { class: 'muted', text: 'Registra pagos ligados a un caso para ver qué servicio te deja más.' }));
        filas.forEach(function (x) {
          ingCard.appendChild(el('div', { class: 'hbar hbar-w', 'data-svc': x[0], title: A.SERVICIOS[x[0]].label + ': ' + A.dinero(x[1]) }, [
            el('span', { class: 'hbar-l', text: A.SERVICIOS[x[0]].corto }), el('span', { class: 'hbar-t' }, [el('i', { style: 'width:' + Math.max(4, x[1] / mxs * 100) + '%' })]), el('b', { text: A.dinero(x[1]) })
          ]));
        });
        der.appendChild(ingCard);
      }
      A.contarTareas();
    }
  });
})();
