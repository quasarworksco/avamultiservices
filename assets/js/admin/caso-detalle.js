/* Panel CRM — Detalle de un caso: avance, crédito (contrato, puntajes, disputas), taxes, cobros y tareas */
(function () {
  'use strict';
  var A = window.AVA, el = A.el, sb = A.sb;

  var BUROS = { equifax: { n: 'Equifax', c: '#9a5b23' }, experian: { n: 'Experian', c: '#2e78a6' }, transunion: { n: 'TransUnion', c: '#7a8a2a' } };
  var RESULTADOS = { pendiente: 'Pendiente', eliminado: 'Eliminado', corregido: 'Corregido', verificado: 'Verificado', sin_respuesta: 'Sin respuesta' };
  var TIPOS_DISP = { cuenta: 'Cuenta', coleccion: 'Colección', pago_tarde: 'Pago tarde', consulta: 'Consulta (inquiry)', dato_personal: 'Dato personal', publico: 'Registro público', otro: 'Otro' };
  var TIPOS_TAX = [['individual', 'Individual (1040)'], ['negocio', 'Negocio propio (Schedule C)'], ['llc', 'LLC / Sociedad (1065)'], ['corporacion', 'Corporación (1120/1120-S)'], ['enmienda', 'Enmienda (1040-X)'], ['otro', 'Otro']];
  A.BUROS = BUROS;

  /* 3 días hábiles (lunes a sábado, como en la ley federal de reparación de crédito) */
  A.finCancelacion = function (iso) {
    if (!iso) return null;
    var d = new Date(iso + 'T12:00:00'), n = 0;
    while (n < 3) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0) n++; }
    return d.toISOString().slice(0, 10);
  };
  A.promedio = function (p) {
    var v = [p.equifax, p.experian, p.transunion].filter(function (x) { return x != null; });
    return v.length ? Math.round(v.reduce(function (a, b) { return a + b; }, 0) / v.length) : null;
  };

  function sec(titulo, hijos, accion) {
    return el('section', { class: 'd-sec' }, [el('div', { class: 'card-h' }, [el('h3', { text: titulo }), accion || null])].concat(hijos));
  }

  A.verCaso = async function (id, alCambiar) {
    var r = await sb.from('casos').select('*, clientes(id,nombre,apellidos,telefono)').eq('id', id).maybeSingle();
    if (r.error || !r.data) { A.toast('No se encontró el caso.', 'error'); return; }
    var k = r.data;
    var s = A.SERVICIOS[k.servicio];
    var cambiado = false;
    var recargar = function () { cambiado = true; A.verCaso(id, alCambiar); };
    var equipo = await A.equipo();
    var resp = equipo.filter(function (m) { return m.user_id === k.responsable; })[0];

    // Avance con cambio rápido de etapa
    var etapa = el('select', { class: 'input sm', 'aria-label': 'Etapa' }, s.etapas.map(function (e) { return el('option', { value: e, text: e }); }));
    etapa.value = k.etapa;
    etapa.addEventListener('change', async function () {
      var estado = k.estado === 'cancelado' ? 'cancelado' : (etapa.value === s.etapas[s.etapas.length - 1] ? 'completado' : 'activo');
      var u = await sb.from('casos').update({ etapa: etapa.value, estado: estado }).eq('id', k.id);
      if (u.error) { A.toast('No se pudo cambiar la etapa.', 'error'); etapa.value = k.etapa; return; }
      A.toast('Etapa: ' + etapa.value); recargar();
    });
    var idx = s.etapas.indexOf(k.etapa);
    var avance = sec('Avance', [
      el('div', { class: 'steps', 'data-svc': k.servicio, style: 'margin:0 0 12px' }, s.etapas.map(function (_, i) { return el('i', { class: i <= idx ? 'done' : '' }); })),
      el('div', { class: 'row2', style: 'display:flex;gap:10px;align-items:center' }, [etapa, el('span', { class: 'pill ' + k.estado, text: { activo: 'Activo', completado: 'Completado', cancelado: 'Cancelado' }[k.estado] })])
    ]);

    var cuerpo = [avance, A.seccion('Resumen', [
      ['Cliente', el('a', { href: '#/clientes/' + k.cliente_id, class: 'link-btn', text: A.nombreDe(k.clientes || {}) })],
      ['Responsable', resp ? resp.nombre : 'Sin asignar'], ['Precio', k.precio != null ? A.dinero(k.precio) : '—'],
      ['Inicio', A.fecha(k.fecha_inicio)], ['Entrega', k.fecha_entrega ? A.fecha(k.fecha_entrega) : '—'], ['Notas', k.notas || '—']
    ])];

    if (k.servicio === 'credito') {
      var datos = await Promise.all([
        sb.from('puntajes').select('*').eq('caso_id', k.id).order('fecha'),
        sb.from('disputas').select('*').eq('caso_id', k.id).order('ronda').order('fecha_envio')
      ]);
      cuerpo.push(contrato(k, recargar), puntajes(k, datos[0].data || [], recargar), disputas(k, datos[1].data || [], recargar));
    }
    if (k.servicio === 'taxes') cuerpo.push(taxes(k, recargar));
    if (A.puede('cobros')) cuerpo.push(await cobros(k, recargar));
    cuerpo.push(await tareasCaso(k, recargar));

    A.drawer({
      titulo: k.titulo || s.label,
      meta: s.corto + ' · ' + A.nombreDe(k.clientes || {}),
      cuerpo: cuerpo,
      pie: [el('div', { class: 'row2' }, [
        el('a', { class: 'btn btn-ghost', href: '#/clientes/' + k.cliente_id }, [A.icon('i-users'), el('span', { text: 'Ficha del cliente' })]),
        el('button', { class: 'btn btn-dark', type: 'button', onclick: function () { A.editarCaso(k, null, recargar); } }, [A.icon('i-edit'), el('span', { text: 'Editar caso' })])
      ])],
      alCerrar: function () { if (cambiado && alCambiar) alCambiar(); }
    });
  };

  /* ---------- Crédito ---------- */
  function contrato(k, recargar) {
    var f = (k.datos || {}).fecha_contrato || '';
    var inp = el('input', { class: 'input sm', type: 'date', value: f, 'aria-label': 'Fecha de firma del contrato' });
    var fin = A.finCancelacion(f);
    var hoy = A.hoyISO();
    var estado = !f ? el('div', { class: 'muted', text: 'Registra la fecha en que firmó el contrato para calcular su periodo de cancelación.' })
      : el('div', { class: 'alert ' + (hoy <= fin ? 'warn' : 'ok') }, [A.icon(hoy <= fin ? 'i-alert' : 'i-check', 'icon-sm'),
        hoy <= fin ? 'En periodo de cancelación hasta el ' + A.fecha(fin) + '. Aún no se puede cobrar ni enviar disputas.' : 'Periodo de cancelación terminado el ' + A.fecha(fin) + '.']);
    return sec('Contrato', [el('div', { class: 'row2', style: 'display:flex;gap:10px;margin-bottom:10px' }, [inp,
      el('button', { class: 'mini-btn', type: 'button', text: 'Guardar fecha', onclick: async function () {
        var d = Object.assign({}, k.datos || {}, { fecha_contrato: inp.value || null });
        var u = await sb.from('casos').update({ datos: d }).eq('id', k.id);
        if (u.error) { A.toast('No se pudo guardar.', 'error'); return; }
        A.toast('Fecha de contrato guardada.'); recargar();
      } })]), estado]);
  }

  /* Gráfica de puntajes: una línea por buró, mismo eje (300–850 recortado al rango de los datos) */
  A.graficaPuntajes = function (lista) {
    var W = 520, H = 200, L = 36, R = 64, T = 14, B = 26;
    var vals = [];
    lista.forEach(function (p) { Object.keys(BUROS).forEach(function (b) { if (p[b] != null) vals.push(p[b]); }); });
    var min = Math.max(300, Math.floor((Math.min.apply(null, vals) - 20) / 50) * 50);
    var max = Math.min(850, Math.ceil((Math.max.apply(null, vals) + 20) / 50) * 50);
    if (max - min < 100) max = Math.min(850, min + 100);
    var x = function (i) { return L + (lista.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (lista.length - 1)); };
    var y = function (v) { return T + (max - v) * (H - T - B) / (max - min); };
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('class', 'chart'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Evolución de puntajes de crédito por buró');
    function add(tag, at, txt) { var n = document.createElementNS(NS, tag); Object.keys(at).forEach(function (a) { n.setAttribute(a, at[a]); }); if (txt != null) n.textContent = txt; svg.appendChild(n); return n; }
    for (var g = min; g <= max; g += 50) {
      add('line', { x1: L, x2: W - R, y1: y(g), y2: y(g), class: 'grid' });
      add('text', { x: L - 6, y: y(g) + 4, 'text-anchor': 'end', class: 'axis' }, g);
    }
    lista.forEach(function (p, i) {
      if (lista.length <= 8 || i === 0 || i === lista.length - 1) add('text', { x: x(i), y: H - 6, 'text-anchor': 'middle', class: 'axis' }, new Date(p.fecha + 'T12:00:00').toLocaleDateString('es-US', { month: 'short', day: 'numeric' }));
    });
    var finales = [];
    Object.keys(BUROS).forEach(function (b) {
      var pts = lista.map(function (p, i) { return p[b] != null ? [x(i), y(p[b]), p[b]] : null; }).filter(Boolean);
      if (!pts.length) return;
      if (pts.length > 1) add('polyline', { points: pts.map(function (q) { return q[0] + ',' + q[1]; }).join(' '), fill: 'none', stroke: BUROS[b].c, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', class: 'draw' });
      pts.forEach(function (q) { add('circle', { cx: q[0], cy: q[1], r: 4, fill: BUROS[b].c, stroke: '#fff', 'stroke-width': 2 }); });
      var u = pts[pts.length - 1];
      finales.push({ x: u[0] + 8, y: u[1] + 4, t: BUROS[b].n.slice(0, 2) + ' ' + u[2] });
    });
    // Etiquetas directas al final de cada línea, separadas al menos 13 px
    finales.sort(function (a, b) { return a.y - b.y; });
    for (var f = 1; f < finales.length; f++) if (finales[f].y - finales[f - 1].y < 13) finales[f].y = finales[f - 1].y + 13;
    finales.forEach(function (e) { add('text', { x: e.x, y: e.y, class: 'lbl' }, e.t); });
    // Capa de lectura al pasar el cursor
    var wrap = el('div', { class: 'chart-wrap' });
    var tip = el('div', { class: 'chart-tip', hidden: true });
    var cross = add('line', { x1: 0, x2: 0, y1: T, y2: H - B, class: 'cross', visibility: 'hidden' });
    lista.forEach(function (p, i) {
      var w = lista.length === 1 ? W - L - R : (W - L - R) / (lista.length - 1);
      var hit = add('rect', { x: x(i) - w / 2, y: 0, width: w, height: H, fill: 'transparent' });
      hit.addEventListener('mouseenter', function () {
        cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
        tip.innerHTML = '';
        tip.appendChild(el('b', { text: A.fecha(p.fecha) }));
        Object.keys(BUROS).forEach(function (b) { if (p[b] != null) tip.appendChild(el('div', null, [el('i', { style: 'background:' + BUROS[b].c }), BUROS[b].n + ' ', el('strong', { text: p[b] })])); });
        tip.hidden = false;
        tip.style.left = (x(i) / W * 100) + '%';
      });
    });
    svg.addEventListener('mouseleave', function () { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });
    wrap.appendChild(svg); wrap.appendChild(tip);
    return wrap;
  };

  function puntajes(k, lista, recargar) {
    var hijos = [];
    if (lista.length) {
      var p0 = lista[0], pn = lista[lista.length - 1];
      hijos.push(el('div', { class: 'tiles' }, Object.keys(BUROS).map(function (b) {
        var d = pn[b] != null && p0[b] != null ? pn[b] - p0[b] : null;
        return el('div', { class: 'tile' }, [el('span', { class: 'k', text: BUROS[b].n }), el('b', { text: pn[b] != null ? pn[b] : '—' }),
          d != null && lista.length > 1 ? el('span', { class: 'delta ' + (d >= 0 ? 'up' : 'down'), text: (d >= 0 ? '+' : '') + d + ' pts' }) : null]);
      })));
      hijos.push(A.graficaPuntajes(lista));
      hijos.push(el('div', { class: 'legend' }, Object.keys(BUROS).map(function (b) { return el('span', null, [el('i', { style: 'background:' + BUROS[b].c }), BUROS[b].n]); })));
      var tabla = el('table', { class: 'tbl' }, [el('thead', null, [el('tr', null, ['Fecha', 'Equifax', 'Experian', 'TransUnion', ''].map(function (h) { return el('th', { text: h }); }))])]);
      var tb = el('tbody');
      lista.slice().reverse().forEach(function (p) {
        tb.appendChild(el('tr', null, [el('td', { text: A.fecha(p.fecha) }), el('td', { text: p.equifax || '—' }), el('td', { text: p.experian || '—' }), el('td', { text: p.transunion || '—' }),
          el('td', null, [el('button', { class: 'mini-btn', type: 'button', 'aria-label': 'Eliminar registro', onclick: async function () {
            if (!confirm('¿Eliminar el registro del ' + A.fecha(p.fecha) + '?')) return;
            var d = await sb.from('puntajes').delete().eq('id', p.id); if (!d.error) recargar();
          } }, [A.icon('i-trash', 'icon-sm')])])]));
      });
      tabla.appendChild(tb);
      hijos.push(el('details', { class: 'tbl-wrap' }, [el('summary', { text: 'Ver tabla de puntajes' }), tabla]));
    } else {
      hijos.push(el('div', { class: 'muted', text: 'Registra el puntaje inicial de cada buró para ver su avance en una gráfica.' }));
    }
    var f = { fecha: el('input', { class: 'input sm', type: 'date', value: A.hoyISO(), 'aria-label': 'Fecha' }) };
    Object.keys(BUROS).forEach(function (b) { f[b] = el('input', { class: 'input sm', type: 'number', min: '300', max: '850', placeholder: BUROS[b].n, 'aria-label': BUROS[b].n }); });
    hijos.push(el('form', { class: 'inline-form', onsubmit: async function (e) {
      e.preventDefault();
      var d = { caso_id: k.id, fecha: f.fecha.value || A.hoyISO() }, alguno = false, malo = false;
      Object.keys(BUROS).forEach(function (b) { var v = f[b].value.trim(); if (v) { var n = Number(v); if (n < 300 || n > 850) malo = true; d[b] = n; alguno = true; } });
      if (!alguno || malo) { A.toast('Escribe puntajes entre 300 y 850.', 'error'); return; }
      var ins = await sb.from('puntajes').insert(d);
      if (ins.error) { A.toast('No se pudo guardar.', 'error'); return; }
      A.toast('Puntaje registrado.'); recargar();
    } }, [f.fecha, f.equifax, f.experian, f.transunion, el('button', { class: 'btn btn-dark btn-sm', type: 'submit', text: 'Agregar' })]));
    return sec('Puntajes de crédito', hijos);
  }

  function disputas(k, lista, recargar) {
    var hoy = A.hoyISO();
    var cuenta = {};
    lista.forEach(function (d) { cuenta[d.resultado] = (cuenta[d.resultado] || 0) + 1; });
    var hijos = [];
    if (lista.length) {
      hijos.push(el('div', { class: 'chips', style: 'margin-bottom:10px' }, Object.keys(RESULTADOS).filter(function (x) { return cuenta[x]; }).map(function (x) {
        return el('span', { class: 'chip-s res-' + x, text: RESULTADOS[x] + ' · ' + cuenta[x] });
      })));
      var rondas = {};
      lista.forEach(function (d) { (rondas[d.ronda] = rondas[d.ronda] || []).push(d); });
      Object.keys(rondas).sort(function (a, b) { return a - b; }).forEach(function (rn) {
        var box = el('div', { class: 'ronda' }, [el('div', { class: 'ronda-h', text: 'Ronda ' + rn })]);
        rondas[rn].forEach(function (d) {
          var vencida = d.resultado === 'pendiente' && d.fecha_limite < hoy;
          var res = el('select', { class: 'input sm res', 'aria-label': 'Resultado' }, Object.keys(RESULTADOS).map(function (x) { return el('option', { value: x, text: RESULTADOS[x] }); }));
          res.value = d.resultado;
          res.addEventListener('change', async function () {
            var u = await sb.from('disputas').update({ resultado: res.value }).eq('id', d.id);
            if (u.error) { A.toast('No se pudo actualizar.', 'error'); return; }
            A.toast(d.acreedor + ': ' + RESULTADOS[res.value]); recargar();
          });
          box.appendChild(el('div', { class: 'disp' + (vencida ? ' late' : '') }, [
            el('div', null, [el('b', { text: d.acreedor }), el('div', { class: 'muted' }, [
              el('span', { class: 'buro', style: 'color:' + BUROS[d.buro].c, text: BUROS[d.buro].n }), ' · ' + TIPOS_DISP[d.tipo] + ' · enviada ' + A.fecha(d.fecha_envio)]),
              d.resultado === 'pendiente' ? el('div', { class: vencida ? 'late-txt' : 'muted', text: (vencida ? 'Venció el plazo de 30 días: ' : 'Respuesta esperada antes del ') + A.fecha(d.fecha_limite) }) : null]),
            el('div', { class: 'disp-act' }, [res, el('button', { class: 'mini-btn', type: 'button', 'aria-label': 'Eliminar disputa', onclick: async function () {
              if (!confirm('¿Eliminar la disputa de ' + d.acreedor + '?')) return;
              var x = await sb.from('disputas').delete().eq('id', d.id); if (!x.error) recargar();
            } }, [A.icon('i-trash', 'icon-sm')])])
          ]));
        });
        hijos.push(box);
      });
    } else {
      hijos.push(el('div', { class: 'muted', text: 'Registra cada cuenta disputada. Te avisaremos cuando pasen los 30 días de respuesta.' }));
    }
    var ronda = lista.reduce(function (m, d) { return Math.max(m, d.ronda); }, 1);
    var f = {
      ronda: el('select', { class: 'input sm', 'aria-label': 'Ronda' }, [1, 2, 3, 4, 5, 6].map(function (n) { return el('option', { value: n, text: 'Ronda ' + n }); })),
      buro: el('select', { class: 'input sm', 'aria-label': 'Buró' }, [el('option', { value: 'todos', text: 'Los 3 burós' })].concat(Object.keys(BUROS).map(function (b) { return el('option', { value: b, text: BUROS[b].n }); }))),
      acreedor: el('input', { class: 'input sm', placeholder: 'Acreedor o cuenta', maxlength: 160, 'aria-label': 'Acreedor' }),
      tipo: el('select', { class: 'input sm', 'aria-label': 'Tipo' }, Object.keys(TIPOS_DISP).map(function (t) { return el('option', { value: t, text: TIPOS_DISP[t] }); })),
      fecha: el('input', { class: 'input sm', type: 'date', value: A.hoyISO(), 'aria-label': 'Fecha de envío' })
    };
    f.ronda.value = ronda;
    hijos.push(el('form', { class: 'inline-form disp-form', onsubmit: async function (e) {
      e.preventDefault();
      var ac = f.acreedor.value.trim();
      if (!ac) { f.acreedor.focus(); return; }
      var buros = f.buro.value === 'todos' ? Object.keys(BUROS) : [f.buro.value];
      var ins = await sb.from('disputas').insert(buros.map(function (b) { return { caso_id: k.id, ronda: Number(f.ronda.value), buro: b, acreedor: ac, tipo: f.tipo.value, fecha_envio: f.fecha.value || A.hoyISO() }; }));
      if (ins.error) { A.toast('No se pudo guardar la disputa.', 'error'); return; }
      A.toast(buros.length > 1 ? 'Disputa registrada en los 3 burós.' : 'Disputa registrada.'); recargar();
    } }, [f.ronda, f.buro, f.acreedor, f.tipo, f.fecha, el('button', { class: 'btn btn-dark btn-sm', type: 'submit', text: 'Agregar' })]));
    return sec('Disputas · ' + lista.length, hijos);
  }

  /* ---------- Taxes ---------- */
  function taxes(k, recargar) {
    var d = k.datos || {};
    var anio = el('input', { class: 'input sm', type: 'number', min: '2000', max: '2100', value: d.anio || (new Date().getFullYear() - 1), 'aria-label': 'Año fiscal' });
    var tipo = el('select', { class: 'input sm', 'aria-label': 'Tipo de declaración' }, TIPOS_TAX.map(function (t) { return el('option', { value: t[0], text: t[1] }); }));
    tipo.value = d.tipo || 'individual';
    var res = el('select', { class: 'input sm', 'aria-label': 'Resultado' }, [['', 'Aún no se sabe'], ['reembolso', 'Reembolso'], ['pagar', 'Monto a pagar']].map(function (t) { return el('option', { value: t[0], text: t[1] }); }));
    res.value = d.resultado || '';
    var monto = el('input', { class: 'input sm', type: 'number', min: '0', step: '0.01', value: d.monto != null ? d.monto : '', placeholder: 'Monto USD', 'aria-label': 'Monto' });
    var resumen = d.resultado ? el('div', { class: 'alert ' + (d.resultado === 'reembolso' ? 'ok' : 'warn') }, [A.icon(d.resultado === 'reembolso' ? 'i-check' : 'i-alert', 'icon-sm'),
      (d.resultado === 'reembolso' ? 'Reembolso de ' : 'A pagar: ') + (d.monto != null ? A.dinero(d.monto) : '—') + ' · ' + (d.anio || '')]) : null;
    return sec('Declaración de taxes', [resumen, el('div', { class: 'grid2', style: 'margin-top:10px' }, [
      el('div', { class: 'field' }, [el('label', { text: 'Año fiscal' }), anio]), el('div', { class: 'field' }, [el('label', { text: 'Tipo' }), tipo]),
      el('div', { class: 'field' }, [el('label', { text: 'Resultado' }), res]), el('div', { class: 'field' }, [el('label', { text: 'Monto' }), monto])
    ]), el('button', { class: 'mini-btn', type: 'button', style: 'margin-top:12px', text: 'Guardar datos de taxes', onclick: async function () {
      var n = Object.assign({}, d, { anio: Number(anio.value) || null, tipo: tipo.value, resultado: res.value || null, monto: monto.value === '' ? null : Number(monto.value) });
      var u = await sb.from('casos').update({ datos: n }).eq('id', k.id);
      if (u.error) { A.toast('No se pudo guardar.', 'error'); return; }
      A.toast('Datos de taxes guardados.'); recargar();
    } })]);
  }

  /* ---------- Cobros del caso ---------- */
  async function cobros(k, recargar) {
    var r = await sb.from('pagos').select('*').eq('caso_id', k.id).order('fecha', { ascending: false });
    var pagos = r.data || [];
    var pagado = pagos.reduce(function (a, p) { return a + Number(p.monto); }, 0);
    var saldo = k.precio != null ? Number(k.precio) - pagado : null;
    var hijos = [el('div', { class: 'tiles' }, [
      el('div', { class: 'tile' }, [el('span', { class: 'k', text: 'Precio' }), el('b', { text: k.precio != null ? A.dinero(k.precio) : '—' })]),
      el('div', { class: 'tile' }, [el('span', { class: 'k', text: 'Pagado' }), el('b', { text: A.dinero(pagado) || '$0' })]),
      el('div', { class: 'tile' }, [el('span', { class: 'k', text: 'Saldo' }), el('b', { class: saldo > 0 ? 'debe' : '', text: saldo != null ? A.dinero(Math.max(saldo, 0)) || '$0' : '—' })])
    ])];
    pagos.forEach(function (p) {
      hijos.push(el('div', { class: 'pay' }, [el('span', null, [A.fecha(p.fecha) + ' · ' + A.METODOS[p.metodo], p.nota ? el('span', { class: 'muted', text: ' · ' + p.nota }) : null]), el('b', { text: A.dinero(p.monto) })]));
    });
    return sec('Cobros', hijos, el('button', { class: 'mini-btn', type: 'button', text: 'Registrar pago', onclick: function () {
      A.registrarPago({ cliente_id: k.cliente_id, caso_id: k.id, monto: saldo > 0 ? saldo : null }, recargar);
    } }));
  }

  /* ---------- Tareas del caso ---------- */
  async function tareasCaso(k, recargar) {
    var r = await sb.from('tareas').select('*').eq('caso_id', k.id).order('hecha').order('fecha', { nullsFirst: false });
    var lista = el('div', { class: 'tasks' });
    (r.data || []).forEach(function (t) { lista.appendChild(A.filaTarea(t, recargar)); });
    if (!(r.data || []).length) lista.appendChild(el('div', { class: 'muted', text: 'Sin tareas para este caso.' }));
    var titulo = el('input', { class: 'input sm', placeholder: 'Nueva tarea, p. ej. «Llamar para pedir W-2»', maxlength: 200, 'aria-label': 'Nueva tarea' });
    var fecha = el('input', { class: 'input sm', type: 'date', 'aria-label': 'Fecha' });
    var form = A.puede('tareas') ? el('form', { class: 'inline-form', onsubmit: async function (e) {
      e.preventDefault();
      if (!titulo.value.trim()) return;
      var ins = await sb.from('tareas').insert({ titulo: titulo.value.trim(), fecha: fecha.value || null, caso_id: k.id, cliente_id: k.cliente_id, asignada_a: k.responsable || A.yo().user_id });
      if (ins.error) { A.toast('No se pudo crear la tarea.', 'error'); return; }
      A.toast('Tarea creada.'); recargar();
    } }, [titulo, fecha, el('button', { class: 'btn btn-dark btn-sm', type: 'submit', text: 'Agregar' })]) : null;
    return sec('Tareas', [lista, form]);
  }
})();
