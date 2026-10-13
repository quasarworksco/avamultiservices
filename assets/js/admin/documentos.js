/* Panel CRM — Documentos privados de clientes (bucket "documentos", carpeta clientes/) */
(function () {
  'use strict';
  var A = window.AVA, el = A.el, sb = A.sb;
  var BUCKET = 'documentos';
  var MAX = 10 * 1024 * 1024;
  var TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'application/pdf'];

  function tamano(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  function limpio(n) { return n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '-').slice(-80); }

  A.abrirDocumento = async function (path) {
    var win = window.open('', '_blank');
    var r = await sb.storage.from(BUCKET).createSignedUrl(path, 120);
    if (r.error) { if (win) win.close(); A.toast('No se pudo abrir el documento.', 'error'); return; }
    if (win) win.location = r.data.signedUrl; else location.href = r.data.signedUrl;
  };

  async function subir(clienteId, archivos, alTerminar) {
    var ok = 0;
    for (var i = 0; i < archivos.length; i++) {
      var f = archivos[i];
      if (f.size > MAX) { A.toast(f.name + ': supera 10 MB.', 'error'); continue; }
      if (TIPOS.indexOf(f.type) === -1) { A.toast(f.name + ': solo imágenes o PDF.', 'error'); continue; }
      var path = 'clientes/' + clienteId + '/' + Date.now() + '-' + limpio(f.name);
      A.toast('Subiendo ' + f.name + '…');
      var up = await sb.storage.from(BUCKET).upload(path, f, { contentType: f.type, upsert: false });
      if (up.error) { A.toast('No se pudo subir ' + f.name + '.', 'error'); continue; }
      var ins = await sb.from('documentos').insert({ cliente_id: clienteId, nombre: f.name.slice(0, 200), path: path, tipo: f.type, tamano: f.size });
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

  function fila(d, alCambiar, conCliente) {
    return el('div', { class: 'doc' }, [
      el('span', { class: 'doc-n' }, [A.icon(d.tipo === 'application/pdf' ? 'i-file' : 'i-image', 'icon-sm'), el('span', null, [
        el('b', { text: d.nombre }),
        el('span', { class: 'muted', text: [conCliente && d.clientes ? A.nombreDe(d.clientes) : null, tamano(d.tamano || 0), A.fecha(d.created_at)].filter(Boolean).join(' · ') })
      ])]),
      el('span', { class: 'doc-a' }, [
        el('button', { class: 'btn btn-dark', type: 'button', text: 'Ver', onclick: function () { A.abrirDocumento(d.path); } }),
        el('button', { class: 'mini-btn', type: 'button', 'aria-label': 'Eliminar', onclick: function () { borrar(d, alCambiar); } }, [A.icon('i-trash', 'icon-sm')])
      ])
    ]);
  }

  function zona(clienteId, alTerminar) {
    var inp = el('input', { type: 'file', multiple: true, accept: 'image/*,application/pdf', hidden: true });
    var z = el('label', { class: 'drop' }, [inp, A.icon('i-upload'), el('span', null, [el('b', { text: 'Subir documentos' }), el('span', { class: 'muted', text: 'Arrastra aquí o toca para elegir · imágenes o PDF hasta 10 MB' })])]);
    inp.addEventListener('change', function () { if (inp.files.length) subir(clienteId, Array.prototype.slice.call(inp.files), alTerminar); inp.value = ''; });
    z.addEventListener('dragover', function (e) { e.preventDefault(); z.classList.add('over'); });
    z.addEventListener('dragleave', function () { z.classList.remove('over'); });
    z.addEventListener('drop', function (e) { e.preventDefault(); z.classList.remove('over'); subir(clienteId, Array.prototype.slice.call(e.dataTransfer.files), alTerminar); });
    return z;
  }

  /* Tarjeta para la ficha del cliente */
  A.tarjetaDocumentos = function (clienteId) {
    var card = el('div', { class: 'card' });
    async function pintar() {
      var r = await sb.from('documentos').select('*').eq('cliente_id', clienteId).order('created_at', { ascending: false });
      card.innerHTML = '';
      var lista = r.data || [];
      card.appendChild(el('h3', { class: 't', text: 'Documentos · ' + lista.length }));
      var box = el('div', { class: 'docs' });
      lista.forEach(function (d) { box.appendChild(fila(d, pintar)); });
      card.appendChild(box);
      card.appendChild(zona(clienteId, pintar));
    }
    pintar();
    return card;
  };

  var filtro = { q: '' };
  var ui = {};
  A.vista('documentos', {
    permiso: 'documentos',
    render: function (cont) {
      ui.list = el('div', { class: 'docs', style: 'margin-top:16px' });
      cont.appendChild(A.cabecera('Archivo privado', 'Documentos', 'de clientes', [
        el('button', { class: 'btn btn-dark btn-sm', onclick: elegirCliente }, [A.icon('i-upload'), el('span', { text: 'Subir documento' })])
      ]));
      cont.appendChild(el('p', { class: 'muted', style: 'margin-top:10px;max-width:640px', text: 'Los archivos se guardan de forma privada. Cada vez que abres uno se genera un enlace que caduca en 2 minutos.' }));
      cont.appendChild(el('div', { class: 'tools' }, [el('input', { class: 'input search', type: 'search', placeholder: 'Buscar por cliente o nombre de archivo', value: filtro.q, oninput: function () { filtro.q = this.value; pintar(); } })]));
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
    var vis = docs.filter(function (d) { return !q || (d.nombre + ' ' + A.nombreDe(d.clientes || {})).toLowerCase().indexOf(q) !== -1; });
    if (!vis.length) { ui.list.appendChild(el('div', { class: 'empty' }, docs.length ? ['Sin resultados.'] : [el('b', { text: 'Aún no hay documentos' }), 'Súbelos desde aquí o desde la ficha de cada cliente.'])); return; }
    vis.forEach(function (d) { ui.list.appendChild(fila(d, cargar, true)); });
  }

  async function elegirCliente() {
    var r = await sb.from('clientes').select('id,nombre,apellidos').order('nombre').limit(5000);
    if (!(r.data || []).length) { A.toast('Primero crea un cliente.', 'error'); return; }
    var m = A.modal({
      titulo: 'Subir documento', ok: 'Listo',
      campos: [{ k: 'cliente_id', label: 'Cliente', type: 'select', full: true, options: r.data.map(function (c) { return [c.id, A.nombreDe(c)]; }) }],
      guardar: function () { cargar(); }
    });
    var holder = el('div', { style: 'margin-top:14px' });
    m.inputs.cliente_id.closest('.grid2').after(holder);
    function z() { holder.innerHTML = ''; holder.appendChild(zona(m.inputs.cliente_id.value, function () { m.cerrar(); cargar(); })); }
    m.inputs.cliente_id.addEventListener('change', z);
    z();
  }
})();
