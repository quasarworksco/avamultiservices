/* AVA Multiservices — Formularios creados desde el CRM (avamultiservices.com/f/?s=nombre-del-formulario)
   La definición se lee con formulario_publico y la respuesta se guarda con enviar_formulario.
   Los archivos se suben a una carpeta privada; solo el equipo de AVA puede verlos desde el panel.
   Con ?vista=1 dentro del editor del CRM, el formulario se dibuja con lo que manda el editor y no se envía. */
(function () {
  'use strict';

  var CONFIG = {
    supabaseUrl: 'https://szmkcwtkorsndvmxywai.supabase.co',
    supabaseKey: 'sb_publishable_Ri5Pcd0a9dphA8W5qJ2YvQ_veqm7I26',
    bucket: 'documentos',
    maxBytes: 10 * 1024 * 1024,
    maxArchivos: 5,
    avisoEmail: 'anavargas@avamultiservices.com',
    panelUrl: 'https://avamultiservices.com/admin/#/respuestas'
  };

  var card = document.getElementById('f-card');
  if (!card) return;
  var params = new URLSearchParams(location.search);
  var slug = (params.get('s') || '').trim().toLowerCase();
  var vista = params.get('vista') === '1';
  var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var envio = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); });
  var def = null, form = null, subiendo = 0, archivos = {}, firmas = {};

  function headers(extra) {
    var h = { apikey: CONFIG.supabaseKey, Authorization: 'Bearer ' + CONFIG.supabaseKey };
    for (var k in extra) h[k] = extra[k];
    return h;
  }
  function rpc(nombre, cuerpo) {
    return fetch(CONFIG.supabaseUrl + '/rest/v1/rpc/' + nombre, { method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(cuerpo) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error((j && j.message) || 'Error'); return j; }); });
  }
  function h(tag, attrs, hijos) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'text') e.textContent = v; else if (k === 'html') e.innerHTML = v; else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
    });
    (hijos || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function icono(id, cls) { return h('span', { html: '<svg class="icon ' + (cls || '') + '"><use href="#' + id + '"/></svg>' }).firstChild; }
  function tamano(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }

  /* ---------- Cargar ---------- */
  function error(titulo, texto) {
    card.innerHTML = '';
    card.appendChild(h('div', { class: 'f-ok' }, [h('h2', { text: titulo }), h('p', { text: texto }),
      h('a', { class: 'btn btn-primary', href: 'https://wa.me/17868162430', target: '_blank', rel: 'noopener' }, [icono('i-whatsapp', 'icon-fill'), h('span', { text: 'Escríbenos por WhatsApp' })])]));
  }
  if (vista) {
    window.addEventListener('message', function (e) {
      if (e.origin !== location.origin || !e.data || e.data.tipo !== 'ava-form') return;
      def = e.data.def; dibujar();
    });
    if (window.parent !== window) window.parent.postMessage({ tipo: 'ava-form-listo' }, location.origin);
  } else if (!slug) {
    error('Formulario no encontrado', 'Revisa el enlace que te compartimos o escríbenos y te lo enviamos de nuevo.');
  } else {
    rpc('formulario_publico', { p_slug: slug }).then(function (d) {
      if (!d) { error('Este formulario no está disponible', 'Puede que ya no esté activo. Escríbenos y te ayudamos.'); return; }
      def = d; document.title = d.titulo + ' | AVA Multiservices'; dibujar();
    }).catch(function () { error('No pudimos cargar el formulario', 'Revisa tu conexión e inténtalo de nuevo, o escríbenos por WhatsApp.'); });
  }

  /* ---------- Dibujar ---------- */
  var ANCHO = { texto: 1, telefono: 1, email: 1, fecha: 1, numero: 1, sensible: 1, lista: 1 };
  function dibujar() {
    archivos = {}; firmas = {};
    card.innerHTML = '';
    if (vista) card.appendChild(h('div', { class: 'f-vista', text: 'Vista previa · así lo verán tus clientes (no se envía)' }));
    card.appendChild(h('div', { class: 'f-head' }, [
      h('img', { class: 'logo', src: '../assets/img/logo.svg', alt: 'AVA', width: '128', height: '61' }),
      h('div', { class: 'logo-sub', text: 'Multiservices' }),
      h('div', { class: 'kicker', text: 'Formulario' }),
      h('h1', { text: def.titulo || 'Formulario' }),
      def.descripcion ? h('p', { text: def.descripcion }) : null,
      h('span', { class: 'f-secure' }, [icono('i-lock', 'icon-sm'), 'Información confidencial'])
    ]));
    form = h('form', { class: 'f-body', novalidate: true });
    form.appendChild(h('div', { class: 'honey', 'aria-hidden': 'true' }, [h('label', null, ['No llenar ', h('input', { type: 'text', name: '_honey', tabindex: '-1', autocomplete: 'off' })])]));

    // Agrupa los campos en secciones (cada «Sección» abre una nueva)
    var secciones = [], actual = null;
    (def.campos || []).forEach(function (c) {
      if (c.tipo === 'seccion') { actual = { c: c, campos: [] }; secciones.push(actual); return; }
      if (!actual) { actual = { c: null, campos: [] }; secciones.push(actual); }
      actual.campos.push(c);
    });
    var numerar = secciones.filter(function (s) { return s.c; }).length > 1;
    var n = 0;
    secciones.forEach(function (s) {
      var sec = h('section', { class: 'f-sec' });
      if (s.c) { n++; sec.appendChild(h('div', { class: 'f-sec-h' }, [numerar ? h('span', { class: 'n', text: String(n) }) : null, h('div', null, [h('h2', { text: s.c.etiqueta || '' }), s.c.ayuda ? h('p', { text: s.c.ayuda }) : null])])); }
      var grid = h('div', { class: 'grid' });
      s.campos.forEach(function (c) { grid.appendChild(campo(c)); });
      sec.appendChild(grid);
      form.appendChild(sec);
    });
    if (!(def.campos || []).length) form.appendChild(h('p', { class: 'f-legal', text: 'Este formulario todavía no tiene preguntas.' }));

    var btn = h('button', { class: 'btn btn-primary', type: 'submit' }, [h('span', { class: 'btn-label', text: 'Enviar' }), icono('i-send', 'icon-sm arrow'), h('span', { class: 'spinner', 'aria-hidden': 'true' })]);
    var estado = h('div', { class: 'f-status', role: 'status', 'aria-live': 'polite' });
    form.appendChild(h('div', { class: 'f-submit' }, [btn, estado,
      h('p', { class: 'f-legal' }, [icono('i-lock', 'icon-sm'), ' Tus datos y documentos se guardan cifrados en un sistema privado y solo los ve el equipo de AVA Multiservices.'])]));
    form.addEventListener('submit', function (e) { e.preventDefault(); enviar(btn, estado); });
    card.appendChild(form);
    Object.keys(firmas).forEach(function (k) { firmas[k].ajustar(); });
  }

  function campo(c) {
    var full = !ANCHO[c.tipo];
    var f = h('div', { class: 'field' + (full ? ' full' : ''), 'data-id': c.id, 'data-tipo': c.tipo });
    var id = 'c-' + c.id;
    var req = c.requerido ? ' *' : '';
    var etiqueta = function (forId) { return h('label', { for: forId, text: (c.etiqueta || 'Pregunta') + req }); };
    var ayuda = c.ayuda ? h('span', { class: 'hint', text: c.ayuda }) : null;
    var err = h('span', { class: 'err', text: 'Este dato es obligatorio.' });
    var opciones = (c.opciones || []).filter(Boolean);
    switch (c.tipo) {
      case 'parrafo':
        f.append(etiqueta(id), ayuda || '', h('textarea', { class: 'input', id: id, name: c.id, maxlength: '4000', rows: '4' }), err); break;
      case 'lista':
        f.append(etiqueta(id), ayuda || '', h('select', { class: 'input', id: id, name: c.id }, [h('option', { value: '', text: 'Elige una opción' })].concat(opciones.map(function (o) { return h('option', { value: o, text: o }); }))), err); break;
      case 'opciones': case 'multiple': case 'si_no': {
        var lista = c.tipo === 'si_no' ? ['Sí', 'No'] : opciones;
        var tipoInput = c.tipo === 'multiple' ? 'checkbox' : 'radio';
        f.append(h('div', { class: 'field-legend', text: (c.etiqueta || 'Pregunta') + req }), ayuda || '',
          h('div', { class: 'chips' + (c.tipo === 'multiple' ? ' chip-multi' : '') }, lista.map(function (o, i) {
            var oid = id + '-' + i;
            return h('span', null, [h('input', { class: 'chip-input', type: tipoInput, id: oid, name: c.id, value: o }), h('label', { class: 'chip', for: oid, text: o })]);
          })), err);
        break;
      }
      case 'acepto':
        f.className = 'field full consent-box';
        f.append(h('label', { class: 'consent' }, [h('input', { type: 'checkbox', id: id, name: c.id, value: 'Sí' }), h('span', { text: (c.etiqueta || 'Acepto') + req })]), ayuda || '', h('span', { class: 'err', text: 'Necesitamos que marques esta casilla para continuar.' }));
        break;
      case 'archivo': f.append(etiqueta(id), ayuda || '', subida(c, id), err); break;
      case 'firma': f.append(h('div', { class: 'field-legend', text: (c.etiqueta || 'Firma') + req }), ayuda || '', firma(c), h('span', { class: 'err', text: 'Firma con tu dedo o con el mouse.' })); break;
      case 'sensible':
        f.append(etiqueta(id), ayuda || '', h('div', { class: 'ssn-wrap' }, [
          h('input', { class: 'input', id: id, name: c.id, type: 'password', inputmode: 'numeric', autocomplete: 'off', maxlength: '11', placeholder: '•••-••-••••' }),
          h('button', { class: 'ssn-toggle', type: 'button', 'aria-label': 'Mostrar u ocultar', onclick: function () { var i = document.getElementById(id); i.type = i.type === 'password' ? 'text' : 'password'; } }, [icono('i-eye', 'icon-sm')])
        ]), h('span', { class: 'err', text: 'Escribe los 9 dígitos.' }));
        break;
      default: {
        var tipo = { telefono: 'tel', email: 'email', fecha: 'date', numero: 'number' }[c.tipo] || 'text';
        var auto = { nombre: 'given-name', apellidos: 'family-name', telefono: 'tel', email: 'email' }[c.mapa] || (c.tipo === 'telefono' ? 'tel' : c.tipo === 'email' ? 'email' : 'off');
        f.append(etiqueta(id), ayuda || '', h('input', { class: 'input', id: id, name: c.id, type: tipo, autocomplete: auto, maxlength: '300', inputmode: c.tipo === 'telefono' ? 'tel' : null, placeholder: c.tipo === 'telefono' ? '(214) 555-0123' : null }),
          h('span', { class: 'err', text: c.tipo === 'email' ? 'Escribe un correo válido.' : c.tipo === 'telefono' ? 'Escribe un teléfono de 10 dígitos.' : 'Este dato es obligatorio.' }));
      }
    }
    f.addEventListener('input', function () { f.classList.remove('invalid'); });
    f.addEventListener('change', function () { f.classList.remove('invalid'); });
    return f;
  }

  /* ---------- Archivos ---------- */
  function subida(c, id) {
    archivos[c.id] = [];
    var cont = h('div');
    var lista = h('div', { class: 'f-files' });
    var input = h('input', { type: 'file', id: id, multiple: true, accept: 'image/*,.pdf,.heic,.doc,.docx', 'aria-label': c.etiqueta || 'Subir archivo' });
    var drop = h('div', { class: 'drop' }, [input, h('span', { class: 'd-ico' }, [icono('i-upload', 'icon-lg')]),
      h('span', { class: 'd-txt' }, [h('span', { class: 'd-t', text: 'Subir archivos' }), h('span', { class: 'd-s', text: 'Fotos o PDF · hasta 10 MB cada uno' })]),
      h('span', { class: 'd-cta', text: 'Elegir archivo' })]);
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function () { drop.classList.add('drag'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function () { drop.classList.remove('drag'); }); });
    input.addEventListener('change', function () {
      Array.prototype.forEach.call(input.files, function (file) {
        if (archivos[c.id].length >= CONFIG.maxArchivos) return;
        var item = { campo: c.id, nombre: file.name, tipo: file.type || 'application/octet-stream', tam: file.size, estado: 'subiendo' };
        archivos[c.id].push(item);
        var bar = h('i'), s = h('span', { class: 's', text: tamano(file.size) });
        var fila = h('div', { class: 'f-file' }, [icono('i-file', 'icon-sm'), h('span', { class: 'n', text: file.name }), s, h('span', { class: 'bar' }, [bar]),
          h('button', { type: 'button', 'aria-label': 'Quitar ' + file.name, onclick: function () { archivos[c.id].splice(archivos[c.id].indexOf(item), 1); fila.remove(); } }, [icono('i-x', 'icon-sm')])]);
        lista.appendChild(fila);
        if (file.size > CONFIG.maxBytes) { item.estado = 'error'; s.textContent = 'Pesa más de 10 MB'; s.className = 's bad'; return; }
        if (vista) { item.estado = 'listo'; bar.style.width = '100%'; s.textContent = 'Vista previa'; return; }
        subir(file, item, bar, s);
      });
      input.value = '';
    });
    cont.append(drop, lista);
    return cont;
  }
  function extension(f) { var m = /\.([a-z0-9]{1,5})$/i.exec(f.name || ''); return m ? m[1].toLowerCase() : ((f.type || '').split('/')[1] || 'bin').replace(/[^a-z0-9]/g, '').slice(0, 5); }
  function subir(blob, item, bar, s) {
    subiendo++;
    var path = 'formularios/' + def.id + '/' + envio + '/' + item.campo + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) + '.' + extension(blob);
    var xhr = new XMLHttpRequest();
    xhr.open('POST', CONFIG.supabaseUrl + '/storage/v1/object/' + CONFIG.bucket + '/' + path);
    var hd = headers({ 'Content-Type': item.tipo, 'x-upsert': 'false' });
    for (var k in hd) xhr.setRequestHeader(k, hd[k]);
    xhr.upload.addEventListener('progress', function (e) { if (e.lengthComputable && bar) bar.style.width = Math.round(e.loaded / e.total * 100) + '%'; });
    return new Promise(function (resolve) {
      xhr.onload = function () {
        subiendo--;
        if (xhr.status >= 200 && xhr.status < 300) { item.path = path; item.estado = 'listo'; if (s) { s.textContent = 'Subido'; s.className = 's ok'; } if (bar) bar.style.width = '100%'; }
        else { item.estado = 'error'; if (s) { s.textContent = 'No se pudo subir'; s.className = 's bad'; } }
        resolve();
      };
      xhr.onerror = function () { subiendo--; item.estado = 'error'; if (s) { s.textContent = 'Sin conexión'; s.className = 's bad'; } resolve(); };
      xhr.send(blob);
    });
  }

  /* ---------- Firma con el dedo ---------- */
  function firma(c) {
    var canvas = h('canvas', { 'aria-label': 'Espacio para firmar' });
    var box = h('div', { class: 'firma-box' }, [canvas, h('span', { class: 'lin' }), h('span', { class: 'ph', text: 'Firma aquí con tu dedo o con el mouse' })]);
    var ctx = canvas.getContext('2d'), dibujando = false, trazos = 0;
    function ajustar() {
      var r = canvas.getBoundingClientRect(); if (!r.width) return;
      var k = window.devicePixelRatio || 1;
      canvas.width = r.width * k; canvas.height = r.height * k;
      ctx.setTransform(k, 0, 0, k, 0, 0); ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1b1b1a';
      trazos = 0; box.classList.remove('firmado');
    }
    function pos(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    canvas.addEventListener('pointerdown', function (e) { dibujando = true; canvas.setPointerCapture(e.pointerId); var p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); });
    canvas.addEventListener('pointermove', function (e) { if (!dibujando) return; var p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); trazos++; if (trazos > 4) { box.classList.add('firmado'); box.closest('.field').classList.remove('invalid'); } });
    ['pointerup', 'pointercancel'].forEach(function (ev) { canvas.addEventListener(ev, function () { dibujando = false; }); });
    firmas[c.id] = { ajustar: ajustar, lista: function () { return trazos > 4; }, blob: function () { return new Promise(function (r) { canvas.toBlob(r, 'image/png'); }); } };
    var cont = h('div', null, [box, h('button', { type: 'button', class: 'firma-limpiar', text: 'Borrar y firmar de nuevo', onclick: function () { ctx.clearRect(0, 0, canvas.width, canvas.height); trazos = 0; box.classList.remove('firmado'); } })]);
    setTimeout(ajustar, 0);
    return cont;
  }
  window.addEventListener('resize', function () { Object.keys(firmas).forEach(function (k) { if (!firmas[k].lista()) firmas[k].ajustar(); }); });

  /* ---------- Validar y enviar ---------- */
  function leer() {
    var datos = {}, primero = null;
    (def.campos || []).forEach(function (c) {
      if (c.tipo === 'seccion') return;
      var f = form.querySelector('[data-id="' + c.id + '"]');
      var v = null, ok = true;
      if (c.tipo === 'multiple') v = Array.prototype.map.call(form.querySelectorAll('[name="' + c.id + '"]:checked'), function (i) { return i.value; });
      else if (c.tipo === 'opciones' || c.tipo === 'si_no') { var x = form.querySelector('[name="' + c.id + '"]:checked'); v = x ? x.value : ''; }
      else if (c.tipo === 'acepto') v = form.querySelector('[name="' + c.id + '"]').checked;
      else if (c.tipo === 'archivo') { var l = archivos[c.id] || []; ok = !c.requerido || l.some(function (a) { return a.estado === 'listo'; }); }
      else if (c.tipo === 'firma') ok = !c.requerido || firmas[c.id].lista();
      else { var inp = form.querySelector('[name="' + c.id + '"]'); v = (inp.value || '').trim(); }
      if (c.tipo !== 'archivo' && c.tipo !== 'firma') {
        var vacio = v == null || v === '' || v === false || (Array.isArray(v) && !v.length);
        if (c.requerido && vacio) ok = false;
        if (!vacio && c.tipo === 'email' && !emailRe.test(v)) ok = false;
        if (!vacio && c.tipo === 'telefono' && v.replace(/\D/g, '').length < 10) ok = false;
        if (!vacio && c.tipo === 'sensible' && v.replace(/\D/g, '').length !== 9) ok = false;
        if (!vacio) datos[c.id] = c.tipo === 'sensible' ? v.replace(/\D/g, '') : v;
      }
      f.classList.toggle('invalid', !ok);
      if (!ok && !primero) primero = f;
    });
    return { datos: datos, primero: primero };
  }
  function avisar(datos) {
    var mapa = {};
    (def.campos || []).forEach(function (c) { if (c.mapa && datos[c.id]) mapa[c.mapa] = datos[c.id]; });
    var nombre = [mapa.nombre, mapa.apellidos].filter(Boolean).join(' ') || 'Sin nombre';
    return fetch('https://formsubmit.co/ajax/' + CONFIG.avisoEmail, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ _subject: 'Nueva respuesta: ' + def.titulo + ' · ' + nombre, _template: 'table', _captcha: 'false', Formulario: def.titulo, Cliente: nombre, Teléfono: mapa.telefono || '', Email: mapa.email || '', 'Ver en el panel': CONFIG.panelUrl })
    }).catch(function () { /* el aviso es opcional */ });
  }
  var enviando = false;
  function enviar(btn, estado) {
    if (enviando) return;
    function status(t, k) { estado.textContent = t; estado.className = 'f-status show ' + k; }
    if (form.querySelector('[name="_honey"]').value) return;
    var r = leer();
    if (r.primero) { status('Revisa los campos marcados en rojo.', 'error'); r.primero.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    var malos = Object.keys(archivos).some(function (k) { return archivos[k].some(function (a) { return a.estado === 'error'; }); });
    if (malos) { status('Uno de los archivos no se pudo subir. Quítalo y súbelo de nuevo.', 'error'); return; }
    if (vista) { status('Vista previa: todo está correcto. Así se enviaría.', 'info'); return; }
    enviando = true; btn.classList.add('loading'); btn.disabled = true;
    var fallar = function (msg) { enviando = false; btn.classList.remove('loading'); btn.disabled = false; status(msg || 'No pudimos enviar tu información. Revisa tu conexión e inténtalo de nuevo, o escríbenos por WhatsApp al (786) 816-2430.', 'error'); };
    status('Guardando tus firmas y documentos…', 'info');
    var firmasSubidas = Object.keys(firmas).filter(function (k) { return firmas[k].lista(); }).map(function (k) {
      var item = { campo: k, nombre: 'firma.png', tipo: 'image/png', tam: 0, estado: 'subiendo' };
      archivos[k] = [item];
      return firmas[k].blob().then(function (b) { item.tam = b.size; return subir(b, item); });
    });
    Promise.all(firmasSubidas).then(function () {
      return new Promise(function (ok) { (function esperar() { if (subiendo > 0) setTimeout(esperar, 300); else ok(); })(); });
    }).then(function () {
      var lista = [];
      Object.keys(archivos).forEach(function (k) { archivos[k].forEach(function (a) { if (a.estado === 'listo' && a.path) lista.push({ campo: a.campo, path: a.path, nombre: a.nombre, tipo: a.tipo, tam: a.tam }); else if (a.estado !== 'listo') throw new Error('archivo'); }); });
      status('Enviando tu información de forma segura…', 'info');
      return rpc('enviar_formulario', { p_slug: def.slug, p_envio: envio, p_datos: r.datos, p_archivos: lista });
    }).then(function () {
      return Promise.race([avisar(r.datos), new Promise(function (ok) { setTimeout(ok, 3500); })]);
    }).then(function () {
      card.innerHTML = '';
      card.appendChild(h('div', { class: 'f-ok' }, [
        h('div', { class: 'c', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' }),
        h('h2', { text: '¡Listo! Recibimos tu información' }),
        h('p', { text: def.mensaje_final || 'Gracias por confiar en AVA Multiservices. Revisaremos tus datos y te contactaremos muy pronto.' }),
        h('a', { class: 'btn btn-primary', href: 'https://wa.me/17868162430', target: '_blank', rel: 'noopener' }, [icono('i-whatsapp', 'icon-fill'), h('span', { text: 'Escríbenos por WhatsApp' })])
      ]));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }).catch(function (e) {
      var m = e && e.message;
      fallar(m && m !== 'Error' && m !== 'archivo' && !/fetch/i.test(m) ? m : null);
    });
  }
})();
