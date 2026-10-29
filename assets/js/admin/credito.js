/* Panel CRM — Reparación de crédito: importar el reporte de SmartCredit, elegir qué disputar,
   generar las cartas de cada buró con las plantillas de AVA, imprimirlas y registrar las disputas. */
(function () {
  'use strict';
  var A = window.AVA, el = A.el, sb = A.sb;
  var BUROS = ['transunion', 'experian', 'equifax'];
  var BURO = {
    transunion: { n: 'TransUnion', c: '#7a8a2a', carta: 'TransUnion LLC', dir: 'Consumer Dispute Center\nP.O. Box 2000\nChester, PA 19016-2000' },
    experian: { n: 'Experian', c: '#2e78a6', carta: 'Experian', dir: 'P.O. Box 4500\nAllen, TX 75013' },
    equifax: { n: 'Equifax', c: '#9a5b23', carta: 'Equifax Information Services LLC', dir: 'P.O. Box 740256\nAtlanta, GA 30374-0256' }
  };
  var TIPO_CARTA = { cuentas: 'Cuentas negativas', consultas: 'Consultas (inquiries)', personal: 'Información personal', otro: 'Otra' };
  // Motivos: la etiqueta en español es para el equipo; el texto en inglés va en la carta
  var MOTIVOS = [
    ['verificar', 'Pedir que la verifiquen', 'I request that you verify this account with the original documentation. If it cannot be fully verified, it must be deleted.'],
    ['inexacta', 'Datos inexactos', 'The information reported for this account is inaccurate.'],
    ['no_reconozco', 'No la reconoce', 'I do not recognize this account.'],
    ['no_mia', 'No es suya', 'This account does not belong to me.'],
    ['pagada', 'Ya está pagada', 'This account has been paid and should not show a balance owed.'],
    ['otro', 'Otro (escribir en inglés)', '']
  ];
  var MOTIVO = {}; MOTIVOS.forEach(function (m) { MOTIVO[m[0]] = m; });
  var COMPARAR = [['abierta', 'Date opened'], ['saldo', 'Balance'], ['saldo_maximo', 'High balance'], ['estado_pago', 'Payment status'], ['ultima_actividad', 'Date of last activity'], ['ultimo_pago', 'Last payment'], ['vencido', 'Past due amount']];
  var VARIABLES = ['client_first_name', 'client_last_name', 'client_address', 'bdate', 'ss_number', 'curr_date', 'bureau_name', 'bureau_address', 'dispute_item_and_explanation', 'client_signature'];

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function fechaUS(iso) { var d = iso ? new Date(iso + 'T12:00:00') : new Date(); return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); }

  /* ---------- pdf.js se carga solo cuando hace falta ---------- */
  var pdfjsCarga = null;
  function pdfjs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!pdfjsCarga) pdfjsCarga = new Promise(function (ok, mal) {
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; ok(window.pdfjsLib); };
      s.onerror = function () { pdfjsCarga = null; mal(new Error('No se pudo cargar el lector de PDF.')); };
      document.head.appendChild(s);
    });
    return pdfjsCarga;
  }

  /* Diferencias de una cuenta entre burós (dato real del reporte, sirve como base de la disputa) */
  function diferencias(c) {
    var bs = BUROS.filter(function (b) { return c.buros[b]; });
    if (bs.length < 2) return [];
    var out = [];
    COMPARAR.forEach(function (k) {
      var vals = {};
      bs.forEach(function (b) { var v = c.buros[b][k[0]]; if (v != null && v !== '') (vals[v] = vals[v] || []).push(BURO[b].n); });
      var ks = Object.keys(vals);
      if (ks.length > 1) out.push(k[1] + ': ' + ks.map(function (v) { return v + ' (' + vals[v].join(', ') + ')'; }).join(' vs '));
    });
    return out;
  }
  function atrasosTxt(at) { return at && (at[30] || at[60] || at[90]) ? [at[30] ? at[30] + '×30' : '', at[60] ? at[60] + '×60' : '', at[90] ? at[90] + '×90' : ''].filter(Boolean).join(' ') + ' días tarde' : ''; }

  /* ---------- Sección en el caso de crédito ---------- */
  A.seccionCredito = async function (k, recargar) {
    var caja = el('section', { class: 'd-sec cr-sec' });
    var res = await Promise.all([
      sb.from('reportes_credito').select('id,created_at,fecha_reporte,puntajes,resumen,cuentas,consultas,personal').eq('caso_id', k.id).order('created_at', { ascending: false }).limit(1),
      sb.from('cartas_disputa').select('id,created_at,ronda,buro,tipo,estado,enviada_at,items').eq('caso_id', k.id).order('ronda').order('buro')
    ]);
    var rep = (res[0].data || [])[0], cartas = res[1].data || [];
    var archivo = el('input', { type: 'file', accept: 'application/pdf', hidden: true });
    archivo.addEventListener('change', function () { var f = archivo.files[0]; archivo.value = ''; if (f) importar(k, f, recargar); });
    caja.appendChild(el('div', { class: 'card-h' }, [el('h3', { text: 'Reporte y cartas de disputa' }), el('div', { style: 'display:flex;gap:6px' }, [
      el('a', { class: 'mini-btn', href: '#/ficha/' + k.id, text: 'Ficha del caso', title: 'Ficha de observaciones (uso interno)' }),
      el('button', { class: 'mini-btn', type: 'button', text: 'Plantillas', title: 'Ver y editar los modelos de cartas', onclick: function () { plantillas(); } }),
      el('button', { class: 'mini-btn', type: 'button', text: rep ? 'Importar nuevo reporte' : 'Importar reporte', onclick: function () { archivo.click(); } })
    ])]));
    caja.appendChild(archivo);
    if (!rep) {
      caja.appendChild(el('div', { class: 'cr-vacio' }, [A.icon('i-file', 'icon-sm'), el('div', null, [
        el('b', { text: 'Sube el reporte 3B de SmartCredit en PDF' }),
        el('div', { class: 'muted', text: 'En SmartCredit abre el reporte de 3 burós y usa «Imprimir → Guardar como PDF». El panel lee los puntajes, las cuentas negativas y las consultas, y arma las cartas.' })
      ]), el('button', { class: 'btn btn-dark btn-sm', type: 'button', onclick: function () { archivo.click(); } }, [A.icon('i-upload', 'icon-sm'), el('span', { text: 'Importar PDF' })])]));
    } else {
      var neg = (rep.cuentas || []).filter(function (c) { return c.negativa; }).length;
      caja.appendChild(el('div', { class: 'cr-rep' }, [
        el('div', { class: 'cr-pts' }, BUROS.map(function (b) { return el('span', { style: '--b:' + BURO[b].c }, [el('small', { text: BURO[b].n }), el('b', { text: rep.puntajes[b] || '—' })]); })),
        el('div', { class: 'cr-rep-t' }, [el('b', { text: 'Reporte del ' + A.fecha(rep.fecha_reporte || rep.created_at.slice(0, 10)) }),
          el('div', { class: 'muted', text: neg + ' cuentas negativas · ' + (rep.consultas || []).length + ' consultas' })]),
        el('button', { class: 'btn btn-dark btn-sm', type: 'button', onclick: function () { preparar(k, rep, cartas, recargar); } }, [A.icon('i-edit', 'icon-sm'), el('span', { text: 'Preparar cartas' })])
      ]));
    }
    if (cartas.length) {
      var rondas = {};
      cartas.forEach(function (c) { (rondas[c.ronda] = rondas[c.ronda] || []).push(c); });
      Object.keys(rondas).sort(function (a, b) { return a - b; }).forEach(function (rn) {
        var lista = rondas[rn];
        var borr = lista.filter(function (c) { return c.estado === 'borrador'; });
        var box = el('div', { class: 'ronda' }, [el('div', { class: 'ronda-h cr-ronda-h' }, [el('span', { text: 'Ronda ' + rn + ' · ' + lista.length + ' carta' + (lista.length === 1 ? '' : 's') }),
          el('button', { class: 'link-btn', type: 'button', text: 'Imprimir todas', onclick: function () { imprimir(k, lista); } })])]);
        lista.forEach(function (c) {
          box.appendChild(el('div', { class: 'disp' }, [
            el('div', null, [el('b', { text: TIPO_CARTA[c.tipo] }), el('div', { class: 'muted' }, [el('span', { class: 'buro', style: 'color:' + BURO[c.buro].c, text: BURO[c.buro].n }),
              ' · ' + (c.items || []).length + ' punto' + ((c.items || []).length === 1 ? '' : 's') + ' · ' + (c.estado === 'enviada' ? 'enviada el ' + A.fecha(c.enviada_at) : 'borrador')])]),
            el('div', { class: 'disp-act' }, [
              el('button', { class: 'mini-btn', type: 'button', text: 'Ver', onclick: function () { verCarta(k, c.id, recargar); } }),
              el('button', { class: 'mini-btn', type: 'button', text: 'Imprimir', onclick: function () { imprimir(k, [c]); } })
            ])
          ]));
        });
        if (borr.length) box.appendChild(el('div', { class: 'cr-enviar' }, [el('span', { class: 'muted', text: 'Cuando las mandes por correo postal, márcalas como enviadas: se crean las disputas con el plazo de 30 días.' }),
          el('button', { class: 'btn btn-ok btn-sm', type: 'button', onclick: function () { marcarEnviadas(k, borr, recargar); } }, [A.icon('i-check', 'icon-sm'), el('span', { text: 'Marcar ' + borr.length + ' como enviadas' })])]));
        caja.appendChild(box);
      });
    }
    return caja;
  };

  /* ---------- Importar el PDF ---------- */
  async function importar(k, archivo, recargar) {
    if (archivo.size > 20 * 1024 * 1024) { A.toast('El PDF supera 20 MB.', 'error'); return; }
    A.toast('Leyendo el reporte…');
    var r;
    try {
      var lib = await pdfjs();
      r = await window.AVA_REPORTE.extraer(lib, new Uint8Array(await archivo.arrayBuffer()));
    } catch (e) { A.toast('No se pudo leer el PDF: ' + (e.message || e), 'error'); return; }
    if (!r.valido) { A.toast('Este PDF no parece un reporte 3B de SmartCredit.', 'error'); return; }
    // El PDF también queda en los documentos del cliente
    var docId = null;
    if (A.puede('documentos')) {
      var ruta = 'clientes/' + k.cliente_id + '/' + Date.now() + '-reporte-smartcredit.pdf';
      var up = await sb.storage.from('documentos').upload(ruta, archivo, { contentType: 'application/pdf', upsert: false });
      if (!up.error) {
        var d = await sb.from('documentos').insert({ cliente_id: k.cliente_id, caso_id: k.id, nombre: 'Reporte SmartCredit ' + (r.fecha || A.hoyISO()) + '.pdf', path: ruta, tipo: 'application/pdf', tamano: archivo.size }).select('id').single();
        if (d.data) docId = d.data.id;
      }
    }
    var ins = await sb.from('reportes_credito').insert({ cliente_id: k.cliente_id, caso_id: k.id, fecha_reporte: r.fecha || null, puntajes: r.puntajes, personal: r.personal, resumen: r.resumen, cuentas: r.cuentas, consultas: r.consultas, contactos: r.contactos, documento_id: docId })
      .select('id,created_at,fecha_reporte,puntajes,resumen,cuentas,consultas,personal').single();
    if (ins.error) { A.toast('No se pudo guardar el reporte.', 'error'); return; }
    // Los puntajes entran solos a la gráfica del caso
    var p = r.puntajes;
    if (p.equifax || p.experian || p.transunion) {
      var fecha = r.fecha || A.hoyISO();
      var ya = await sb.from('puntajes').select('id').eq('caso_id', k.id).eq('fecha', fecha).limit(1);
      if (!(ya.data || []).length) await sb.from('puntajes').insert({ caso_id: k.id, fecha: fecha, equifax: p.equifax || null, experian: p.experian || null, transunion: p.transunion || null, nota: 'SmartCredit' });
    }
    var neg = r.cuentas.filter(function (c) { return c.negativa; }).length;
    A.toast('Reporte importado: ' + neg + ' cuentas negativas y ' + r.consultas.length + ' consultas.', 'ok');
    recargar();
    var cartas = await sb.from('cartas_disputa').select('id,ronda,estado').eq('caso_id', k.id);
    preparar(k, ins.data, cartas.data || [], recargar);
  }

  /* ---------- Elegir qué disputar ---------- */
  async function preparar(k, rep, cartas, recargar) {
    var res = await Promise.all([
      sb.from('clientes').select('id,nombre,apellidos,direccion,ciudad,region,codigo_postal,fecha_nacimiento').eq('id', k.cliente_id).single(),
      sb.from('plantillas_disputa').select('*').eq('activa', true).order('ronda')
    ]);
    var cli = res[0].data || {}, tpls = res[1].data || [];
    var enviadas = cartas.filter(function (c) { return c.estado === 'enviada'; });
    var rondaSug = enviadas.length ? Math.max.apply(null, enviadas.map(function (c) { return c.ronda; })) + 1 : 1;
    var sel = { cuentas: {}, consultas: {}, personal: {} };
    var cuerpo = el('div', { class: 'cr-prep' });
    var verTodas = false;

    // Aviso si faltan datos del cliente que van en la carta
    var faltan = [!cli.direccion && 'dirección', !cli.ciudad && 'ciudad', !cli.fecha_nacimiento && 'fecha de nacimiento'].filter(Boolean);
    if (faltan.length) cuerpo.appendChild(el('div', { class: 'alert warn', style: 'margin-bottom:12px' }, [A.icon('i-alert', 'icon-sm'), 'Al cliente le falta ' + faltan.join(', ') + ' en su ficha. Complétalo antes de imprimir: va en el encabezado de cada carta.']));

    cuerpo.appendChild(el('div', { class: 'cr-pts grande' }, BUROS.map(function (b) { return el('span', { style: '--b:' + BURO[b].c }, [el('small', { text: BURO[b].n }), el('b', { text: rep.puntajes[b] || '—' })]); })));

    /* Cuentas */
    var secCuentas = el('div');
    function pintarCuentas() {
      secCuentas.innerHTML = '';
      var todas = rep.cuentas || [], negs = todas.filter(function (c) { return c.negativa; });
      var lista = verTodas ? todas : negs;
      secCuentas.appendChild(el('div', { class: 'cr-h' }, [el('h4', { text: 'Cuentas negativas · ' + negs.length }),
        el('button', { class: 'link-btn', type: 'button', text: 'Marcar todas', onclick: function () { negs.forEach(function (c) { var s = sel.cuentas[c.id] = sel.cuentas[c.id] || { motivo: 'verificar', texto: '', buros: {} }; BUROS.forEach(function (b) { if (c.buros[b] && c.buros[b].negativa) s.buros[b] = true; }); }); pintarCuentas(); } }),
        todas.length > negs.length ? el('button', { class: 'link-btn', type: 'button', text: verTodas ? 'Solo negativas' : 'Ver también las ' + (todas.length - negs.length) + ' sin problemas', onclick: function () { verTodas = !verTodas; pintarCuentas(); } }) : null]));
      lista.forEach(function (c) {
        var s = sel.cuentas[c.id];
        var difs = diferencias(c);
        var fila = el('div', { class: 'cr-cuenta' + (s ? ' on' : '') + (c.negativa ? '' : ' ok') });
        var cab = el('div', { class: 'cr-c-h' }, [el('div', null, [el('b', { text: c.nombre }), el('span', { class: 'muted', text: ' ' + (c.numero || '') + ' · ' + c.seccion.replace(' Accounts', '') })])]);
        fila.appendChild(cab);
        fila.appendChild(el('div', { class: 'cr-c-b' }, BUROS.map(function (b) {
          var d = c.buros[b];
          if (!d) return el('div', { class: 'cr-b vacio' }, [el('small', { text: BURO[b].n }), el('span', { class: 'muted', text: 'No aparece' })]);
          var chk = el('input', { type: 'checkbox' });
          chk.checked = !!(s && s.buros[b]);
          chk.addEventListener('change', function () {
            var x = sel.cuentas[c.id] = sel.cuentas[c.id] || { motivo: 'verificar', texto: '', buros: {} };
            x.buros[b] = chk.checked;
            if (!BUROS.some(function (z) { return x.buros[z]; })) delete sel.cuentas[c.id];
            pintarCuentas();
          });
          return el('label', { class: 'cr-b' + (d.negativa ? ' neg' : ''), style: '--b:' + BURO[b].c }, [el('span', { class: 'cr-b-t' }, [chk, el('small', { text: BURO[b].n })]),
            el('b', { text: d.estado_pago || d.estado || '—' }), el('span', { class: 'muted', text: [d.saldo ? 'Saldo ' + d.saldo : '', atrasosTxt(c.atrasos && c.atrasos[b])].filter(Boolean).join(' · ') })]);
        })));
        if (difs.length) fila.appendChild(el('div', { class: 'cr-dif' }, [A.icon('i-alert', 'icon-sm'), el('span', { text: 'Se reporta distinto: ' + difs.join(' · ') })]));
        if (s) {
          var mot = el('select', { class: 'input sm', 'aria-label': 'Motivo' }, MOTIVOS.map(function (m) { return el('option', { value: m[0], text: m[1] }); }));
          mot.value = s.motivo;
          var txt = el('input', { class: 'input sm', placeholder: 'Explanation in English…', maxlength: 400, value: s.texto, hidden: s.motivo !== 'otro' });
          mot.addEventListener('change', function () { s.motivo = mot.value; txt.hidden = s.motivo !== 'otro'; if (!txt.hidden) txt.focus(); });
          txt.addEventListener('input', function () { s.texto = txt.value; });
          fila.appendChild(el('div', { class: 'cr-mot' }, [el('span', { class: 'muted', text: 'Motivo:' }), mot, txt]));
        }
        secCuentas.appendChild(fila);
      });
      if (!lista.length) secCuentas.appendChild(el('div', { class: 'muted', text: 'El reporte no tiene cuentas negativas.' }));
    }
    pintarCuentas();
    cuerpo.appendChild(secCuentas);

    /* Consultas */
    var cons = rep.consultas || [];
    var secCons = el('div');
    function pintarConsultas() {
      secCons.innerHTML = '';
      secCons.appendChild(el('div', { class: 'cr-h' }, [el('h4', { text: 'Consultas (inquiries) · ' + cons.length }),
        cons.length ? el('button', { class: 'link-btn', type: 'button', text: 'Marcar todas', onclick: function () { cons.forEach(function (_, i) { sel.consultas[i] = true; }); pintarConsultas(); } }) : null]));
      secCons.appendChild(el('p', { class: 'muted cr-nota', text: 'Marca solo las que el cliente no autorizó. Si pidió ese crédito, la consulta es válida y no se disputa.' }));
      var g = el('div', { class: 'cr-cons' });
      cons.forEach(function (q, i) {
        var chk = el('input', { type: 'checkbox' }); chk.checked = !!sel.consultas[i];
        chk.addEventListener('change', function () { if (chk.checked) sel.consultas[i] = true; else delete sel.consultas[i]; });
        g.appendChild(el('label', { class: 'check' }, [chk, el('span', null, [q.acreedor || '—', el('small', { class: 'muted', style: 'display:block', text: q.fecha + ' · ' + (q.buro ? BURO[q.buro].n : '¿buró?') })])]));
      });
      secCons.appendChild(g);
    }
    pintarConsultas();
    cuerpo.appendChild(secCons);

    /* Información personal */
    var secPer = el('div');
    secPer.appendChild(el('div', { class: 'cr-h' }, [el('h4', { text: 'Información personal' })]));
    secPer.appendChild(el('p', { class: 'muted cr-nota', text: 'Marca los datos viejos o mal escritos que cada buró debe quitar.' }));
    var gp = el('div', { class: 'cr-per' });
    BUROS.forEach(function (b) {
      var p = (rep.personal || {})[b] || {};
      var ops = [];
      if (p.nombre) ops.push(['nombre', 'Name variation: ' + p.nombre, 'Nombre: ' + p.nombre]);
      if (p.aka) ops.push(['aka', 'Also known as: ' + p.aka, 'También conocido como: ' + p.aka]);
      if (p.direcciones_previas) ops.push(['previa', 'Previous address: ' + p.direcciones_previas, 'Dirección anterior: ' + p.direcciones_previas]);
      if (p.direccion) ops.push(['direccion', 'Address: ' + p.direccion, 'Dirección actual: ' + p.direccion]);
      if (p.empleador) ops.push(['empleador', 'Employer: ' + p.empleador, 'Empleador: ' + p.empleador]);
      var col = el('div', { class: 'cr-per-b', style: '--b:' + BURO[b].c }, [el('b', { text: BURO[b].n })]);
      ops.forEach(function (o) {
        var chk = el('input', { type: 'checkbox' });
        chk.addEventListener('change', function () { var x = sel.personal[b] = sel.personal[b] || {}; if (chk.checked) x[o[0]] = o[1]; else delete x[o[0]]; });
        col.appendChild(el('label', { class: 'cr-per-o' }, [chk, el('span', { text: o[2] })]));
      });
      if (!ops.length) col.appendChild(el('span', { class: 'muted', text: 'Sin datos' }));
      gp.appendChild(col);
    });
    secPer.appendChild(gp);
    cuerpo.appendChild(secPer);

    /* Pie: ronda y confirmación */
    var ronda = el('select', { class: 'input sm', 'aria-label': 'Ronda' }, [1, 2, 3, 4, 5, 6].map(function (n) { return el('option', { value: n, text: 'Ronda ' + n }); }));
    ronda.value = Math.min(rondaSug, 6);
    var conf = el('input', { type: 'checkbox' });
    var aviso = el('div', { class: 'msg', hidden: true });
    var bg = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Preparar cartas' }, [el('div', { class: 'modal-card cr-card' }, [
      el('div', { class: 'modal-head' }, [el('h2', { text: 'Preparar cartas' }), el('button', { class: 'x', type: 'button', 'aria-label': 'Cerrar', onclick: cerrar }, [A.icon('i-x', 'icon-sm')])]),
      el('div', { class: 'modal-body' }, [cuerpo]),
      el('div', { class: 'cr-pie' }, [aviso,
        el('label', { class: 'cr-conf' }, [conf, el('span', { text: 'Revisé con el cliente lo marcado: no lo reconoce, no lo autorizó o está mal reportado.' })]),
        el('div', { class: 'cr-pie-a' }, [ronda, el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Cancelar', onclick: cerrar }),
          el('button', { class: 'btn btn-dark btn-sm', type: 'button', onclick: generar }, [A.icon('i-file', 'icon-sm'), el('span', { text: 'Generar cartas' })])])
      ])
    ])]);
    function cerrar() { bg.remove(); document.removeEventListener('keydown', esc); }
    function esc(e) { if (e.key === 'Escape') cerrar(); }
    document.addEventListener('keydown', esc);
    document.body.appendChild(bg);

    async function generar() {
      A.msg(aviso);
      var R = Number(ronda.value);
      var porBuro = {};
      BUROS.forEach(function (b) { porBuro[b] = { cuentas: [], consultas: [], personal: [] }; });
      Object.keys(sel.cuentas).forEach(function (id) {
        var s = sel.cuentas[id], c = (rep.cuentas || []).filter(function (x) { return x.id === id; })[0];
        if (!c) return;
        if (s.motivo === 'otro' && !String(s.texto || '').trim()) return;
        BUROS.forEach(function (b) { if (s.buros[b] && c.buros[b]) porBuro[b].cuentas.push({ c: c, s: s }); });
      });
      Object.keys(sel.consultas).forEach(function (i) { var q = cons[i]; if (q && q.buro) porBuro[q.buro].consultas.push(q); });
      BUROS.forEach(function (b) { var x = sel.personal[b] || {}; Object.keys(x).forEach(function (k2) { porBuro[b].personal.push(x[k2]); }); });
      var total = BUROS.reduce(function (a, b) { return a + porBuro[b].cuentas.length + porBuro[b].consultas.length + porBuro[b].personal.length; }, 0);
      var sinTexto = Object.keys(sel.cuentas).some(function (id) { return sel.cuentas[id].motivo === 'otro' && !String(sel.cuentas[id].texto || '').trim(); });
      if (sinTexto) { A.msg(aviso, 'Escribe la explicación en inglés de las cuentas con motivo «Otro».'); return; }
      if (!total) { A.msg(aviso, 'Marca al menos una cuenta, consulta o dato personal.'); return; }
      if (!conf.checked) { A.msg(aviso, 'Confirma que revisaste lo marcado con el cliente.'); return; }
      var filas = [];
      BUROS.forEach(function (b) {
        ['cuentas', 'consultas', 'personal'].forEach(function (tipo) {
          var lista = porBuro[b][tipo];
          if (!lista.length) return;
          var tpl = plantillaPara(tpls, tipo, R);
          if (!tpl) return;
          var detalle, items;
          if (tipo === 'cuentas') {
            detalle = lista.map(function (x, i) {
              var d = x.c.buros[b], difs = diferencias(x.c);
              var lineas = [(i + 1) + '. **' + x.c.nombre + '** — Account #' + (d.numero || x.c.numero || 'N/A'),
                'Reported as: ' + [d.estado_pago || d.estado, d.saldo ? 'balance ' + d.saldo : '', d.abierta ? 'opened ' + d.abierta : ''].filter(Boolean).join(', '),
                'Reason: ' + (x.s.motivo === 'otro' ? x.s.texto.trim() : MOTIVO[x.s.motivo][2])];
              if (difs.length) lineas.push('This account is reported inconsistently across the credit bureaus — ' + difs.join('; ') + '.');
              return lineas.join('\n');
            }).join('\n\n');
            items = lista.map(function (x) { var d = x.c.buros[b]; return { tipo: /collection/i.test(x.c.seccion + ' ' + (d.estado_pago || '')) ? 'coleccion' : /late/i.test(d.estado_pago || '') ? 'pago_tarde' : 'cuenta', nombre: x.c.nombre, numero: d.numero || x.c.numero || '', motivo: x.s.motivo }; });
          } else if (tipo === 'consultas') {
            detalle = lista.map(function (q, i) { return (i + 1) + '. **' + q.acreedor + '** — Inquiry date: ' + q.fecha + '\nI did not authorize this inquiry.'; }).join('\n\n');
            items = lista.map(function (q) { return { tipo: 'consulta', nombre: q.acreedor, fecha: q.fecha }; });
          } else {
            detalle = lista.map(function (t) { return '- ' + t; }).join('\n');
            items = lista.map(function (t) { return { tipo: 'dato_personal', nombre: t }; });
          }
          filas.push({ caso_id: k.id, cliente_id: k.cliente_id, reporte_id: rep.id, plantilla_id: tpl.id, ronda: R, buro: b, tipo: tipo, contenido: llenar(tpl.contenido, cli, b, detalle), items: items });
        });
      });
      if (!filas.length) { A.msg(aviso, 'No hay plantillas activas para estas cartas. Revisa «Plantillas».'); return; }
      var ins = await sb.from('cartas_disputa').insert(filas);
      if (ins.error) { A.msg(aviso, 'No se pudieron guardar las cartas.'); return; }
      cerrar();
      A.toast(filas.length + ' carta' + (filas.length === 1 ? '' : 's') + ' de la ronda ' + R + ' lista' + (filas.length === 1 ? '' : 's') + '. Revísalas e imprímelas.', 'ok');
      recargar();
    }
  }

  function plantillaPara(tpls, tipo, ronda) {
    var deTipo = tpls.filter(function (t) { return t.tipo === tipo; });
    return deTipo.filter(function (t) { return t.ronda === ronda; })[0] || deTipo.filter(function (t) { return t.ronda < ronda; }).sort(function (a, b) { return b.ronda - a.ronda; })[0] || deTipo[0] || null;
  }

  // Llena las variables. {ss_number} se deja para el momento de imprimir: el SSN no se guarda en la carta
  function llenar(texto, cli, b, detalle) {
    var dir = [cli.direccion, [cli.ciudad, [cli.region, cli.codigo_postal].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean).join('\n');
    var nac = cli.fecha_nacimiento ? 'DOB: ' + cli.fecha_nacimiento.slice(5, 7) + '/' + cli.fecha_nacimiento.slice(8, 10) + '/' + cli.fecha_nacimiento.slice(0, 4) : 'DOB: ____________';
    var v = {
      client_first_name: cli.nombre || '', client_last_name: cli.apellidos || '', client_address: dir || '____________________',
      bdate: nac, curr_date: fechaUS(), bureau_name: BURO[b].carta, bureau_address: BURO[b].dir,
      dispute_item_and_explanation: detalle, client_signature: '______________________________'
    };
    return String(texto).replace(/\{(\w+)\}/g, function (m, k) { return Object.prototype.hasOwnProperty.call(v, k) ? v[k] : m; });
  }

  /* ---------- Ver / editar una carta ---------- */
  async function verCarta(k, id, recargar) {
    var r = await sb.from('cartas_disputa').select('*').eq('id', id).single();
    if (r.error) { A.toast('No se pudo abrir la carta.', 'error'); return; }
    var c = r.data;
    var vista = el('div', { class: 'fx-doc fx-modal cr-carta', html: window.AVA_FORMATO(c.contenido.replace(/\{ss_number\}/g, 'SSN: •••-••-••••')) });
    var editor = el('textarea', { class: 'input', style: 'min-height:420px;font-family:ui-monospace,monospace;font-size:12.5px', maxlength: 40000, hidden: true });
    editor.value = c.contenido;
    var bEditar = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Editar texto', onclick: function () {
      if (editor.hidden) { editor.hidden = false; vista.hidden = true; bEditar.textContent = 'Ver como quedará'; }
      else { vista.innerHTML = window.AVA_FORMATO(editor.value.replace(/\{ss_number\}/g, 'SSN: •••-••-••••')); editor.hidden = true; vista.hidden = false; bEditar.textContent = 'Editar texto'; }
    } });
    A.modal({
      titulo: TIPO_CARTA[c.tipo] + ' · ' + BURO[c.buro].n + ' · Ronda ' + c.ronda, ok: 'Guardar', campos: [],
      extra: el('div', null, [
        c.estado === 'enviada' ? el('div', { class: 'alert', style: 'margin-bottom:10px', text: 'Enviada el ' + A.fecha(c.enviada_at) + '.' }) : null,
        vista, editor,
        el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:12px' }, [bEditar,
          el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Imprimir / PDF', onclick: function () { imprimir(k, [Object.assign({}, c, { contenido: editor.value })]); } })])
      ]),
      guardar: async function (d, aviso) {
        if (editor.value === c.contenido) return true;
        var u = await sb.from('cartas_disputa').update({ contenido: editor.value }).eq('id', c.id);
        if (u.error) { A.msg(aviso, 'No se pudo guardar.'); return false; }
        A.toast('Carta guardada.'); recargar();
      },
      borrar: c.estado === 'borrador' ? async function () { var x = await sb.from('cartas_disputa').delete().eq('id', c.id); if (x.error) { A.toast('No se pudo eliminar.', 'error'); return false; } A.toast('Carta eliminada.'); recargar(); } : null,
      borrarTexto: 'Eliminar carta', borrarConfirm: '¿Eliminar esta carta?'
    });
  }

  /* ---------- Imprimir: el SSN se pone solo en la impresión, no se guarda ---------- */
  async function imprimir(k, lista) {
    var full = await Promise.all(lista.map(function (c) { return c.contenido ? Promise.resolve(c) : sb.from('cartas_disputa').select('*').eq('id', c.id).single().then(function (r) { return r.data; }); }));
    full = full.filter(Boolean);
    var usaSSN = full.some(function (c) { return /\{ss_number\}/.test(c.contenido); });
    var ssn = '';
    if (usaSSN && A.puede('sensibles')) {
      var cl = await sb.from('clientes').select('solicitud_id').eq('id', k.cliente_id).single();
      if (cl.data && cl.data.solicitud_id) {
        var v = await sb.rpc('ver_sensible', { p_id: cl.data.solicitud_id });
        if (!v.error && v.data && v.data.ssn) ssn = String(v.data.ssn).replace(/\D/g, '');
      }
    }
    if (!usaSSN) { abrirImpresion(full, ''); return; }
    var modo = el('select', { class: 'input sm', 'aria-label': 'Cómo mostrar el SSN' }, [['completo', 'SSN completo'], ['ultimos', 'Solo los últimos 4'], ['nada', 'No poner SSN']].map(function (o) { return el('option', { value: o[0], text: o[1] }); }));
    A.modal({
      titulo: 'Imprimir ' + (full.length === 1 ? 'la carta' : full.length + ' cartas'), ok: 'Imprimir',
      campos: [{ k: 'ssn', label: 'Seguro Social (SSN) del cliente', value: ssn ? ssn.replace(/^(\d{3})(\d{2})(\d{4})$/, '$1-$2-$3') : '', placeholder: '123-45-6789', max: 11 }],
      extra: el('div', { style: 'margin-top:12px' }, [el('div', { class: 'field' }, [el('label', { text: 'En la carta' }), modo]),
        el('p', { class: 'muted', style: 'margin-top:8px;font-size:12.5px', text: ssn ? 'Lo tomé de los datos protegidos de su solicitud (queda registrado quién lo vio). No se guarda en la carta.' : 'Escríbelo solo para esta impresión: no se guarda.' })]),
      guardar: function (d, aviso) {
        var dig = String(d.ssn || '').replace(/\D/g, '');
        if (modo.value !== 'nada' && dig.length !== 9 && !(modo.value === 'ultimos' && dig.length >= 4)) { A.msg(aviso, 'Escribe los 9 dígitos del SSN (o elige «No poner SSN»).'); return false; }
        var t = modo.value === 'nada' ? '' : modo.value === 'ultimos' ? 'SSN: XXX-XX-' + dig.slice(-4) : 'SSN: ' + dig.replace(/^(\d{3})(\d{2})(\d{4})$/, '$1-$2-$3');
        abrirImpresion(full, t);
      }
    });
  }
  function abrirImpresion(cartas, ssnTxt) {
    var w = window.open('', '_blank');
    if (!w) { A.toast('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para este sitio.', 'error'); return; }
    var html = cartas.map(function (c) { return '<article class="carta">' + window.AVA_FORMATO(c.contenido.replace(/\{ss_number\}/g, ssnTxt)) + '</article>'; }).join('');
    w.document.write('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Dispute letters</title><style>' +
      '@page{size:letter;margin:0.9in 0.9in}body{margin:0;font-family:"Times New Roman",Times,serif;font-size:12pt;line-height:1.45;color:#000}' +
      '.carta{page-break-after:always}.carta:last-child{page-break-after:auto}p{margin:0 0 10pt}ul{margin:0 0 10pt;padding-left:22pt}li{margin:2pt 0}' +
      'strong{font-weight:bold}.fx-box{margin:8pt 0;padding:6pt 10pt;border-left:2pt solid #555;font-style:italic}.fx-sec,.fx-sub{font-size:12pt;margin:12pt 0 6pt}' +
      '@media screen{body{background:#eee}.carta{background:#fff;max-width:7in;margin:20px auto;padding:0.8in;box-shadow:0 2px 12px rgba(0,0,0,.15)}}' +
      '</style></head><body>' + html + '<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>');
    w.document.close();
  }

  /* ---------- Marcar como enviadas: crea las disputas con su plazo ---------- */
  function marcarEnviadas(k, borr, recargar) {
    A.modal({
      titulo: 'Marcar como enviadas', ok: 'Marcar enviadas',
      campos: [{ k: 'fecha', label: 'Fecha de envío', type: 'date', value: A.hoyISO() }],
      extra: el('p', { class: 'muted', style: 'margin-top:10px', text: borr.length + ' carta' + (borr.length === 1 ? '' : 's') + '. Cada punto disputado queda en «Disputas» con su buró y la fecha límite de respuesta (30 días).' }),
      guardar: async function (d, aviso) {
        var fecha = d.fecha || A.hoyISO();
        var disp = [];
        borr.forEach(function (c) {
          (c.items || []).forEach(function (it) {
            var ac = it.tipo === 'consulta' ? 'Consulta: ' + it.nombre : it.tipo === 'dato_personal' ? 'Dato personal: ' + it.nombre : it.nombre + (it.numero ? ' ' + it.numero : '');
            disp.push({ caso_id: k.id, ronda: c.ronda, buro: c.buro, acreedor: ac.slice(0, 160), tipo: it.tipo || 'otro', fecha_envio: fecha });
          });
        });
        if (disp.length) { var i = await sb.from('disputas').insert(disp); if (i.error) { A.msg(aviso, 'No se pudieron crear las disputas.'); return false; } }
        var u = await sb.from('cartas_disputa').update({ estado: 'enviada', enviada_at: fecha }).in('id', borr.map(function (c) { return c.id; }));
        if (u.error) { A.msg(aviso, 'No se pudieron marcar las cartas.'); return false; }
        A.toast(disp.length + ' disputas registradas. Te avisaremos cuando pasen los 30 días.', 'ok'); recargar();
      }
    });
  }

  /* ---------- Plantillas de cartas ---------- */
  async function plantillas() {
    var r = await sb.from('plantillas_disputa').select('*').order('tipo').order('ronda');
    var lista = el('div', { class: 'cr-tpls' });
    (r.data || []).forEach(function (t) {
      lista.appendChild(el('button', { class: 'saldo', type: 'button', onclick: function () { editarPlantilla(t); } }, [
        el('div', null, [el('b', { text: t.nombre }), el('div', { class: 'muted', text: TIPO_CARTA[t.tipo] + ' · Ronda ' + t.ronda + (t.activa ? '' : ' · desactivada') })]), A.icon('i-edit', 'icon-sm')]));
    });
    A.modal({
      titulo: 'Plantillas de cartas', ok: 'Cerrar', campos: [], guardar: function () { return true; },
      extra: el('div', null, [
        el('p', { class: 'muted', style: 'margin-bottom:10px', text: 'Cada carta usa la plantilla de su tipo y ronda. Si una ronda no tiene plantilla propia, se usa la de la ronda anterior.' }),
        lista,
        el('button', { class: 'btn btn-ghost btn-sm', type: 'button', style: 'margin-top:12px', onclick: function () { document.querySelector('.modal').remove(); editarPlantilla(null); } }, [A.icon('i-plus', 'icon-sm'), el('span', { text: 'Nueva plantilla (ej. ronda 2)' })])
      ])
    });
  }
  function editarPlantilla(t) {
    var abierta = document.querySelector('.modal'); if (abierta) abierta.remove();
    A.modal({
      titulo: t ? 'Editar plantilla' : 'Nueva plantilla', ok: 'Guardar',
      campos: [
        { k: 'nombre', label: 'Nombre', required: true, max: 120, value: t ? t.nombre : '', full: true },
        { k: 'tipo', label: 'Tipo', type: 'select', value: t ? t.tipo : 'cuentas', options: Object.keys(TIPO_CARTA).map(function (x) { return [x, TIPO_CARTA[x]]; }) },
        { k: 'ronda', label: 'Ronda', type: 'select', value: t ? String(t.ronda) : '2', options: [1, 2, 3, 4, 5, 6].map(function (n) { return [String(n), 'Ronda ' + n]; }) },
        { k: 'contenido', label: 'Texto de la carta (en inglés)', type: 'textarea', full: true, required: true, max: 30000, value: t ? t.contenido : '' }
      ],
      extra: el('div', { class: 'muted', style: 'margin-top:10px;font-size:12.5px' }, ['Variables: ', el('code', { text: VARIABLES.map(function (v) { return '{' + v + '}'; }).join('  ') }), el('br'), '**negrita** · - viñeta · línea en blanco = párrafo nuevo.']),
      guardar: async function (d, aviso) {
        d.ronda = Number(d.ronda); d.updated_at = new Date().toISOString();
        var q = t ? sb.from('plantillas_disputa').update(d).eq('id', t.id) : sb.from('plantillas_disputa').insert(d);
        var x = await q;
        if (x.error) { A.msg(aviso, 'No se pudo guardar la plantilla.'); return false; }
        A.toast('Plantilla guardada.');
      },
      borrar: t ? async function () { var x = await sb.from('plantillas_disputa').update({ activa: !t.activa }).eq('id', t.id); if (x.error) return false; A.toast(t.activa ? 'Plantilla desactivada.' : 'Plantilla activada.'); } : null,
      borrarTexto: t && t.activa ? 'Desactivar' : 'Activar', borrarConfirm: t && t.activa ? '¿Desactivar esta plantilla? Ya no se usará para cartas nuevas.' : '¿Volver a activar esta plantilla?'
    });
    var ta = document.getElementById('m-contenido'); if (ta) ta.style.minHeight = '360px';
  }
})();
