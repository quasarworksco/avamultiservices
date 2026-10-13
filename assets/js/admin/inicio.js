/* Panel CRM — Inicio: el negocio en números y lo que hay que hacer hoy */
(function () {
  'use strict';
  var A = window.AVA, el = A.el, sb = A.sb;

  function saludo() { var h = new Date().getHours(); return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'; }
  function masDias(n) { var d = new Date(); d.setDate(d.getDate() + n); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
  var vacio = Promise.resolve({ data: [] });

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
      cont.appendChild(el('div', { class: 'cols', style: 'grid-template-columns:minmax(0,1.25fr) minmax(0,1fr)' }, [el('div', null, [hoyBox]), der]));

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
        A.puede('cobros') ? sb.from('casos').select('precio, pagos(monto)').neq('estado', 'cancelado').not('precio', 'is', null) : vacio
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
      lista.slice(0, 8).forEach(function (s, i) {
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
      items.sort(function (a, b) { return (a.f || '').localeCompare(b.f || ''); });
      hoyBox.innerHTML = '';
      hoyBox.appendChild(el('div', { class: 'card-h' }, [el('h3', { class: 't', text: 'Para hoy · ' + items.length }), A.puede('tareas') ? el('button', { class: 'mini-btn', type: 'button', text: 'Nueva tarea', onclick: function () { A.editarTarea(null, function () { A.ir('inicio'); }, { fecha: hoy }); } }) : null]));
      if (!items.length) hoyBox.appendChild(el('div', { class: 'today-ok' }, [A.icon('i-check'), el('span', null, [el('b', { text: 'Todo al día' }), el('span', { class: 'muted', text: 'No hay tareas, vencimientos ni entregas para hoy.' })])]));
      var box = el('div', { class: 'tasks' });
      items.forEach(function (i) { box.appendChild(i.nodo); });
      hoyBox.appendChild(box);

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
      }
      A.contarTareas();
    }
  });
})();
