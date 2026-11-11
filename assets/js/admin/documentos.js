/* Panel CRM — Documentos privados de clientes (bucket "documentos", carpeta clientes/) */
(function () {
  'use strict';
  var A = window.AVA, el = A.el, sb = A.sb;
  var BUCKET = 'documentos';
  var MAX = 10 * 1024 * 1024;
  var TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'application/pdf'];

  function tamano(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  function limpio(n) { return n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '-').slice(-80); }

  // Documentos de identidad (Social, licencia, pasaporte…): solo los abre quien tiene el permiso «Datos sensibles»
  var RESTRINGIDO = 'Documento restringido: lo abre solo quien tiene el permiso «Datos sensibles».';
  A.abrirDocumento = async function (path, sensible) {
    if (sensible && !A.puede('sensibles')) { A.toast(RESTRINGIDO, 'error'); return; }
    var win = window.open('', '_blank');
    var r = await sb.storage.from(BUCKET).createSignedUrl(path, 120);
    if (r.error) { if (win) win.close(); A.toast(/not found|denied|policy/i.test(r.error.message || '') ? RESTRINGIDO : 'No se pudo abrir el documento.', 'error'); return; }
    if (win) win.location = r.data.signedUrl; else location.href = r.data.signedUrl;
  };

  async function subir(clienteId, archivos, alTerminar, servicio) {
    var ok = 0;
    for (var i = 0; i < archivos.length; i++) {
      var f = archivos[i];
      if (f.size > MAX) { A.toast(f.name + ': supera 10 MB.', 'error'); continue; }
      if (TIPOS.indexOf(f.type) === -1) { A.toast(f.name + ': solo imágenes o PDF.', 'error'); continue; }
      var path = 'clientes/' + clienteId + '/' + Date.now() + '-' + limpio(f.name);
      A.toast('Subiendo ' + f.name + '…');
      var up = await sb.storage.from(BUCKET).upload(path, f, { contentType: f.type, upsert: false });
      if (up.error) { A.toast('No se pudo subir ' + f.name + '.', 'error'); continue; }
      var ins = await sb.from('documentos').insert({ cliente_id: clienteId, nombre: f.name.slice(0, 200), path: path, tipo: f.type, tamano: f.size, servicio: servicio || null });
      if (ins.error) { await sb.storage.from(BUCKET).remove([path]); A.toast('No se pudo registrar ' + f.name + '.', 'error'); continue; }
      ok++;
    }
    if (ok) A.toast(ok === 1 ? 'Documento subido.' : ok + ' documentos subidos.');
    if (alTerminar) alTerminar();
  }

  async function borrar(d, alTerminar) {
    if (!confirm('¿Eliminar «' + d.nombre + '»? Esta acción no se puede deshacer.')) return;
    var rs = await sb.storage.from(BUCKET).remove([d.path]);
    if (rs.error) { A.toast('No se pudo eliminar el archivo.', 'error'); return; }
    await sb.from('documentos').delete().eq('id', d.id);
    A.toast('Documento eliminado.');
    if (alTerminar) alTerminar();
  }

  function nombreServicio(k) { return k && A.SERVICIOS[k] ? A.SERVICIOS[k].label : 'General'; }
  A.nombreServicioDoc = nombreServicio;
  // Mover a otro servicio y, con el permiso de datos sensibles, restringir o liberar el documento
  function opciones(d, alCambiar) {
    var ops = Object.keys(A.SERVICIOS).filter(function (k) { return !A.SERVICIOS[k].oculto; }).map(function (k) { return [k, A.SERVICIOS[k].label]; });
    A.modal({ titulo: d.nombre, ok: 'Guardar',
      campos: [{ k: 'servicio', label: 'Servicio', type: 'select', full: true, value: d.servicio || '', options: [['', 'General (sin servicio)']].concat(ops) }].concat(A.puede('sensibles') ? [
        { k: 'sensible', label: 'Acceso', type: 'select', full: true, value: d.sensible ? 'si' : 'no', options: [['si', 'Restringido: solo con permiso de datos sensibles'], ['no', 'Normal: lo abre quien ve documentos']] }] : []),
      extra: A.puede('sensibles') ? null : el('p', { class: 'muted', style: 'margin-top:10px;font-size:12.5px', text: 'Solo quien tiene el permiso «Datos sensibles» puede cambiar el acceso de un documento.' }),
      guardar: async function (v, aviso) {
        var cambio = { servicio: v.servicio || null };
        if (A.puede('sensibles') && v.sensible) cambio.sensible = v.sensible === 'si';
        var u = await sb.from('documentos').update(cambio).eq('id', d.id);
        if (u.error) { A.msg(aviso, 'No se pudo guardar.'); return false; }
        A.toast('Documento actualizado.'); if (alCambiar) alCambiar();
      } });
  }
  function fila(d, alCambiar, conCliente) {
    var bloqueado = d.sensible && !A.puede('sensibles');
    return el('div', { class: 'doc' + (d.sensible ? ' doc-sens' : '') }, [
      el('span', { class: 'doc-n' }, [A.icon(d.sensible ? 'i-lock' : d.tipo === 'application/pdf' ? 'i-file' : 'i-image', 'icon-sm'), el('span', null, [
        el('b', { text: d.nombre }),
        el('span', { class: 'muted', text: [conCliente && d.clientes ? A.nombreDe(d.clientes) : null, conCliente ? nombreServicio(d.servicio) : null, d.sensible ? 'Restringido' : null, tamano(d.tamano || 0), A.fecha(d.created_at)].filter(Boolean).join(' · ') })
      ])]),
      el('span', { class: 'doc-a' }, [
        el('button', { class: 'btn btn-dark', type: 'button', text: bloqueado ? 'Restringido' : 'Ver', disabled: bloqueado || null, title: bloqueado ? RESTRINGIDO : null, onclick: function () { A.abrirDocumento(d.path, d.sensible); } }),
        el('button', { class: 'mini-btn', type: 'button', 'aria-label': 'Servicio y acceso', title: 'Servicio y acceso', onclick: function () { opciones(d, alCambiar); } }, [A.icon('i-edit', 'icon-sm')]),
        el('button', { class: 'mini-btn', type: 'button', 'aria-label': 'Eliminar', onclick: function () { borrar(d, alCambiar); } }, [A.icon('i-trash', 'icon-sm')])
      ])
    ]);
  }
  // Documentos agrupados: primero los de identidad (restringidos), luego por servicio y al final los generales
  function agrupados(lista, alCambiar, primero) {
    var grupos = {}, orden = [];
    lista.forEach(function (d) { var g = d.sensible ? '_id' : (d.servicio || '_gen'); if (!grupos[g]) { grupos[g] = []; orden.push(g); } grupos[g].push(d); });
    var claves = Object.keys(A.SERVICIOS);
    orden.sort(function (a, b) {
      function peso(g) { return g === '_id' ? -2 : g === primero ? -1 : g === '_gen' ? 99 : claves.indexOf(g); }
      return peso(a) - peso(b);
    });
    return orden.map(function (g) {
      var titulo = g === '_id' ? 'Identificación · restringidos' : g === '_gen' ? 'General' : nombreServicio(g);
      var det = el('details', { class: 'doc-grupo', open: (g === primero || g === '_id' || orden.length <= 2) || null }, [
        el('summary', null, [el('span', { text: titulo }), el('span', { class: 'muted', text: String(grupos[g].length) })])]);
      var box = el('div', { class: 'docs' }); grupos[g].forEach(function (d) { box.appendChild(fila(d, alCambiar)); }); det.appendChild(box);
      return det;
    });
  }

  function zona(clienteId, alTerminar, servicioDe) {
    var inp = el('input', { type: 'file', multiple: true, accept: 'image/*,application/pdf', hidden: true });
    function svc() { return servicioDe ? servicioDe() : null; }
    var z = el('label', { class: 'drop' }, [inp, A.icon('i-upload'), el('span', null, [el('b', { text: 'Subir documentos' }), el('span', { class: 'muted', text: 'Arrastra aquí o toca para elegir · imágenes o PDF hasta 10 MB' })])]);
    inp.addEventListener('change', function () { if (inp.files.length) subir(clienteId, Array.prototype.slice.call(inp.files), alTerminar, svc()); inp.value = ''; });
    z.addEventListener('dragover', function (e) { e.preventDefault(); z.classList.add('over'); });
    z.addEventListener('dragleave', function () { z.classList.remove('over'); });
    z.addEventListener('drop', function (e) { e.preventDefault(); z.classList.remove('over'); subir(clienteId, Array.prototype.slice.call(e.dataTransfer.files), alTerminar, svc()); });
    return z;
  }
  // Selector «¿De qué servicio es?» para subir: los servicios de los casos del cliente y General
  async function selectorServicio(clienteId, preferido) {
    var r = await sb.from('casos').select('servicio').eq('cliente_id', clienteId).neq('estado', 'cancelado');
    var svcs = []; (r.data || []).forEach(function (k) { if (svcs.indexOf(k.servicio) === -1) svcs.push(k.servicio); });
    if (preferido && svcs.indexOf(preferido) === -1) svcs.unshift(preferido);
    var sel = el('select', { class: 'input sm', 'aria-label': 'Servicio del documento' }, svcs.map(function (k) { return el('option', { value: k, text: nombreServicio(k) }); }).concat([el('option', { value: '', text: 'General (sin servicio)' })]));
    sel.value = preferido || svcs[0] || '';
    return sel;
  }

  /* Tarjeta para la ficha del cliente */
  // «primero»: el servicio que se muestra arriba y abierto (por ejemplo, el del caso desde su ficha)
  A.tarjetaDocumentos = function (clienteId, primero) {
    var card = el('div', { class: 'card' });
    async function pintar() {
      var res = await Promise.all([sb.from('documentos').select('*').eq('cliente_id', clienteId).order('created_at', { ascending: false }), selectorServicio(clienteId, primero)]);
      card.innerHTML = '';
      var lista = res[0].data || [], sel = res[1];
      card.appendChild(el('h3', { class: 't', text: 'Documentos · ' + lista.length }));
      if (!lista.length) card.appendChild(el('div', { class: 'muted', style: 'margin-bottom:10px', text: 'Aún no hay documentos de este cliente.' }));
      agrupados(lista, pintar, primero).forEach(function (g) { card.appendChild(g); });
      card.appendChild(el('label', { class: 'doc-subir-a' }, [el('span', { text: 'Subir a' }), sel]));
      card.appendChild(zona(clienteId, pintar, function () { return sel.value; }));
    }
    pintar();
    return card;
  };

  var filtro = { q: '', servicio: '' };
  var ui = {};
  A.vista('documentos', {
    permiso: 'documentos',
    render: function (cont) {
      ui.list = el('div', { class: 'docs', style: 'margin-top:16px' });
      cont.appendChild(A.cabecera('Archivo privado', 'Documentos', 'de clientes', [
        el('button', { class: 'btn btn-dark btn-sm', onclick: elegirCliente }, [A.icon('i-upload'), el('span', { text: 'Subir documento' })])
      ]));
      cont.appendChild(el('p', { class: 'muted', style: 'margin-top:10px;max-width:640px', text: 'Los archivos se guardan de forma privada. Cada vez que abres uno se genera un enlace que caduca en 2 minutos.' }));
      var fs = el('select', { class: 'input sm', 'aria-label': 'Servicio', style: 'max-width:220px', onchange: function () { filtro.servicio = this.value; pintar(); } },
        [el('option', { value: '', text: 'Todos los servicios' }), el('option', { value: '_id', text: 'Identificación (restringidos)' })].concat(Object.keys(A.SERVICIOS).filter(function (k) { return !A.SERVICIOS[k].oculto; }).map(function (k) { return el('option', { value: k, text: A.SERVICIOS[k].label }); }), [el('option', { value: '_gen', text: 'General' })]));
      fs.value = filtro.servicio;
      cont.appendChild(el('div', { class: 'tools' }, [el('input', { class: 'input search', type: 'search', placeholder: 'Buscar por cliente o nombre de archivo', value: filtro.q, oninput: function () { filtro.q = this.value; pintar(); } }), fs]));
      cont.appendChild(ui.list);
      cargar();
    }
  });

  var docs = [];
  async function cargar() {
    var r = await sb.from('documentos').select('*, clientes(id,nombre,apellidos)').order('created_at', { ascending: false }).limit(2000);
    docs = r.data || [];
    pintar();
  }
  function pintar() {
    var q = filtro.q.toLowerCase();
    ui.list.innerHTML = '';
    var vis = docs.filter(function (d) {
      var g = d.sensible ? '_id' : (d.servicio || '_gen');
      return (!filtro.servicio || filtro.servicio === g || (filtro.servicio === d.servicio)) && (!q || (d.nombre + ' ' + A.nombreDe(d.clientes || {})).toLowerCase().indexOf(q) !== -1);
    });
    if (!vis.length) { ui.list.appendChild(el('div', { class: 'empty' }, docs.length ? ['Sin resultados.'] : [el('b', { text: 'Aún no hay documentos' }), 'Súbelos desde aquí o desde la ficha de cada cliente.'])); return; }
    vis.forEach(function (d) { ui.list.appendChild(fila(d, cargar, true)); });
  }

  async function elegirCliente() {
    var r = { data: await A.clientesBasicos() };
    if (!(r.data || []).length) { A.toast('Primero crea un cliente.', 'error'); return; }
    var m = A.modal({
      titulo: 'Subir documento', ok: 'Listo',
      campos: [{ k: 'cliente_id', label: 'Cliente', type: 'select', full: true, options: r.data.map(function (c) { return [c.id, A.nombreDe(c)]; }) }],
      guardar: function () { cargar(); }
    });
    var holder = el('div', { style: 'margin-top:14px' });
    m.inputs.cliente_id.closest('.grid2').after(holder);
    async function z() {
      var id = m.inputs.cliente_id.value, sel = await selectorServicio(id);
      holder.innerHTML = '';
      holder.appendChild(el('label', { class: 'doc-subir-a' }, [el('span', { text: 'Subir a' }), sel]));
      holder.appendChild(zona(id, function () { m.cerrar(); cargar(); }, function () { return sel.value; }));
    }
    m.inputs.cliente_id.addEventListener('change', z);
    z();
  }
})();
