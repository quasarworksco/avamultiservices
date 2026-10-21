/* Panel CRM — Cuestionarios por cliente (I-130): enlace propio para cada pareja, avance, respuestas y documentos */
(function () {
  'use strict';
  var A = window.AVA, el = A.el, sb = A.sb;
  var Q = window.AVA_CUESTIONARIOS || {}, U = Q.util;
  var SITIO = 'https://avamultiservices.com';
  var BUCKET = 'documentos';
  var COLS = 'id,created_at,updated_at,token,tipo,titulo,cliente_id,caso_id,estado,datos,documentos,pendientes,progreso,nombre,enviado_at,ultimo_acceso,nuevo,notas, clientes(id,nombre,apellidos,telefono)';
  var ESTADOS = { borrador: 'Llenando', enviado: 'Enviado', revisado: 'Revisado', archivado: 'Archivado' };
  var PILL = { borrador: 'pendiente', enviado: 'nuevo', revisado: 'completado', archivado: 'archivado' };

  function enlace(q) { return SITIO + '/cuestionario/?t=' + q.token; }
  function nombreQ(q) { return q.nombre || q.titulo || (q.clientes ? A.nombreDe(q.clientes) : 'Sin nombre'); }
  function copiar(txt, msg) { navigator.clipboard.writeText(txt).then(function () { A.toast(msg || 'Enlace copiado.'); }, function () { A.toast(txt); }); }
  function mensaje(q) {
    return 'Hola' + (q.clientes && q.clientes.nombre ? ' ' + q.clientes.nombre : '') + ', te escribe AVA Multiservices. Este es tu cuestionario para la petición por matrimonio (I-130). ' +
      'Lo pueden llenar desde el celular; se guarda solo y pueden volver con el mismo enlace:\n' + enlace(q);
  }
  function compartir(q) {
    var tel = q.clientes && q.clientes.telefono;
    window.open(tel ? A.wa(tel, mensaje(q)) : 'https://wa.me/?text=' + encodeURIComponent(mensaje(q)), '_blank', 'noopener');
  }
  function docsDe(q) {
    var def = Q[q.tipo], l = [];
    if (!def) return l;
    def.pasos.forEach(function (p) { (p.documentos || []).forEach(function (g) { g.docs.forEach(function (d) { if (U.cumple(d.si, q.datos || {})) l.push(Object.assign({ grupo: g.grupo }, d)); }); }); });
    return l;
  }
  function pendientes(q) { return docsDe(q).filter(function (d) { return !(q.documentos || []).some(function (x) { return x.doc === d.k; }); }); }

  A.contarCuestionarios = async function () {
    if (!A.puede('solicitudes')) return 0;
    var r = await sb.from('cuestionarios').select('id', { count: 'exact', head: true }).eq('nuevo', true);
    return r.count || 0;
  };

  /* ---------- Crear un enlace ---------- */
  A.nuevoCuestionario = async function (base) {
    base = base || {};
    if (base.cliente) {
      var ya = await sb.from('cuestionarios').select(COLS).eq('cliente_id', base.cliente.id).neq('estado', 'archivado').order('created_at', { ascending: false }).limit(1);
      if ((ya.data || []).length && confirm(A.nombreDe(base.cliente) + ' ya tiene un cuestionario I-130. ¿Abrirlo en lugar de crear otro?')) { abrir(ya.data[0]); return; }
    }
    var clientes = await A.clientesBasicos(base.cliente && base.cliente.id);
    A.modal({
      titulo: 'Nuevo cuestionario I-130', ok: 'Crear enlace',
      campos: [
        { k: 'cliente_id', label: 'Cliente', type: 'select', full: true, value: base.cliente ? base.cliente.id : '', options: [['', 'Sin cliente todavía']].concat(clientes.map(function (c) { return [c.id, A.nombreDe(c) + (c.telefono ? ' · ' + c.telefono : '')]; })) },
        { k: 'titulo', label: 'Nombre para identificarlo', full: true, max: 120, placeholder: 'Por ejemplo: Juan y María Pérez', value: base.cliente ? A.nombreDe(base.cliente) : '' }
      ],
      extra: el('p', { class: 'muted', style: 'margin-top:10px;font-size:12.5px', text: 'Se crea un enlace único para esta pareja. Lo que escriban se guarda solo y pueden volver con el mismo enlace. Las respuestas llegan aquí y te avisamos por correo cuando lo envíen.' }),
      guardar: async function (v, aviso) {
        var r = await sb.from('cuestionarios').insert({ tipo: 'i130', cliente_id: v.cliente_id, titulo: v.titulo }).select(COLS).single();
        if (r.error) { A.msg(aviso, 'No se pudo crear el cuestionario.'); return false; }
        A.toast('Cuestionario creado.');
        if (base.alCrear) base.alCrear();
        listo(r.data);
      }
    });
  };

  // Enlace recién creado: copiar o mandar por WhatsApp
  function listo(q) {
    var m = A.modal({ titulo: 'Enlace listo', ok: 'Cerrar', campos: [], guardar: function () { },
      extra: el('div', null, [
        el('p', { class: 'muted', style: 'margin-bottom:10px', text: 'Mándale este enlace a ' + nombreQ(q) + '. Es personal: no lo compartas con nadie más.' }),
        el('div', { class: 'fm-link' }, [el('code', { text: enlace(q).replace('https://', '') }), el('button', { class: 'mini-btn', type: 'button', text: 'Copiar', onclick: function () { copiar(enlace(q)); } })]),
        el('div', { style: 'display:flex;gap:8px;margin-top:14px;flex-wrap:wrap' }, [
          el('button', { class: 'btn btn-dark btn-sm', type: 'button', onclick: function () { compartir(q); } }, [A.icon('i-whatsapp', 'icon-sm'), el('span', { text: 'Enviar por WhatsApp' })]),
          el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: function () { m.cerrar(); abrir(q); } }, [el('span', { text: 'Ver detalle' })])
        ])
      ]) });
  }

  /* ---------- Lista ---------- */
  A.vista('cuestionarios', {
    permiso: 'solicitudes',
    render: async function (cont, partes) {
      var st = { estado: '', q: '' };
      cont.appendChild(A.cabecera('Inmigración', 'Cuestionarios', 'I-130', [
        el('a', { class: 'btn btn-ghost btn-sm', href: '#/formularios' }, [A.icon('i-clipboard'), el('span', { text: 'Formularios' })]),
        el('button', { class: 'btn btn-dark btn-sm', type: 'button', onclick: function () { A.nuevoCuestionario({ alCrear: cargar }); } }, [A.icon('i-plus'), el('span', { text: 'Nuevo cuestionario' })])
      ]));
      cont.appendChild(el('div', { class: 'alert ok', style: 'margin-top:14px' }, [A.icon('i-passport', 'icon-sm'),
        'Cada pareja recibe su propio enlace para llenar la petición por matrimonio (I-130 e I-130A) desde el celular. Se guarda solo, pueden subir documentos ahora o después, y aquí ves el avance.']));
      var stats = el('div', { class: 'stats' });
      var q = el('input', { class: 'input sm', type: 'search', placeholder: 'Buscar por nombre', oninput: function () { st.q = this.value.toLowerCase(); pintar(); } });
      var list = el('div', { class: 'list' }, [el('div', { class: 'empty', text: 'Cargando…' })]);
      cont.append(stats, el('div', { class: 'tools' }, [q]), list);
      var filas = [];
      async function cargar() {
        var r = await sb.from('cuestionarios').select(COLS).order('updated_at', { ascending: false }).limit(1000);
        if (r.error) { list.innerHTML = ''; list.appendChild(el('div', { class: 'empty', text: 'No se pudieron cargar los cuestionarios.' })); return; }
        filas = r.data || [];
        pintar();
        if (partes[0]) { var x = filas.filter(function (f) { return f.id === partes[0]; })[0]; partes[0] = null; if (x) abrir(x, cargar); }
      }
      function pintar() {
        stats.innerHTML = '';
        var activos = filas.filter(function (x) { return x.estado !== 'archivado'; });
        [['', activos.length, 'Activos'], ['borrador', filas.filter(function (x) { return x.estado === 'borrador'; }).length, 'Llenando'], ['enviado', filas.filter(function (x) { return x.estado === 'enviado'; }).length, 'Por revisar'], ['revisado', filas.filter(function (x) { return x.estado === 'revisado'; }).length, 'Revisados']].forEach(function (s) {
          stats.appendChild(el('button', { class: 'stat' + (st.estado === s[0] ? ' on' : ''), type: 'button', onclick: function () { st.estado = s[0]; pintar(); } }, [el('div', { class: 'k', text: s[1] }), el('div', { class: 'l', text: s[2] })]));
        });
        list.innerHTML = '';
        list.appendChild(el('div', { class: 'row cq head' }, [el('span', { text: 'Pareja' }), el('span', { class: 'hide-m', text: 'Avance' }), el('span', { class: 'hide-m', text: 'Documentos' }), el('span', { class: 'hide-m', text: 'Último cambio' }), el('span', { text: 'Estado' })]));
        var v = filas.filter(function (x) {
          if (st.estado ? x.estado !== st.estado : x.estado === 'archivado') return false;
          return !st.q || [nombreQ(x), x.titulo, x.clientes && A.nombreDe(x.clientes)].join(' ').toLowerCase().indexOf(st.q) !== -1;
        });
        if (!v.length) { list.appendChild(el('div', { class: 'empty' }, filas.length ? ['No hay cuestionarios con ese filtro.'] : [el('b', { text: 'Todavía no hay cuestionarios' }), 'Crea uno y mándale el enlace a la pareja por WhatsApp.'])); return; }
        v.forEach(function (x) {
          var pend = pendientes(x).length, subidos = (x.documentos || []).length;
          list.appendChild(el('button', { class: 'row cq' + (x.nuevo ? ' nueva' : ''), type: 'button', onclick: function () { abrir(x, cargar); } }, [
            el('span', { class: 'who-cell' }, [el('span', { class: 'avatar', text: A.iniciales(nombreQ(x)) }), el('div', null, [el('div', { class: 'name', text: nombreQ(x) }), el('div', { class: 'muted', text: x.clientes ? 'Cliente: ' + A.nombreDe(x.clientes) : (x.titulo && x.titulo !== nombreQ(x) ? x.titulo : 'Sin ligar a cliente') })])]),
            el('span', { class: 'hide-m cq-av' }, [el('span', { class: 'cq-bar' }, [el('i', { style: 'width:' + x.progreso + '%' })]), el('b', { text: x.progreso + '%' })]),
            el('span', { class: 'muted hide-m', text: subidos + ' subidos' + (pend ? ' · ' + pend + ' pendientes' : '') }),
            el('span', { class: 'muted hide-m', text: x.ultimo_acceso ? A.hace(x.updated_at) : 'Aún no lo abren' }),
            el('span', null, [el('span', { class: 'pill ' + PILL[x.estado], text: ESTADOS[x.estado] })])
          ]));
        });
      }
      cargar();
    }
  });

  /* ---------- Detalle ---------- */
  function valor(c, q, sens) {
    if (c.tipo === 'sensible') {
      var v = sens && sens[c.k];
      if (v) return el('span', { class: 'secret' }, [el('span', { text: v }), el('button', { type: 'button', text: 'Copiar', onclick: function () { copiar(v, 'Copiado.'); } })]);
      return null;
    }
    var t = U.valorTexto(c, (q.datos || {})[c.k]);
    return t ? el('span', { text: t }) : null;
  }
  function filas(campos, q, sens, ctx) {
    var out = [];
    ctx = ctx || q.datos || {};
    campos.forEach(function (c) {
      if (c.tipo === 'nota' || !U.cumple(c.si, ctx)) return;
      if (c.tipo === 'titulo') { out.push(el('div', { class: 'cq-sub', text: c.t })); return; }
      if (c.tipo === 'grupo') {
        var items = (ctx[c.k] || []).filter(function (it) { return !U.vacio(it); });
        if (!items.length) return;
        out.push(el('div', { class: 'fm-r' }, [el('span', { class: 'muted', text: c.t }), el('div', { class: 'cq-items' }, items.map(function (it, i) {
          return el('div', { class: 'cq-item' }, [c.max > 1 ? el('b', { text: c.item + ' ' + (i + 1) }) : null].concat(c.campos.map(function (sc) {
            var v = U.valorTexto(sc, it[sc.k]); return v ? el('div', null, [el('span', { class: 'muted', text: sc.t + ': ' }), el('span', { text: v })]) : null;
          })));
        }))]));
        return;
      }
      if (c.tipo === 'sensible') {
        var marcado = (q._llaves || []).indexOf(c.k) !== -1;
        var v = valor(c, q, sens);
        if (!v && !marcado) return;
        out.push(el('div', { class: 'fm-r' }, [el('span', { class: 'muted', text: c.t }), v || el('span', { class: 'muted', text: A.puede('sensibles') ? '•••• (toca «Mostrar datos sensibles»)' : 'Requiere permiso' })]));
        return;
      }
      var vv = valor(c, { datos: ctx }, sens);
      if (vv) out.push(el('div', { class: 'fm-r' }, [el('span', { class: 'muted', text: c.t }), vv]));
    });
    return out;
  }

  async function abrir(q, recargar) {
    var def = Q[q.tipo];
    if (!def) { A.toast('Tipo de cuestionario desconocido.', 'error'); return; }
    recargar = recargar || function () { };
    var sens = null;
    // Qué datos sensibles llenó (solo los nombres de los campos, sin verlos)
    var ll = await sb.rpc('cuestionario_llaves', { p_id: q.id });
    q._llaves = ll.data || [];
    if (q.nuevo) { sb.from('cuestionarios').update({ nuevo: false }).eq('id', q.id).then(function () { q.nuevo = false; A.contarSolicitudes(); recargar(); }); }

    function pintar() {
      var aviso = el('div', { class: 'msg', hidden: true });
      var cuerpo = [aviso];
      var pend = pendientes(q);
      cuerpo.push(el('div', { class: 'd-sec' }, [
        el('div', { class: 'cq-top' }, [el('span', { class: 'pill ' + PILL[q.estado], text: ESTADOS[q.estado] }),
          el('span', { class: 'cq-bar grande' }, [el('i', { style: 'width:' + q.progreso + '%' })]), el('b', { text: q.progreso + '%' })]),
        el('p', { class: 'muted', style: 'margin-top:8px', text: q.enviado_at ? 'Enviado el ' + A.fecha(q.enviado_at, true) + '.' : q.ultimo_acceso ? 'Lo abrieron por última vez ' + A.hace(q.ultimo_acceso) + '. Todavía no lo envían.' : 'Todavía no abren el enlace.' }),
        el('div', { class: 'fm-link', style: 'margin-top:10px' }, [el('code', { text: enlace(q).replace('https://', '') }), el('button', { class: 'mini-btn', type: 'button', text: 'Copiar', onclick: function () { copiar(enlace(q)); } })]),
        el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:10px' }, [
          el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: function () { compartir(q); } }, [A.icon('i-whatsapp', 'icon-sm'), el('span', { text: pend.length && q.estado !== 'borrador' ? 'Pedir documentos' : 'Mandar enlace' })]),
          el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: function () { imprimir(q, def, sens); } }, [A.icon('i-download', 'icon-sm'), el('span', { text: 'Imprimir / PDF' })]),
          A.puede('sensibles') && q._llaves.length ? el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: async function () {
            if (sens) { sens = null; pintar(); return; }
            var r = await sb.rpc('ver_cuestionario_sensible', { p_id: q.id });
            if (r.error) { A.toast('No se pudieron mostrar los datos.', 'error'); return; }
            sens = r.data || {}; pintar();
          } }, [A.icon(sens ? 'i-lock' : 'i-eye', 'icon-sm'), el('span', { text: sens ? 'Ocultar datos sensibles' : 'Mostrar datos sensibles' })]) : null
        ])
      ]));

      def.pasos.forEach(function (p, i) {
        if (p.revisar) return;
        var sec = el('div', { class: 'd-sec' }, [el('h3', { text: (i + 1) + '. ' + p.t })]);
        if (p.campos) {
          var f = filas(p.campos, q, sens);
          sec.appendChild(f.some(function (n) { return n.classList.contains('fm-r'); }) ? el('div', { class: 'fm-resp' }, f) : el('p', { class: 'muted', text: 'Sin respuestas todavía.' }));
        } else sec.appendChild(seccionDocs(q, recargar, pintar));
        cuerpo.push(sec);
      });

      var fm = (q.datos || {}).firma;
      if (fm && (fm.esposo || fm.esposa)) {
        cuerpo.push(el('div', { class: 'd-sec' }, [el('h3', { text: 'Aceptación y firma' }), el('div', { class: 'fm-resp' }, [
          el('div', { class: 'fm-r' }, [el('span', { class: 'muted', text: 'Firma del esposo' }), el('span', { text: fm.esposo || '—' })]),
          el('div', { class: 'fm-r' }, [el('span', { class: 'muted', text: 'Firma de la esposa' }), el('span', { text: fm.esposa || '—' })]),
          el('div', { class: 'fm-r' }, [el('span', { class: 'muted', text: 'Fecha' }), el('span', { text: fm.fecha ? A.fecha(fm.fecha, true) : '—' })]),
          el('div', { class: 'fm-r' }, [el('span', { class: 'muted', text: 'Aceptó' }), el('span', { text: def.acepto.map(function (t, i) { return ((fm.acepto || [])[i] ? '✓ ' : '✗ ') + t; }).join('\n') })])
        ])]));
      }

      var est = el('select', { class: 'input sm' }, Object.keys(ESTADOS).map(function (k) { return el('option', { value: k, text: ESTADOS[k] }); }));
      est.value = q.estado;
      var notas = el('textarea', { class: 'input', rows: 3, maxlength: 2000, placeholder: 'Notas internas' }); notas.value = q.notas || '';
      var cliSel = el('select', { class: 'input sm' }, [el('option', { value: '', text: 'Sin cliente' })]);
      A.clientesBasicos(q.cliente_id).then(function (cl) { cl.forEach(function (c) { cliSel.appendChild(el('option', { value: c.id, text: A.nombreDe(c) })); }); cliSel.value = q.cliente_id || ''; });
      cuerpo.push(el('div', { class: 'd-sec' }, [el('h3', { text: 'Seguimiento' }),
        el('div', { class: 'grid2' }, [el('div', { class: 'field' }, [el('label', { text: 'Estado' }), est]), el('div', { class: 'field' }, [el('label', { text: 'Cliente' }), cliSel])]),
        el('p', { class: 'muted', style: 'font-size:12px;margin-top:6px', text: '«Llenando» deja que la pareja vuelva a cambiar sus respuestas. Después de enviarlo solo pueden subir documentos.' }),
        el('div', { class: 'field', style: 'margin-top:10px' }, [el('label', { text: 'Notas' }), notas]),
        el('button', { class: 'btn btn-ghost btn-sm', type: 'button', style: 'margin-top:10px', onclick: async function () {
          var cambios = { estado: est.value, notas: notas.value.trim() || null, cliente_id: cliSel.value || null };
          var u = await sb.from('cuestionarios').update(cambios).eq('id', q.id).select(COLS).single();
          if (u.error) { A.msg(aviso, 'No se pudo guardar.'); return; }
          Object.assign(q, u.data); A.toast('Guardado.'); recargar(); pintar();
        } }, [el('span', { text: 'Guardar' })])]));

      var pie = [];
      if (q.cliente_id) pie.push(el('button', { class: 'btn btn-dark', type: 'button', onclick: function () { A.cerrarDrawer(); A.ir('clientes/' + q.cliente_id); } }, [A.icon('i-users'), el('span', { text: 'Ver ficha' })]));
      pie.push(el('button', { class: 'link-btn danger', type: 'button', text: 'Eliminar cuestionario y archivos', onclick: async function () {
        if (!confirm('¿Eliminar el cuestionario de ' + nombreQ(q) + ' con sus respuestas y archivos? Las copias que ya pasaste a la ficha del cliente se quedan. Esta acción no se puede deshacer.')) return;
        var paths = (q.documentos || []).map(function (a) { return a.path; }).filter(Boolean);
        if (paths.length) await sb.storage.from(BUCKET).remove(paths);
        var d = await sb.from('cuestionarios').delete().eq('id', q.id);
        if (d.error) { A.msg(aviso, 'No se pudo eliminar.'); return; }
        A.toast('Cuestionario eliminado.'); A.cerrarDrawer(); A.contarSolicitudes(); recargar();
      } }));
      A.drawer({ titulo: nombreQ(q), meta: def.titulo + ' · ' + def.subtitulo, cuerpo: cuerpo, pie: pie, mantenerScroll: true });
    }
    pintar();
  }

  function seccionDocs(q, recargar, repintar) {
    var cont = el('div');
    var docs = docsDe(q);
    var porDoc = {};
    (q.documentos || []).forEach(function (a) { (porDoc[a.doc] = porDoc[a.doc] || []).push(a); });
    var grupo = '';
    docs.forEach(function (d) {
      if (d.grupo !== grupo) { grupo = d.grupo; cont.appendChild(el('div', { class: 'cq-sub', text: grupo })); }
      var l = porDoc[d.k] || [];
      var marcado = (q.pendientes || []).indexOf(d.k) !== -1;
      cont.appendChild(el('div', { class: 'fm-r' }, [el('span', { class: 'muted', text: d.t }),
        l.length ? el('div', { class: 'fm-r-arch' }, l.map(function (a) { return el('button', { type: 'button', class: 'mini-btn', text: a.nombre + (a.copiado ? ' ✓' : ''), title: a.copiado ? 'Ya está en la ficha del cliente' : 'Abrir', onclick: function () { ver(a.path); } }); }))
          : el('span', { class: 'pill pendiente', text: marcado ? 'Lo envían después' : 'Pendiente' })]));
    });
    if (!(q.documentos || []).length) cont.appendChild(el('p', { class: 'muted', style: 'margin-top:8px', text: 'Todavía no han subido documentos.' }));
    var sinCopiar = (q.documentos || []).filter(function (a) { return !a.copiado; });
    if (sinCopiar.length && A.puede('documentos')) {
      cont.appendChild(el('button', { class: 'btn btn-ghost btn-sm', type: 'button', style: 'margin-top:12px', onclick: async function () {
        if (!q.cliente_id) { A.toast('Primero elige el cliente en «Seguimiento» y guarda.', 'error'); return; }
        this.disabled = true;
        var n = await pasarAFicha(q, docs);
        this.disabled = false;
        if (n) { A.toast(n + (n === 1 ? ' documento pasó' : ' documentos pasaron') + ' a la ficha del cliente.'); recargar(); repintar(); }
      } }, [A.icon('i-upload', 'icon-sm'), el('span', { text: 'Pasar ' + sinCopiar.length + (sinCopiar.length === 1 ? ' documento' : ' documentos') + ' a la ficha del cliente' })]));
    }
    return cont;
  }

  async function ver(path) {
    var win = window.open('', '_blank');
    var r = await sb.storage.from(BUCKET).createSignedUrl(path, 120);
    if (r.error) { if (win) win.close(); A.toast('No se pudo abrir el archivo.', 'error'); return; }
    if (win) win.location = r.data.signedUrl; else location.href = r.data.signedUrl;
  }

  // Copia los archivos a la carpeta del cliente para que aparezcan en Documentos de su ficha
  async function pasarAFicha(q, docs) {
    var n = 0, fallos = 0;
    var nombres = {}; docs.forEach(function (d) { nombres[d.k] = d.t; });
    for (var i = 0; i < q.documentos.length; i++) {
      var a = q.documentos[i];
      if (a.copiado) continue;
      var limpio = String(a.nombre || 'archivo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').slice(-80);
      var destino = 'clientes/' + q.cliente_id + '/i130/' + Date.now() + '-' + i + '-' + limpio;
      var cp = await sb.storage.from(BUCKET).copy(a.path, destino);
      if (cp.error) { fallos++; continue; }
      var ins = await sb.from('documentos').insert({ cliente_id: q.cliente_id, caso_id: q.caso_id, nombre: ('I-130 · ' + (nombres[a.doc] || 'Documento') + ' · ' + a.nombre).slice(0, 200), path: destino, tipo: a.tipo, tamano: a.tam, subido_por: A.yo().user_id });
      if (ins.error) { fallos++; await sb.storage.from(BUCKET).remove([destino]); continue; }
      a.copiado = true; n++;
    }
    if (n) await sb.from('cuestionarios').update({ documentos: q.documentos }).eq('id', q.id);
    if (fallos) A.toast(fallos === 1 ? 'Un archivo no se pudo pasar. Ábrelo desde aquí.' : fallos + ' archivos no se pudieron pasar. Ábrelos desde aquí.', 'error');
    return n;
  }

  // Hoja para imprimir o guardar como PDF (útil para llenar el I-130 en la computadora)
  function imprimir(q, def, sens) {
    var w = window.open('', '_blank');
    if (!w) { A.toast('Permite las ventanas emergentes para imprimir.', 'error'); return; }
    var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
    var html = '';
    def.pasos.forEach(function (p, i) {
      if (p.revisar) return;
      html += '<h2>' + (i + 1) + '. ' + esc(p.t) + '</h2>';
      if (p.campos) {
        html += '<table>';
        (function recorrer(campos, ctx) {
          campos.forEach(function (c) {
            if (c.tipo === 'nota' || !U.cumple(c.si, ctx)) return;
            if (c.tipo === 'titulo') { html += '<tr class="sub"><td colspan="2">' + esc(c.t) + '</td></tr>'; return; }
            if (c.tipo === 'grupo') {
              (ctx[c.k] || []).filter(function (it) { return !U.vacio(it); }).forEach(function (it, j) {
                var t = c.campos.map(function (sc) { var v = U.valorTexto(sc, it[sc.k]); return v ? '<b>' + esc(sc.t) + ':</b> ' + esc(v) : ''; }).filter(Boolean).join('<br>');
                html += '<tr><td>' + esc(c.item) + (c.max > 1 ? ' ' + (j + 1) : '') + '</td><td>' + t + '</td></tr>';
              });
              return;
            }
            var v = c.tipo === 'sensible' ? (sens && sens[c.k]) || ((q._llaves || []).indexOf(c.k) !== -1 ? '(oculto: muéstralo en el CRM antes de imprimir)' : '') : U.valorTexto(c, ctx[c.k]);
            if (v) html += '<tr><td>' + esc(c.t) + '</td><td>' + esc(v) + '</td></tr>';
          });
        })(p.campos, q.datos || {});
        html += '</table>';
      } else {
        html += '<table>';
        docsDe(q).forEach(function (d) {
          var n = (q.documentos || []).filter(function (a) { return a.doc === d.k; }).length;
          html += '<tr><td>' + esc(d.t) + '</td><td>' + (n ? '✓ ' + n + (n === 1 ? ' archivo' : ' archivos') : 'Pendiente') + '</td></tr>';
        });
        html += '</table>';
      }
    });
    var fm = (q.datos || {}).firma || {};
    if (fm.esposo || fm.esposa) html += '<h2>Firma</h2><table><tr><td>Esposo</td><td>' + esc(fm.esposo) + '</td></tr><tr><td>Esposa</td><td>' + esc(fm.esposa) + '</td></tr><tr><td>Fecha</td><td>' + esc(fm.fecha ? A.fecha(fm.fecha, true) : '') + '</td></tr></table>';
    w.document.write('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>I-130 · ' + esc(nombreQ(q)) + '</title><style>' +
      'body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1b1b1a;margin:32px;font-size:12.5px}h1{font-size:22px;margin:0}p.m{color:#6e6a63;margin:4px 0 18px}' +
      'h2{font-size:15px;margin:22px 0 6px;padding-bottom:4px;border-bottom:2px solid #736251;color:#736251}table{width:100%;border-collapse:collapse}td{padding:5px 6px;border-bottom:1px solid #e6e1d8;vertical-align:top}' +
      'td:first-child{width:36%;color:#6e6a63}tr.sub td{padding-top:12px;font-weight:700;color:#1b1b1a;border-bottom:0;text-transform:uppercase;font-size:11px;letter-spacing:.08em}@media print{body{margin:12mm}}</style></head><body>' +
      '<h1>' + esc(def.titulo) + ' · ' + esc(nombreQ(q)) + '</h1><p class="m">' + esc(def.subtitulo) + ' · ' + (q.enviado_at ? 'Enviado el ' + esc(A.fecha(q.enviado_at, true)) : 'Borrador (' + q.progreso + '%)') + ' · Confidencial</p>' + html +
      '<script>setTimeout(function(){print()},300)<\/script></body></html>');
    w.document.close();
  }

  A.abrirCuestionario = function (id) { A.ir('cuestionarios/' + id); };
})();
