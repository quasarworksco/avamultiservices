/* Panel CRM — Contenido digital: posts y diseños de DGP para AVA, con aprobación, comentarios y calendario */
(function () {
  'use strict';
  var A = window.AVA, el = A.el, sb = A.sb;
  var BUCKET = 'contenido';
  var ESTADOS = { por_aprobar: 'Por aprobar', cambios: 'Cambios pedidos', aprobado: 'Aprobado', publicado: 'Publicado' };
  var TIPOS = { post: 'Post', historia: 'Historia', reel: 'Reel', flyer: 'Flyer', otro: 'Otro' };
  var REDES = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', whatsapp: 'WhatsApp', otra: 'Otra' };
  var st = { estado: '', vista: 'galeria', mes: A.hoyISO().slice(0, 7) };
  var ui = {};
  var items = [];
  var urls = {};

  A.contarContenido = async function () {
    if (!A.puede('contenido')) return;
    var r = await sb.from('contenido').select('id', { count: 'exact', head: true }).eq('estado', 'por_aprobar');
    var n = document.getElementById('count-con');
    if (n) n.textContent = r.count ? r.count : '';
  };

  async function firmar(paths) {
    var faltan = paths.filter(function (p) { return !urls[p]; });
    if (faltan.length) {
      var r = await sb.storage.from(BUCKET).createSignedUrls(faltan, 3600);
      (r.data || []).forEach(function (x) { if (x.signedUrl) urls[x.path] = x.signedUrl; });
    }
    return paths.map(function (p) { return urls[p]; });
  }
  function esVideo(a) { return /^video\//.test(a.tipo || ''); }
  function esImg(a) { return /^image\//.test(a.tipo || ''); }

  A.vista('contenido', {
    permiso: 'contenido',
    render: function (cont) {
      ui.tabs = el('div', { class: 'tabs' });
      ui.body = el('div');
      ui.toggle = el('div', { class: 'seg' }, [['galeria', 'Galería', 'i-image'], ['calendario', 'Calendario', 'i-calendar']].map(function (v) {
        return el('button', { type: 'button', class: st.vista === v[0] ? 'on' : '', 'data-v': v[0], onclick: function () { st.vista = v[0]; pintar(); } }, [A.icon(v[2], 'icon-sm'), v[1]]);
      }));
      cont.appendChild(A.cabecera('Tu marca', 'Contenido', 'digital', [
        ui.toggle,
        el('button', { class: 'btn btn-dark btn-sm', onclick: function () { editar(null); } }, [A.icon('i-upload'), el('span', { text: 'Subir contenido' })])
      ]));
      cont.appendChild(el('p', { class: 'muted', style: 'margin-top:10px;max-width:680px', text: 'Aquí DGP te sube los posts, historias y flyers de AVA. Apruébalos, pide cambios con un comentario y descárgalos listos para publicar.' }));
      cont.appendChild(ui.tabs);
      cont.appendChild(ui.body);
      cargar();
    }
  });

  async function cargar() {
    var r = await sb.from('contenido').select('*').order('fecha_publicacion', { ascending: false, nullsFirst: true }).order('created_at', { ascending: false }).limit(1000);
    items = r.data || [];
    pintar();
    A.contarContenido();
  }

  function pintar() {
    ui.toggle.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === st.vista); });
    ui.tabs.innerHTML = '';
    [['', 'Todo']].concat(Object.keys(ESTADOS).map(function (k) { return [k, ESTADOS[k]]; })).forEach(function (t) {
      var n = items.filter(function (i) { return !t[0] || i.estado === t[0]; }).length;
      ui.tabs.appendChild(el('button', { type: 'button', class: 'tab' + (st.estado === t[0] ? ' on' : ''), onclick: function () { st.estado = t[0]; pintar(); } }, [t[1], el('span', { class: 'n', text: n })]));
    });
    ui.body.innerHTML = '';
    var vis = items.filter(function (i) { return !st.estado || i.estado === st.estado; });
    if (st.vista === 'calendario') { ui.body.appendChild(calendario(vis)); return; }
    if (!vis.length) { ui.body.appendChild(el('div', { class: 'empty' }, [el('b', { text: items.length ? 'Nada en esta pestaña' : 'Tu biblioteca está lista' }), items.length ? '' : 'Aquí aparecerán los diseños que te preparemos.'])); return; }
    var grid = el('div', { class: 'gallery' });
    vis.forEach(function (it, i) { grid.appendChild(tarjeta(it, i)); });
    ui.body.appendChild(grid);
  }

  function tarjeta(it, i) {
    var arch = it.archivos || [];
    var thumb = el('div', { class: 'g-thumb' }, [A.icon(arch.length ? 'i-image' : 'i-sparkles')]);
    var primero = arch.filter(function (a) { return esImg(a) || esVideo(a); })[0];
    if (primero) firmar([primero.path]).then(function (u) {
      if (!u[0]) return;
      thumb.innerHTML = '';
      thumb.appendChild(esVideo(primero) ? el('video', { src: u[0], muted: true, playsinline: true, preload: 'metadata' }) : el('img', { src: u[0], alt: '', loading: 'lazy' }));
      if (arch.length > 1) thumb.appendChild(el('span', { class: 'g-n', text: '+' + (arch.length - 1) }));
    });
    return el('button', { type: 'button', class: 'g-card', style: 'animation-delay:' + Math.min(i * 50, 500) + 'ms', onclick: function () { abrir(it); } }, [
      thumb,
      el('div', { class: 'g-b' }, [
        el('span', { class: 'pill c-' + it.estado, text: ESTADOS[it.estado] }),
        el('b', { text: it.titulo }),
        el('span', { class: 'muted', text: [TIPOS[it.tipo], REDES[it.red], it.fecha_publicacion ? A.fecha(it.fecha_publicacion) : null].filter(Boolean).join(' · ') })
      ])
    ]);
  }

  function calendario(vis) {
    var ini = new Date(st.mes + '-01T12:00:00');
    var dias = new Date(ini.getFullYear(), ini.getMonth() + 1, 0).getDate();
    var offset = (ini.getDay() + 6) % 7; // semana empieza en lunes
    var hoy = A.hoyISO();
    var cal = el('div', { class: 'cal-card card' });
    var mover = function (n) { var d = new Date(ini); d.setMonth(d.getMonth() + n); st.mes = d.toISOString().slice(0, 7); pintar(); };
    cal.appendChild(el('div', { class: 'card-h' }, [
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Mes anterior', onclick: function () { mover(-1); } }, [A.icon('i-chevron-left', 'icon-sm')]),
      el('h3', { class: 'cal-title', text: (function (t) { return t.charAt(0).toUpperCase() + t.slice(1); })(ini.toLocaleDateString('es-US', { month: 'long', year: 'numeric' })) }),
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Mes siguiente', style: 'transform:scaleX(-1)', onclick: function () { mover(1); } }, [A.icon('i-chevron-left', 'icon-sm')])
    ]));
    var g = el('div', { class: 'cal-grid' });
    ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].forEach(function (d) { g.appendChild(el('div', { class: 'cal-dow', text: d })); });
    for (var b = 0; b < offset; b++) g.appendChild(el('div', { class: 'cal-day empty' }));
    for (var d = 1; d <= dias; d++) {
      var iso = st.mes + '-' + String(d).padStart(2, '0');
      var dia = el('div', { class: 'cal-day' + (iso === hoy ? ' today' : '') }, [el('span', { class: 'cal-n', text: d })]);
      vis.filter(function (i) { return i.fecha_publicacion === iso; }).forEach(function (it) {
        dia.appendChild(el('button', { type: 'button', class: 'cal-item c-' + it.estado, title: it.titulo, text: it.titulo, onclick: function () { abrir(it); } }));
      });
      g.appendChild(dia);
    }
    cal.appendChild(g);
    var sinFecha = vis.filter(function (i) { return !i.fecha_publicacion; });
    if (sinFecha.length) cal.appendChild(el('p', { class: 'muted', style: 'margin-top:12px', text: sinFecha.length + ' sin fecha de publicación (ver en Galería).' }));
    return cal;
  }

  async function abrir(it) {
    var arch = it.archivos || [];
    var firmadas = await firmar(arch.map(function (a) { return a.path; }));
    var media = el('div', { class: 'media' });
    arch.forEach(function (a, i) {
      var u = firmadas[i];
      var box = el('div', { class: 'media-i' }, [
        esVideo(a) ? el('video', { src: u, controls: true, playsinline: true }) : esImg(a) ? el('img', { src: u, alt: a.nombre }) : el('div', { class: 'media-f' }, [A.icon('i-file'), a.nombre]),
        el('button', { class: 'mini-btn', type: 'button', onclick: async function () {
          var r = await sb.storage.from(BUCKET).createSignedUrl(a.path, 300, { download: a.nombre });
          if (r.data) location.href = r.data.signedUrl;
        } }, [A.icon('i-download', 'icon-sm'), ' Descargar'])
      ]);
      media.appendChild(box);
    });
    if (!arch.length) media.appendChild(el('div', { class: 'muted', text: 'Sin archivos.' }));

    var copy = it.copy ? el('section', { class: 'd-sec' }, [el('div', { class: 'card-h' }, [el('h3', { text: 'Texto para publicar' }), el('button', { class: 'mini-btn', type: 'button', onclick: function () {
      navigator.clipboard.writeText(it.copy).then(function () { A.toast('Texto copiado.'); }, function () { A.toast('No se pudo copiar.', 'error'); });
    } }, [A.icon('i-copy', 'icon-sm'), ' Copiar'])]), el('p', { class: 'copy', text: it.copy })]) : null;

    var hilo = el('div', { class: 'thread' });
    var r = await sb.from('contenido_comentarios').select('*').eq('contenido_id', it.id).order('created_at');
    (r.data || []).forEach(function (c) { hilo.appendChild(el('div', { class: 'cmt' }, [el('span', { class: 'avatar', text: A.iniciales(c.autor) }), el('div', null, [el('b', { text: c.autor || 'Equipo' }), el('span', { class: 'muted', text: ' · ' + A.hace(c.created_at) }), el('p', { text: c.texto })])])); });
    if (!(r.data || []).length) hilo.appendChild(el('div', { class: 'muted', text: 'Sin comentarios todavía.' }));
    var nota = el('textarea', { class: 'input', placeholder: 'Escribe un comentario o los cambios que necesitas…', maxlength: 1000, style: 'min-height:70px' });

    async function comentar(texto) {
      var yo = A.yo();
      return sb.from('contenido_comentarios').insert({ contenido_id: it.id, texto: texto, autor: yo.nombre || yo.email, user_id: yo.user_id });
    }
    async function estado(nuevo, pedirComentario) {
      var t = nota.value.trim();
      if (pedirComentario && !t) { nota.focus(); A.toast('Cuéntanos qué cambios necesitas.', 'error'); return; }
      if (t) { var c = await comentar(t); if (c.error) { A.toast('No se pudo guardar el comentario.', 'error'); return; } }
      var u = await sb.from('contenido').update({ estado: nuevo }).eq('id', it.id);
      if (u.error) { A.toast('No se pudo actualizar.', 'error'); return; }
      A.toast(ESTADOS[nuevo] + '.');
      it.estado = nuevo;
      A.cerrarDrawer(); cargar();
    }

    A.drawer({
      titulo: it.titulo,
      meta: [TIPOS[it.tipo], REDES[it.red], it.fecha_publicacion ? 'publicar el ' + A.fecha(it.fecha_publicacion) : 'sin fecha'].join(' · '),
      cuerpo: [
        el('section', { class: 'd-sec' }, [el('div', { class: 'card-h' }, [el('h3', { text: 'Diseño' }), el('span', { class: 'pill c-' + it.estado, text: ESTADOS[it.estado] })]), media]),
        copy,
        el('section', { class: 'd-sec' }, [el('h3', { text: 'Comentarios' }), hilo])
      ],
      pie: [
        nota,
        el('div', { class: 'row2' }, [
          it.estado !== 'aprobado' && it.estado !== 'publicado' ? el('button', { class: 'btn btn-dark', type: 'button', onclick: function () { estado('aprobado'); } }, [A.icon('i-check'), el('span', { text: 'Aprobar' })]) : null,
          it.estado !== 'publicado' ? el('button', { class: 'btn btn-ghost', type: 'button', onclick: function () { estado('cambios', true); } }, [A.icon('i-message'), el('span', { text: 'Pedir cambios' })]) : null,
          it.estado === 'aprobado' ? el('button', { class: 'btn btn-primary', type: 'button', onclick: function () { estado('publicado'); } }, [A.icon('i-sparkles'), el('span', { text: 'Marcar publicado' })]) : null,
          el('button', { class: 'btn btn-ghost', type: 'button', onclick: async function () {
            var t = nota.value.trim(); if (!t) { nota.focus(); return; }
            var c = await comentar(t); if (c.error) { A.toast('No se pudo comentar.', 'error'); return; }
            A.toast('Comentario agregado.'); abrir(it);
          } }, [el('span', { text: 'Solo comentar' })])
        ]),
        el('div', { class: 'row2' }, [
          el('button', { type: 'button', class: 'link-btn', text: 'Editar datos o archivos', onclick: function () { editar(it); } }),
          it.estado !== 'por_aprobar' ? el('button', { type: 'button', class: 'link-btn', text: 'Volver a «Por aprobar»', onclick: function () { estado('por_aprobar'); } }) : null
        ])
      ]
    });
  }

  function limpio(n) { return n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '-').slice(-80); }

  function editar(it) {
    var nuevo = !it;
    it = it || {};
    var files = el('input', { type: 'file', multiple: true, accept: 'image/*,video/mp4,video/quicktime,application/pdf' });
    var actuales = el('div', { class: 'chips', style: 'margin-top:8px' });
    var quitar = [];
    (it.archivos || []).forEach(function (a) {
      var chip = el('span', { class: 'chip-s' }, [a.nombre, el('button', { type: 'button', class: 'chip-x', 'aria-label': 'Quitar ' + a.nombre, text: '×', onclick: function () { quitar.push(a.path); chip.remove(); } })]);
      actuales.appendChild(chip);
    });
    A.modal({
      titulo: nuevo ? 'Subir contenido' : 'Editar contenido', ok: nuevo ? 'Subir' : 'Guardar',
      campos: [
        { k: 'titulo', label: 'Título', required: true, full: true, value: it.titulo, max: 160, placeholder: 'Temporada de taxes · carrusel' },
        { k: 'tipo', label: 'Tipo', type: 'select', value: it.tipo || 'post', options: Object.keys(TIPOS).map(function (k) { return [k, TIPOS[k]]; }) },
        { k: 'red', label: 'Red social', type: 'select', value: it.red || 'instagram', options: Object.keys(REDES).map(function (k) { return [k, REDES[k]]; }) },
        { k: 'fecha_publicacion', label: 'Fecha de publicación', type: 'date', value: it.fecha_publicacion },
        { k: 'copy', label: 'Texto / caption', type: 'textarea', full: true, value: it.copy, max: 3000 }
      ],
      extra: el('div', { class: 'field', style: 'margin-top:14px' }, [el('label', { text: 'Archivos (imágenes, videos o PDF · hasta 25 MB)' }), files, actuales]),
      borrar: nuevo ? null : async function () {
        var paths = (it.archivos || []).map(function (a) { return a.path; });
        if (paths.length) await sb.storage.from(BUCKET).remove(paths);
        var r = await sb.from('contenido').delete().eq('id', it.id);
        if (r.error) { A.toast('No se pudo eliminar.', 'error'); return false; }
        A.cerrarDrawer(); A.toast('Contenido eliminado.'); cargar();
      },
      borrarTexto: 'Eliminar contenido',
      guardar: async function (d, aviso) {
        var id = it.id;
        if (nuevo) {
          var ins = await sb.from('contenido').insert(d).select('id').single();
          if (ins.error) { A.msg(aviso, 'No se pudo guardar.'); return false; }
          id = ins.data.id;
        }
        var archivos = (it.archivos || []).filter(function (a) { return quitar.indexOf(a.path) === -1; });
        var lista = Array.prototype.slice.call(files.files);
        for (var i = 0; i < lista.length; i++) {
          var f = lista[i];
          if (f.size > 25 * 1024 * 1024) { A.toast(f.name + ': supera 25 MB.', 'error'); continue; }
          A.msg(aviso, 'Subiendo ' + f.name + '…', 'ok');
          var path = id + '/' + Date.now() + '-' + limpio(f.name);
          var up = await sb.storage.from(BUCKET).upload(path, f, { contentType: f.type });
          if (up.error) { A.toast('No se pudo subir ' + f.name + '.', 'error'); continue; }
          archivos.push({ path: path, nombre: f.name, tipo: f.type });
        }
        if (quitar.length) await sb.storage.from(BUCKET).remove(quitar);
        d.archivos = archivos;
        if (!nuevo && (lista.length || quitar.length) && it.estado === 'cambios') d.estado = 'por_aprobar';
        var u = await sb.from('contenido').update(d).eq('id', id);
        if (u.error) { A.msg(aviso, 'No se pudo guardar.'); return false; }
        A.toast(nuevo ? 'Contenido subido.' : 'Contenido actualizado.');
        A.cerrarDrawer(); cargar();
      }
    });
  }
})();
