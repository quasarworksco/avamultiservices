/* Panel CRM — Clientes › Contactos: agenda de personas que aún no son clientes (contactos del teléfono, CSV).
   Sirve para reconocer quién llama o escribe, buscar, escribir por WhatsApp o llamar, y pasar a cliente cuando contrata. */
(function () {
  'use strict';
  var A = window.AVA, el = A.el, sb = A.sb;
  var PAGINA = 60;
  // Números de AVA: no se importan como contactos
  var PROPIOS = ['7868162430', '9452072371'];
  // Etiquetas automáticas según lo que dice el nombre del contacto
  var PALABRAS = [[/\bTPS\b/i, 'TPS'], [/\bEAD\b|permiso de trabajo/i, 'Permiso de trabajo'], [/licencia/i, 'Licencia'], [/\bCBP\b/i, 'CBP One'], [/\bLLC\b/i, 'LLC'],
    [/\btax(es)?\b|\bIRS\b|impuesto/i, 'Taxes'], [/insurance|seguro/i, 'Seguros'], [/asilo|asylum/i, 'Asilo'], [/cr[eé]dito|credit/i, 'Crédito'], [/notar/i, 'Notaría']];

  function dig10(t) { var d = String(t || '').replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d.slice(-10); }
  function bonito(t) { var d = dig10(t); return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : (t || ''); }
  function etiquetasDe(nombre) { return PALABRAS.filter(function (p) { return p[0].test(nombre); }).map(function (p) { return p[1]; }); }

  A.pestanasClientes = function (activa) {
    return el('div', { class: 'tabs', role: 'tablist', style: 'margin-top:16px' }, [['clientes', 'Clientes', 'i-users'], ['contactos', 'Contactos', 'i-phone']].map(function (t) {
      return el('a', { class: 'tab' + (t[0] === activa ? ' on' : ''), role: 'tab', 'aria-selected': String(t[0] === activa), href: '#/' + t[0] }, [A.icon(t[2], 'icon-sm'), el('span', { text: t[1] })]);
    }));
  };
  // Para reconocer quién llama: busca primero en clientes y después en contactos
  A.contactoPorTelefono = async function (tel) {
    var d = dig10(tel);
    if (d.length !== 10) return null;
    var r = await sb.from('contactos').select('id,nombre,telefono,cliente_id').eq('tel_digitos', d).maybeSingle();
    return r.data || null;
  };

  var st = { q: '', tag: '', desde: 0 };
  A.vista('contactos', {
    permiso: 'clientes',
    render: function (cont) {
      st = { q: '', tag: '', desde: 0 };
      cont.appendChild(A.cabecera('Tu agenda', 'Contactos', 'de AVA', [
        el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: importar }, [A.icon('i-upload'), el('span', { text: 'Importar CSV' })]),
        el('button', { class: 'btn btn-dark btn-sm', type: 'button', onclick: function () { editar(null); } }, [A.icon('i-plus'), el('span', { text: 'Nuevo contacto' })])
      ]));
      cont.appendChild(A.pestanasClientes('contactos'));
      cont.appendChild(el('div', { class: 'alert ok', style: 'margin-top:14px' }, [A.icon('i-sparkles', 'icon-sm'),
        'Personas de tu agenda que aún no son clientes. Cuando una llama, el CRM muestra su nombre. Si contrata, tócala y elige «Pasar a cliente».']));
      ui.stats = el('div', { class: 'stats' });
      ui.q = el('input', { class: 'input sm', type: 'search', placeholder: 'Buscar por nombre o teléfono', oninput: function () { clearTimeout(ui.t); ui.t = setTimeout(function () { st.q = ui.q.value.trim(); st.desde = 0; cargar(); }, 250); } });
      ui.tags = el('div', { class: 'chips ctc-tags' });
      ui.list = el('div', { class: 'list' }, [el('div', { class: 'empty', text: 'Cargando…' })]);
      ui.mas = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', hidden: true, style: 'margin:14px auto 0;display:flex', onclick: function () { st.desde += PAGINA; cargar(true); } }, [el('span', { text: 'Ver más' })]);
      cont.append(ui.stats, el('div', { class: 'tools' }, [ui.q]), ui.tags, ui.list, ui.mas);
      resumen(); cargar();
    }
  });
  var ui = {};

  async function resumen() {
    var r = await Promise.all([
      sb.from('contactos').select('id', { count: 'exact', head: true }),
      sb.from('contactos').select('id', { count: 'exact', head: true }).not('cliente_id', 'is', null),
      sb.rpc('contactos_etiquetas')
    ]);
    ui.stats.innerHTML = '';
    [[r[0].count || 0, 'Contactos'], [r[1].count || 0, 'Ya son clientes']].forEach(function (s) { ui.stats.appendChild(el('div', { class: 'stat' }, [el('div', { class: 'k', text: (s[0]).toLocaleString('es-US') }), el('div', { class: 'l', text: s[1] })])); });
    ui.tags.innerHTML = '';
    (r[2].data || []).forEach(function (x) {
      var t = x.etiqueta;
      ui.tags.appendChild(el('button', { type: 'button', class: 'chip-s' + (st.tag === t ? ' on' : ''), text: t + ' · ' + Number(x.n).toLocaleString('es-US'), onclick: function () { st.tag = st.tag === t ? '' : t; st.desde = 0; resumen(); cargar(); } }));
    });
  }

  async function cargar(agregar) {
    var q = sb.from('contactos').select('*, clientes(id,nombre,apellidos)').order('nombre').range(st.desde, st.desde + PAGINA - 1);
    if (st.tag) q = q.contains('etiquetas', [st.tag]);
    if (st.q) {
      var d = st.q.replace(/\D/g, '');
      var p = '%' + st.q.replace(/[%_,()]/g, ' ').trim() + '%';
      q = d.length >= 3 && d.length === st.q.replace(/[\s()+-]/g, '').length ? q.like('tel_digitos', '%' + d + '%') : q.ilike('nombre', p);
    }
    var r = await q;
    if (!agregar) ui.list.innerHTML = '';
    if (r.error) { ui.list.appendChild(el('div', { class: 'empty', text: 'No se pudieron cargar los contactos.' })); return; }
    if (!agregar && !r.data.length) {
      ui.list.appendChild(el('div', { class: 'empty' }, st.q || st.tag ? ['Sin resultados.'] : [el('b', { text: 'Tu agenda está vacía' }), 'Toca «Importar CSV» y sube el archivo de contactos de tu teléfono.']));
    }
    r.data.forEach(function (c) { ui.list.appendChild(fila(c)); });
    ui.mas.hidden = r.data.length < PAGINA;
  }

  function fila(c) {
    var tel = dig10(c.telefono);
    return el('div', { class: 'row ctc' }, [
      el('button', { type: 'button', class: 'who-cell ctc-who', onclick: function () { editar(c); } }, [el('span', { class: 'avatar', text: A.iniciales(c.nombre) }), el('div', null, [el('div', { class: 'name', text: c.nombre }),
        el('div', { class: 'muted', text: [bonito(c.telefono), c.telefono2 ? bonito(c.telefono2) : ''].filter(Boolean).join(' · ') })])]),
      el('span', { class: 'hide-m' }, [(c.etiquetas || []).length ? el('span', { class: 'chips' }, c.etiquetas.slice(0, 3).map(function (t) { return el('span', { class: 'chip-s', text: t }); })) : null]),
      el('span', { class: 'ctc-acc' }, [
        c.clientes ? el('a', { class: 'mini-btn', href: '#/clientes/' + c.clientes.id, text: 'Ver cliente' }) : el('button', { class: 'mini-btn', type: 'button', text: 'Pasar a cliente', onclick: function () { aCliente(c); } }),
        tel.length === 10 ? el('a', { class: 'icon-btn sm', href: A.wa(tel, ''), target: '_blank', rel: 'noopener', title: 'WhatsApp', 'aria-label': 'WhatsApp a ' + c.nombre }, [A.icon('i-whatsapp', 'icon-sm')]) : null,
        tel.length === 10 && A.puede('llamadas') ? el('a', { class: 'icon-btn sm', href: '#/llamadas/numero/' + tel, title: 'Llamar', 'aria-label': 'Llamar a ' + c.nombre }, [A.icon('i-phone', 'icon-sm')]) : null
      ])
    ]);
  }

  function editar(c) {
    var nuevo = !c; c = c || {};
    A.modal({
      titulo: nuevo ? 'Nuevo contacto' : c.nombre, ok: 'Guardar',
      campos: [
        { k: 'nombre', label: 'Nombre', required: true, full: true, value: c.nombre, max: 160 },
        { k: 'telefono', label: 'Teléfono', type: 'tel', value: c.telefono, max: 40 },
        { k: 'telefono2', label: 'Teléfono 2', type: 'tel', value: c.telefono2, max: 40 },
        { k: 'email', label: 'Correo', type: 'email', full: true, value: c.email, max: 200 },
        { k: 'etiquetas', label: 'Etiquetas (separadas por coma)', full: true, value: (c.etiquetas || []).join(', ') },
        { k: 'notas', label: 'Notas', type: 'textarea', full: true, value: c.notas, max: 4000 }
      ],
      guardar: async function (d, aviso) {
        d.etiquetas = d.etiquetas ? d.etiquetas.split(',').map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 20) : [];
        if (nuevo) d.origen = 'manual';
        d.updated_at = new Date().toISOString();
        var r = nuevo ? await sb.from('contactos').insert(d) : await sb.from('contactos').update(d).eq('id', c.id);
        if (r.error) { A.msg(aviso, /duplicate|unique/i.test(r.error.message) ? 'Ya hay un contacto con ese teléfono.' : 'No se pudo guardar.'); return false; }
        A.toast('Contacto guardado.'); resumen(); cargar();
      },
      borrar: nuevo ? null : async function () {
        var r = await sb.from('contactos').delete().eq('id', c.id);
        if (r.error) { A.toast('No se pudo eliminar.', 'error'); return false; }
        A.toast('Contacto eliminado.'); resumen(); cargar();
      },
      borrarConfirm: '¿Eliminar a ' + c.nombre + ' de tus contactos?'
    });
  }

  async function aCliente(c) {
    var dup = await A.buscarDuplicado(c.email, c.telefono);
    if (dup) {
      if (!confirm('Ya existe un cliente con ese teléfono: ' + A.nombreDe(dup) + '. ¿Ligar el contacto a esa ficha?')) return;
      await sb.from('contactos').update({ cliente_id: dup.id }).eq('id', c.id);
      A.ir('clientes/' + dup.id); return;
    }
    // El nombre del teléfono puede traer notas («Ana - LICENCIA»): se limpia para la ficha
    var limpio = c.nombre.replace(/\s+-\s+.*$/, '').replace(/[^\p{L}\s'.-]/gu, ' ').replace(/\s+/g, ' ').trim() || c.nombre;
    var partes = limpio.split(' ');
    A.modal({
      titulo: 'Pasar a cliente', ok: 'Crear cliente',
      campos: [
        { k: 'nombre', label: 'Nombre', required: true, value: partes[0], max: 120 },
        { k: 'apellidos', label: 'Apellidos', value: partes.slice(1).join(' '), max: 120 },
        { k: 'telefono', label: 'Teléfono', type: 'tel', value: bonito(c.telefono), max: 40 },
        { k: 'email', label: 'Correo', type: 'email', value: c.email, max: 200 }
      ],
      extra: el('p', { class: 'muted', style: 'margin-top:10px;font-size:12.5px', text: 'Sus etiquetas y notas pasan a la ficha. El contacto queda ligado al cliente.' }),
      guardar: async function (d, aviso) {
        d.origen = 'otro'; d.etiquetas = c.etiquetas || []; d.notas = [c.notas, c.telefono2 ? 'Otro teléfono: ' + bonito(c.telefono2) : '', 'Nombre en el teléfono: ' + c.nombre].filter(Boolean).join('\n');
        var r = await A.nuevoClienteBD(d).select('id').single();
        if (r.error) { A.msg(aviso, 'No se pudo crear el cliente.'); return false; }
        await sb.from('contactos').update({ cliente_id: r.data.id }).eq('id', c.id);
        A.toast('Cliente creado.'); A.ir('clientes/' + r.data.id);
      }
    });
  }

  /* ---------- Importar CSV ---------- */
  // Lector de CSV con comillas y saltos de línea dentro de los campos
  function leerCSV(texto) {
    texto = texto.replace(/^﻿/, '');
    var sep = (texto.split('\n')[0].match(/;/g) || []).length > (texto.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    var filas = [], fila = [], campo = '', comillas = false;
    for (var i = 0; i < texto.length; i++) {
      var ch = texto[i];
      if (comillas) {
        if (ch === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else comillas = false; } else campo += ch;
      } else if (ch === '"') comillas = true;
      else if (ch === sep) { fila.push(campo); campo = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && texto[i + 1] === '\n') i++; fila.push(campo); campo = ''; if (fila.some(function (x) { return x.trim(); })) filas.push(fila); fila = []; }
      else campo += ch;
    }
    fila.push(campo); if (fila.some(function (x) { return x.trim(); })) filas.push(fila);
    return filas;
  }
  // Reconoce las columnas de AVA, Google Contacts y iPhone
  function columnas(cab) {
    var n = cab.map(function (h) { return String(h).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); });
    function busca(re, excepto) { for (var i = 0; i < n.length; i++) if (re.test(n[i]) && i !== excepto) return i; return -1; }
    var c = {};
    c.nombre = busca(/^(nombre|name|nombre completo|full name|display name)$/);
    c.pila = busca(/^(first name|given name|nombre de pila)$/);
    c.apellido = busca(/^(last name|family name|apellidos?)$/);
    c.tel = busca(/^(telefono|phone|celular|mobile|movil|phone 1 - value|telefono 1)$/);
    c.tel2 = busca(/^(telefono 2|phone 2|phone 2 - value|otro telefono)$/, c.tel);
    c.email = busca(/^(correo|email|e-mail|e-mail 1 - value|correo electronico)$/);
    return c;
  }

  function importar() {
    var input = el('input', { type: 'file', accept: '.csv,text/csv' });
    var etiqueta = el('input', { class: 'input sm', placeholder: 'Por ejemplo: Teléfono de Ana', maxlength: 40 });
    var previa = el('div', { class: 'ctc-imp' });
    var listos = null;
    var m = A.modal({
      titulo: 'Importar contactos', ok: 'Importar',
      campos: [],
      extra: el('div', null, [
        el('p', { class: 'muted', style: 'font-size:13px;margin-bottom:12px', text: 'Sube un archivo CSV con columnas como Nombre, Teléfono, Teléfono 2 y Correo (también sirve el de Google Contacts). Los números repetidos o que ya existen no se duplican.' }),
        el('div', { class: 'field' }, [el('label', { text: 'Archivo CSV' }), input]),
        el('div', { class: 'field', style: 'margin-top:10px' }, [el('label', { text: 'Etiqueta para todos (opcional)' }), etiqueta]),
        previa
      ]),
      guardar: async function (_, aviso) {
        if (!listos || !listos.nuevos.length) { A.msg(aviso, listos ? 'No hay contactos nuevos para importar.' : 'Elige el archivo CSV.'); return false; }
        var extra = etiqueta.value.trim();
        var filas = listos.nuevos.map(function (x) { var e = x.etiquetas.slice(); if (extra && e.indexOf(extra) === -1) e.push(extra); return Object.assign({}, x, { etiquetas: e.slice(0, 20) }); });
        var barra = el('i'), txt = el('span', { class: 'muted', style: 'font-size:12.5px' });
        previa.innerHTML = ''; previa.append(el('div', { class: 'cq-bar grande', style: 'max-width:none' }, [barra]), txt);
        var hechos = 0, fallos = 0;
        for (var i = 0; i < filas.length; i += 500) {
          var lote = filas.slice(i, i + 500);
          var r = await sb.from('contactos').insert(lote);
          if (r.error) {
            // Si un lote falla (por ejemplo, un número que ya entró), se reintenta uno por uno
            for (var j = 0; j < lote.length; j++) { var u = await sb.from('contactos').insert(lote[j]); if (u.error) fallos++; else hechos++; }
          } else hechos += lote.length;
          barra.style.width = Math.round((i + lote.length) / filas.length * 100) + '%';
          txt.textContent = 'Importando… ' + hechos.toLocaleString('es-US') + ' de ' + filas.length.toLocaleString('es-US');
        }
        A.toast(hechos.toLocaleString('es-US') + ' contactos importados' + (fallos ? ' · ' + fallos + ' no se pudieron' : '') + '.', fallos ? 'error' : '');
        st.desde = 0; resumen(); cargar();
      }
    });
    input.addEventListener('change', async function () {
      var f = input.files[0]; if (!f) return;
      previa.innerHTML = ''; previa.appendChild(el('p', { class: 'muted', text: 'Leyendo el archivo…' }));
      var filas = leerCSV(await f.text());
      var c = columnas(filas[0] || []);
      if (c.tel === -1 || (c.nombre === -1 && c.pila === -1)) { previa.innerHTML = ''; previa.appendChild(el('div', { class: 'alert warn' }, [A.icon('i-alert', 'icon-sm'), 'No encontré las columnas de nombre y teléfono. La primera fila debe decir, por ejemplo: Nombre, Teléfono.'])); listos = null; return; }
      // Números que ya están en contactos o en clientes
      var existe = {}, ligar = {};
      for (var desde = 0; ; desde += 1000) {
        var r = await sb.from('contactos').select('tel_digitos').range(desde, desde + 999);
        (r.data || []).forEach(function (x) { existe[x.tel_digitos] = 1; });
        if (!r.data || r.data.length < 1000) break;
      }
      (await A.clientesBasicos()).forEach(function (x) { var d = dig10(x.telefono); if (d.length === 10) ligar[d] = x.id; });
      var res = { nuevos: [], repetidos: 0, sinTel: 0, propios: 0 }, vistos = {};
      filas.slice(1).forEach(function (x) {
        var nombre = (c.nombre >= 0 ? x[c.nombre] : [x[c.pila], x[c.apellido]].filter(Boolean).join(' ')) || '';
        nombre = nombre.trim().slice(0, 160);
        var tel = (x[c.tel] || '').split(/\s*:::\s*/)[0].trim(), d = dig10(tel);
        if (d.length !== 10) { res.sinTel++; return; }
        if (PROPIOS.indexOf(d) !== -1) { res.propios++; return; }
        if (existe[d] || vistos[d]) { res.repetidos++; return; }
        vistos[d] = 1;
        var tel2 = c.tel2 >= 0 ? (x[c.tel2] || '').trim() : '';
        res.nuevos.push({ nombre: nombre || bonito(tel), telefono: bonito(tel), telefono2: tel2 && dig10(tel2) !== d ? (dig10(tel2).length === 10 ? bonito(tel2) : tel2.slice(0, 40)) : null,
          email: c.email >= 0 && /@/.test(x[c.email] || '') ? x[c.email].trim().toLowerCase().slice(0, 200) : null, etiquetas: etiquetasDe(nombre), origen: 'csv', cliente_id: ligar[d] || null });
      });
      listos = res;
      var conTags = res.nuevos.filter(function (x) { return x.etiquetas.length; }).length;
      var ligados = res.nuevos.filter(function (x) { return x.cliente_id; }).length;
      previa.innerHTML = '';
      previa.appendChild(el('div', { class: 'ctc-res' }, [
        el('div', null, [el('b', { text: res.nuevos.length.toLocaleString('es-US') }), el('span', { text: 'contactos nuevos' })]),
        el('div', null, [el('b', { text: res.repetidos.toLocaleString('es-US') }), el('span', { text: 'ya estaban' })]),
        el('div', null, [el('b', { text: (res.sinTel + res.propios).toLocaleString('es-US') }), el('span', { text: 'sin teléfono válido o de AVA' })])
      ]));
      previa.appendChild(el('p', { class: 'muted', style: 'font-size:12.5px;margin-top:8px', text: conTags + ' reciben etiquetas automáticas por lo que dice su nombre (TPS, Licencia, LLC, Taxes…)' + (ligados ? ' · ' + ligados + ' se ligan a clientes que ya tienes' : '') + '. Ejemplos: ' + res.nuevos.slice(0, 3).map(function (x) { return x.nombre; }).join(', ') + '.' }));
    });
  }
})();
