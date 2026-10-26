/* AVA Multiservices — Cuestionario por cliente (avamultiservices.com/cuestionario/?t=TOKEN)
   Cada cliente tiene su propio enlace: lo que escribe se guarda solo y puede volver después con el mismo enlace.
   Los datos se guardan con cuestionario_guardar; los sensibles (SSN, número A, pasaporte) nunca se devuelven completos.
   Los documentos se suben a una carpeta privada; solo el equipo de AVA puede verlos desde el panel. */
(function () {
  'use strict';

  var CONFIG = {
    supabaseUrl: 'https://szmkcwtkorsndvmxywai.supabase.co',
    supabaseKey: 'sb_publishable_Ri5Pcd0a9dphA8W5qJ2YvQ_veqm7I26',
    bucket: 'documentos',
    maxBytes: 15 * 1024 * 1024,
    avisoEmail: 'c4c439435576226a465fb1f7b87b6b02', // código de FormSubmit para info@avamultiservices.com (oculta el correo)
    panelUrl: 'https://avamultiservices.com/admin/#/cuestionarios',
    whatsapp: '17868162430'
  };

  var card = document.getElementById('f-card');
  if (!card) return;
  var token = (new URLSearchParams(location.search).get('t') || '').trim();
  var Q = window.AVA_CUESTIONARIOS || {}, U = Q.util;
  var def = null, st = { datos: {}, mask: {}, sens: {}, docs: [], pend: [], estado: 'borrador', paso: 0, enviado_at: null };
  var raiz = null, conds = [];

  /* ---------- Utilidades ---------- */
  function headers(extra) {
    var h = { apikey: CONFIG.supabaseKey, Authorization: 'Bearer ' + CONFIG.supabaseKey };
    for (var k in extra) h[k] = extra[k];
    return h;
  }
  function rpc(nombre, cuerpo, keepalive) {
    return fetch(CONFIG.supabaseUrl + '/rest/v1/rpc/' + nombre, { method: 'POST', keepalive: !!keepalive, headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(cuerpo) })
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
  var uid = 0;
  function nid() { return 'q' + (++uid); }
  function claveLocal() { return 'ava-q-paso-' + token.slice(0, 10); }

  function error(titulo, texto) {
    card.innerHTML = '';
    card.appendChild(h('div', { class: 'f-ok' }, [h('h2', { text: titulo }), h('p', { text: texto }),
      h('a', { class: 'btn btn-primary', href: 'https://wa.me/' + CONFIG.whatsapp, target: '_blank', rel: 'noopener' }, [icono('i-whatsapp', 'icon-fill'), h('span', { text: 'Escríbenos por WhatsApp' })])]));
  }

  /* ---------- Cargar ---------- */
  if (!token || !/^[a-f0-9]{20,64}$/i.test(token)) { error('Enlace no válido', 'Revisa el enlace que te compartimos o escríbenos y te lo enviamos de nuevo.'); return; }
  rpc('cuestionario_abrir', { p_token: token }).then(function (d) {
    if (!d) { error('Este enlace ya no está disponible', 'Escríbenos por WhatsApp y te ayudamos.'); return; }
    def = Q[d.tipo];
    if (!def) { error('No pudimos abrir el cuestionario', 'Escríbenos por WhatsApp y te ayudamos.'); return; }
    st.datos = d.datos || {}; st.mask = d.sensibles || {}; st.docs = d.documentos || []; st.pend = d.pendientes || [];
    st.estado = d.estado; st.enviado_at = d.enviado_at;
    try { st.paso = Math.min(def.pasos.length - 1, parseInt(localStorage.getItem(claveLocal()), 10) || 0); } catch (_) { st.paso = 0; }
    document.title = def.titulo + ' | AVA Multiservices';
    if (st.estado === 'enviado') dibujarEnviado(); else dibujar();
  }).catch(function () { error('No pudimos cargar el cuestionario', 'Revisa tu conexión e inténtalo de nuevo, o escríbenos por WhatsApp.'); });

  /* ---------- Guardar (solo, mientras escribe) ---------- */
  var tGuardar = null, guardando = null, otraVez = false, sucio = false, indicador = null;
  function marcarCambio() {
    sucio = true; pintarIndicador('Guardando…');
    clearTimeout(tGuardar); tGuardar = setTimeout(function () { guardar(false); }, 1400);
  }
  function pintarIndicador(t, ok) {
    if (!indicador) return;
    indicador.textContent = t; indicador.className = 'q-save' + (ok ? ' ok' : '') + (t.indexOf('No se') === 0 ? ' bad' : '');
  }
  function cuerpoGuardar(enviar) {
    return { p_token: token, p_datos: st.datos, p_sensibles: st.sens, p_documentos: st.docs, p_pendientes: st.pend, p_progreso: progreso(), p_nombre: def.nombre(st.datos) || null, p_enviar: !!enviar };
  }
  function guardar(enviar, keepalive) {
    clearTimeout(tGuardar);
    if (guardando && !enviar) { otraVez = true; return guardando; }
    var cuerpo = cuerpoGuardar(enviar);
    var enviados = st.sens; st.sens = {};
    sucio = false;
    var p = rpc('cuestionario_guardar', cuerpo, keepalive).then(function (r) {
      Object.keys(enviados).forEach(function (k) { if (enviados[k]) st.mask[k] = '•••• ' + String(enviados[k]).replace(/\s/g, '').slice(-4); else delete st.mask[k]; });
      pintarIndicador('Guardado ✓', true);
      return r;
    }, function (e) {
      // Si falla, los datos sensibles se vuelven a mandar en el siguiente intento
      Object.keys(enviados).forEach(function (k) { if (!(k in st.sens)) st.sens[k] = enviados[k]; });
      sucio = true; pintarIndicador('No se pudo guardar. Revisa tu conexión.');
      throw e;
    });
    guardando = p.then(function () { }, function () { }).then(function () { guardando = null; if (otraVez) { otraVez = false; guardar(false); } });
    return p;
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden && sucio && st.estado === 'borrador') guardar(false, true).catch(function () { }); });
  window.addEventListener('beforeunload', function (e) { if (sucio && st.estado === 'borrador') { guardar(false, true).catch(function () { }); e.preventDefault(); e.returnValue = ''; } });

  /* ---------- Progreso y validación ---------- */
  function camposPaso(p) { return (p.campos || []).filter(function (c) { return c.k && c.tipo !== 'grupo'; }); }
  function docsVisibles() {
    var l = [];
    def.pasos.forEach(function (p) { (p.documentos || []).forEach(function (g) { g.docs.forEach(function (d) { if (U.cumple(d.si, st.datos)) l.push(Object.assign({ corto: g.corto }, d)); }); }); });
    return l;
  }
  function tieneValor(c) { return c.tipo === 'sensible' ? !!(st.sens[c.k] || st.mask[c.k]) : !U.vacio(st.datos[c.k]); }
  function progreso() {
    var total = 0, listos = 0;
    def.pasos.forEach(function (p) {
      camposPaso(p).forEach(function (c) { if (!U.cumple(c.si, st.datos)) return; total++; if (tieneValor(c)) listos++; });
    });
    docsVisibles().forEach(function (d) { total++; if (subidos(d.k).length || st.pend.indexOf(d.k) !== -1) listos++; });
    return total ? Math.round(listos / total * 100) : 0;
  }
  function faltantes(p) {
    return camposPaso(p).filter(function (c) {
      if (!c.req || !U.cumple(c.si, st.datos)) return false;
      if (c.tipo === 'direccion') { var v = st.datos[c.k] || {}; return !v.calle || !v.ciudad; }
      return !tieneValor(c);
    });
  }
  function subidos(k) { return st.docs.filter(function (d) { return d.doc === k; }); }

  /* ---------- Dibujar ---------- */
  function cabecera(texto) {
    return h('div', { class: 'f-head' }, [
      h('img', { class: 'logo', src: '../assets/img/logo.svg', alt: 'AVA', width: '128', height: '61' }),
      h('div', { class: 'logo-sub', text: 'Multiservices' }),
      h('div', { class: 'kicker', text: def.subtitulo }),
      h('h1', { text: def.titulo }),
      h('p', { text: texto }),
      h('span', { class: 'f-secure' }, [icono('i-lock', 'icon-sm'), 'Información confidencial · se guarda sola'])
    ]);
  }

  function dibujar() {
    card.innerHTML = '';
    card.appendChild(cabecera('Llénenlo con calma desde el celular. Lo que escriben se guarda solo: pueden salir y volver con este mismo enlace cuando quieran.'));
    var pasos = h('nav', { class: 'q-steps', 'aria-label': 'Pasos' });
    def.pasos.forEach(function (p, i) {
      pasos.appendChild(h('button', { type: 'button', class: 'q-step' + (i === st.paso ? ' on' : '') + (i < st.paso ? ' done' : ''), 'aria-current': i === st.paso ? 'step' : null, onclick: function () { irA(i); } },
        [h('span', { class: 'n', text: String(i + 1) }), h('span', { class: 't', text: p.t })]));
    });
    card.appendChild(pasos);
    var barra = h('div', { class: 'q-bar' }, [h('i', { style: 'width:' + progreso() + '%' })]);
    card.appendChild(barra);
    raiz = h('div', { class: 'f-body q-body' });
    card.appendChild(raiz);
    pintarPaso();
    setTimeout(function () { var on = pasos.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' }); }, 30);
  }

  function irA(i) {
    if (sucio) guardar(false).catch(function () { });
    st.paso = i;
    try { localStorage.setItem(claveLocal(), String(i)); } catch (_) { /* */ }
    dibujar();
    window.scrollTo({ top: card.offsetTop - 70, behavior: 'smooth' });
  }

  function pintarPaso() {
    var p = def.pasos[st.paso];
    raiz.innerHTML = ''; conds = [];
    raiz.appendChild(h('div', { class: 'f-sec-h' }, [h('span', { class: 'n', text: String(st.paso + 1) }), h('div', null, [h('h2', { text: p.t }), h('p', { text: p.st })])]));
    if (p.campos) {
      var grid = h('div', { class: 'grid' });
      p.campos.forEach(function (c) { grid.appendChild(campo(c, st.datos)); });
      raiz.appendChild(grid);
      actualizarVisibles();
    } else if (p.documentos) raiz.appendChild(pasoDocumentos(false));
    else if (p.revisar) { pintarRevision(); return; }

    indicador = h('span', { class: 'q-save', text: 'Se guarda solo' });
    var aviso = h('div', { class: 'f-status', role: 'status', 'aria-live': 'polite' });
    raiz.appendChild(aviso);
    raiz.appendChild(h('div', { class: 'q-nav' }, [
      st.paso > 0 ? h('button', { type: 'button', class: 'btn btn-ghost', onclick: function () { irA(st.paso - 1); } }, [h('span', { text: 'Atrás' })]) : h('span'),
      indicador,
      h('button', { type: 'button', class: 'btn btn-primary', onclick: function () {
        var f = faltantes(p);
        raiz.querySelectorAll('.field.invalid').forEach(function (n) { n.classList.remove('invalid'); });
        if (f.length) {
          f.forEach(function (c) { var n = raiz.querySelector('[data-k="' + c.k + '"]'); if (n) n.classList.add('invalid'); });
          aviso.textContent = 'Falta: ' + f.map(function (c) { return c.t; }).join(', ') + '.'; aviso.className = 'f-status show error';
          var n = raiz.querySelector('.field.invalid'); if (n) n.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        irA(st.paso + 1);
      } }, [h('span', { class: 'btn-label', text: st.paso === def.pasos.length - 2 ? 'Revisar' : 'Siguiente' }), icono('i-arrow-right', 'icon-sm arrow')])
    ]));
  }

  // Muestra u oculta las preguntas que dependen de otra respuesta
  function actualizarVisibles() {
    conds.forEach(function (x) { var ver = U.cumple(x.si, x.ctx); x.el.hidden = !ver; });
    var barra = card.querySelector('.q-bar i'); if (barra) barra.style.width = progreso() + '%';
  }

  /* ---------- Campos ---------- */
  var ANCHO = { texto: 1, tel: 1, email: 1, fecha: 1, mes: 1, numero: 1, sensible: 1, lista: 1 };
  function campo(c, ctx) {
    if (c.tipo === 'titulo') return h('div', { class: 'q-tit full' }, [h('h3', { text: c.t }), c.ayuda ? h('p', { text: c.ayuda }) : null]);
    if (c.tipo === 'nota') return h('div', { class: 'q-nota full' }, [icono('i-sparkles', 'icon-sm'), h('span', { text: c.t })]);
    if (c.tipo === 'grupo') return grupo(c, ctx);
    var full = c.full || !ANCHO[c.tipo];
    var f = h('div', { class: 'field' + (full ? ' full' : ''), 'data-k': c.k });
    if (c.si) conds.push({ el: f, si: c.si, ctx: ctx });
    var id = nid();
    var et = (c.t || '') + (c.req ? ' *' : '');
    var ayuda = c.ayuda ? h('span', { class: 'hint', text: c.ayuda }) : null;
    function poner(v, recalcular) { ctx[c.k] = v; marcarCambio(); f.classList.remove('invalid'); if (recalcular) actualizarVisibles(); }
    switch (c.tipo) {
      case 'parrafo': {
        var ta = h('textarea', { class: 'input', id: id, rows: '4', maxlength: '4000' });
        ta.value = ctx[c.k] || '';
        ta.addEventListener('input', function () { poner(ta.value); });
        f.append(h('label', { for: id, text: et }), ayuda || '', ta); break;
      }
      case 'lista': {
        var sel = h('select', { class: 'input', id: id }, [h('option', { value: '', text: 'Elige una opción' })].concat(c.op.map(function (o) { return h('option', { value: o, text: o }); })));
        sel.value = ctx[c.k] || '';
        sel.addEventListener('change', function () { poner(sel.value, true); });
        f.append(h('label', { for: id, text: et }), ayuda || '', sel); break;
      }
      case 'opciones': case 'si_no': case 'multiple': {
        var ops = c.tipo === 'si_no' ? ['Sí', 'No'] : c.op;
        var multi = c.tipo === 'multiple';
        f.append(h('div', { class: 'field-legend', text: et }), ayuda || '', h('div', { class: 'chips' + (multi ? ' chip-multi' : '') }, ops.map(function (o, i) {
          var oid = id + '-' + i;
          var actual = ctx[c.k];
          var inp = h('input', { class: 'chip-input', type: multi ? 'checkbox' : 'radio', id: oid, name: id, value: o, checked: multi ? (actual || []).indexOf(o) !== -1 : actual === o });
          inp.addEventListener('change', function () {
            if (multi) poner(Array.prototype.map.call(f.querySelectorAll('input:checked'), function (x) { return x.value; }), true);
            else poner(o, true);
          });
          return h('span', null, [inp, h('label', { class: 'chip', for: oid, text: o })]);
        })));
        break;
      }
      case 'sensible': f.append(h('label', { for: id, text: et }), ayuda || '', sensible(c, id, f)); break;
      case 'direccion': f.append(h('div', { class: 'field-legend', text: et }), ayuda || '', direccion(c, ctx, f)); break;
      default: {
        var tipo = { tel: 'tel', email: 'email', fecha: 'date', numero: 'number', mes: 'month' }[c.tipo] || 'text';
        var inp2 = h('input', { class: 'input', id: id, type: tipo, maxlength: '200', inputmode: c.tipo === 'tel' ? 'tel' : c.tipo === 'numero' ? 'numeric' : null, min: c.tipo === 'numero' ? '0' : null,
          placeholder: c.ph || (c.tipo === 'tel' ? '(214) 555-0123' : c.tipo === 'mes' ? 'AAAA-MM' : null), autocomplete: 'off' });
        inp2.value = ctx[c.k] || '';
        inp2.addEventListener('input', function () { poner(inp2.value.trim()); });
        if (c.tipo === 'numero') inp2.addEventListener('change', actualizarVisibles);
        f.append(h('label', { for: id, text: et }), ayuda || '', inp2);
      }
    }
    f.appendChild(h('span', { class: 'err', text: 'Este dato es obligatorio.' }));
    return f;
  }

  // SSN, número A, pasaporte, I-94: si ya se guardó, se muestra solo el final
  function sensible(c, id, f) {
    var caja = h('div');
    function pintar(editar) {
      caja.innerHTML = '';
      if (st.mask[c.k] && !editar && !(c.k in st.sens)) {
        caja.appendChild(h('div', { class: 'q-guardado' }, [icono('i-lock', 'icon-sm'), h('span', { text: 'Guardado: ' + st.mask[c.k] }),
          h('button', { type: 'button', class: 'link', text: 'Cambiar', onclick: function () { pintar(true); var i = caja.querySelector('input'); if (i) i.focus(); } })]));
        return;
      }
      var i = h('input', { class: 'input', id: id, type: 'password', autocomplete: 'off', maxlength: '20', inputmode: c.mascara === 'ssn' || c.mascara === 'uscis' ? 'numeric' : null,
        placeholder: { ssn: '•••-••-••••', a: 'A-•••-•••-•••', uscis: '••••••••••••', pasaporte: 'Número de pasaporte', i94: '•••••••••••' }[c.mascara] || '' });
      i.value = st.sens[c.k] || '';
      i.addEventListener('input', function () {
        var v = i.value.replace(/[\s-]/g, '').toUpperCase();
        if (v) st.sens[c.k] = v; else if (st.mask[c.k]) st.sens[c.k] = ''; else delete st.sens[c.k];
        f.classList.remove('invalid'); marcarCambio();
      });
      caja.appendChild(h('div', { class: 'ssn-wrap' }, [i, h('button', { class: 'ssn-toggle', type: 'button', 'aria-label': 'Mostrar u ocultar', onclick: function () { i.type = i.type === 'password' ? 'text' : 'password'; } }, [icono('i-eye', 'icon-sm')])]));
    }
    pintar(false);
    return caja;
  }

  function direccion(c, ctx, f) {
    var v = ctx[c.k] && typeof ctx[c.k] === 'object' ? ctx[c.k] : {};
    var partes = [['calle', 'Calle y número', 'full'], ['apto', 'Apto / unidad', ''], ['ciudad', 'Ciudad', ''], ['estado', 'Estado o provincia', ''], ['zip', 'Código postal', ''], ['pais', 'País', '']];
    return h('div', { class: 'q-dir' }, partes.map(function (p) {
      var i = h('input', { class: 'input', type: 'text', maxlength: '160', placeholder: p[1], 'aria-label': (c.t || 'Dirección') + ': ' + p[1], autocomplete: 'off' });
      i.value = v[p[0]] || '';
      i.addEventListener('input', function () { v[p[0]] = i.value.trim(); ctx[c.k] = v; f.classList.remove('invalid'); marcarCambio(); });
      return h('div', { class: p[2] }, [i]);
    }));
  }

  // Grupo repetible: direcciones, empleos, matrimonios, hijos…
  function grupo(c, ctx) {
    var f = h('div', { class: 'q-grupo full', 'data-k': c.k });
    if (c.si) conds.push({ el: f, si: c.si, ctx: ctx });
    if (!Array.isArray(ctx[c.k]) || !ctx[c.k].length) ctx[c.k] = [];
    var lista = ctx[c.k];
    while (lista.length < (c.min || 0)) lista.push({});
    var items = h('div', { class: 'q-items' });
    function pintar() {
      items.innerHTML = '';
      lista.forEach(function (it, i) {
        var g = h('div', { class: 'grid' });
        c.campos.forEach(function (sc) { g.appendChild(campo(sc, it)); });
        items.appendChild(h('div', { class: 'q-item' }, [
          h('div', { class: 'q-item-h' }, [h('b', { text: c.item + (c.max > 1 ? ' ' + (i + 1) : '') }),
            lista.length > (c.min || 0) || (c.min === 1 && lista.length === 1 && !U.vacio(it) && c.max > 1) ? h('button', { type: 'button', class: 'link', text: 'Quitar', onclick: function () {
              if (!U.vacio(it) && !confirm('¿Quitar ' + c.item.toLowerCase() + ' ' + (i + 1) + '?')) return;
              lista.splice(i, 1); if (lista.length < (c.min || 0)) lista.push({}); marcarCambio(); pintar();
            } }) : null]),
          g]));
      });
      actualizarVisibles();
    }
    f.append(h('div', { class: 'field-legend', text: c.t }), c.ayuda ? h('span', { class: 'hint', text: c.ayuda }) : '', items);
    if (c.max > 1) f.appendChild(h('button', { type: 'button', class: 'q-add', onclick: function () {
      if (lista.length >= c.max) return;
      lista.push({}); marcarCambio(); pintar();
      var u = items.lastChild; if (u) { u.scrollIntoView({ behavior: 'smooth', block: 'center' }); var i = u.querySelector('input'); if (i) i.focus({ preventScroll: true }); }
    } }, [h('span', { class: 'mas', text: '+' }), h('span', { text: c.agregar })]));
    pintar();
    return f;
  }

  /* ---------- Documentos ---------- */
  function pasoDocumentos(despues) {
    var cont = h('div', { class: 'q-docs' });
    var p = def.pasos.filter(function (x) { return x.documentos; })[0];
    cont.appendChild(h('div', { class: 'q-nota' }, [icono('i-sparkles', 'icon-sm'), h('span', { text: despues ? 'Sube los documentos que faltan. Cada archivo se guarda en cuanto termina de subir.' : 'Pueden enviar el cuestionario aunque falten documentos: los que no suban quedan como pendientes y los pueden subir después con este mismo enlace.' })]));
    p.documentos.forEach(function (g) {
      var docs = g.docs.filter(function (d) { return U.cumple(d.si, st.datos); });
      if (!docs.length) return;
      cont.appendChild(h('h3', { class: 'q-doc-g', text: g.grupo }));
      docs.forEach(function (d) { cont.appendChild(tarjetaDoc(d, despues)); });
    });
    return cont;
  }

  function tarjetaDoc(d, despues) {
    var t = h('div', { class: 'q-doc', 'data-doc': d.k });
    var lista = h('div', { class: 'f-files' });
    var estado = h('span', { class: 'q-chip' });
    var input = h('input', { type: 'file', multiple: true, accept: 'image/*,.pdf,.heic,.heif', hidden: true });
    var luego = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: function () {
      var i = st.pend.indexOf(d.k);
      if (i === -1) st.pend.push(d.k); else st.pend.splice(i, 1);
      if (despues) guardar(false).catch(function () { }); else marcarCambio();
      pintarEstado();
    } });
    function pintarEstado() {
      var n = subidos(d.k).length, p = st.pend.indexOf(d.k) !== -1;
      estado.className = 'q-chip ' + (n ? 'ok' : p ? 'pend' : 'falta');
      estado.textContent = n ? '✓ ' + n + (n === 1 ? ' archivo' : ' archivos') : p ? 'Lo envían después' : 'Falta';
      luego.textContent = p ? 'Quitar «después»' : 'Lo envío después';
      luego.hidden = !!n;
      t.classList.toggle('listo', !!n);
      var barra = card.querySelector('.q-bar i'); if (barra) barra.style.width = progreso() + '%';
    }
    function pintarArchivos() {
      lista.innerHTML = '';
      subidos(d.k).forEach(function (a) {
        lista.appendChild(h('div', { class: 'f-file' }, [icono('i-file', 'icon-sm'), h('span', { class: 'n', text: a.nombre }), h('span', { class: 's ok', text: a.tam ? tamano(a.tam) : 'Subido' }),
          st.estado === 'borrador' ? h('button', { type: 'button', 'aria-label': 'Quitar ' + a.nombre, onclick: function () {
            if (!confirm('¿Quitar «' + a.nombre + '»?')) return;
            st.docs.splice(st.docs.indexOf(a), 1); guardar(false).catch(function () { }); pintarArchivos(); pintarEstado();
          } }, [icono('i-x', 'icon-sm')]) : null]));
      });
    }
    input.addEventListener('change', function () {
      Array.prototype.forEach.call(input.files, function (file) { subir(file, d, lista, function () { pintarArchivos(); pintarEstado(); }); });
      input.value = '';
    });
    t.append(
      h('div', { class: 'q-doc-h' }, [h('div', null, [h('b', { text: d.t }), d.ayuda ? h('span', { class: 'hint', text: d.ayuda }) : null]), estado]),
      lista,
      h('div', { class: 'q-doc-acc' }, [h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: function () { input.click(); } }, [icono('i-upload', 'icon-sm'), h('span', { text: 'Subir ahora' })]), luego, input])
    );
    pintarArchivos(); pintarEstado();
    return t;
  }

  function extension(f) { var m = /\.([a-z0-9]{1,5})$/i.exec(f.name || ''); return m ? m[1].toLowerCase() : ((f.type || '').split('/')[1] || 'bin').replace(/[^a-z0-9]/g, '').slice(0, 5); }
  function subir(file, d, lista, listo) {
    var bar = h('i'), s = h('span', { class: 's', text: tamano(file.size) });
    var fila = h('div', { class: 'f-file' }, [icono('i-file', 'icon-sm'), h('span', { class: 'n', text: file.name }), s, h('span', { class: 'bar' }, [bar])]);
    lista.appendChild(fila);
    if (file.size > CONFIG.maxBytes) { s.textContent = 'Pesa más de 15 MB'; s.className = 's bad'; setTimeout(function () { fila.remove(); }, 6000); return; }
    var path = 'cuestionarios/' + token + '/' + d.k + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) + '.' + extension(file);
    var xhr = new XMLHttpRequest();
    xhr.open('POST', CONFIG.supabaseUrl + '/storage/v1/object/' + CONFIG.bucket + '/' + path);
    var hd = headers({ 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false' });
    for (var k in hd) xhr.setRequestHeader(k, hd[k]);
    xhr.upload.addEventListener('progress', function (e) { if (e.lengthComputable) bar.style.width = Math.round(e.loaded / e.total * 100) + '%'; });
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        st.docs.push({ doc: d.k, path: path, nombre: file.name.slice(0, 200), tipo: file.type || 'application/octet-stream', tam: file.size, at: new Date().toISOString() });
        var i = st.pend.indexOf(d.k); if (i !== -1) st.pend.splice(i, 1);
        fila.remove(); listo();
        guardar(false).then(function () { if (st.estado === 'enviado') aviso('Recibimos «' + file.name + '». ¡Gracias!'); }, function () { });
      } else { s.textContent = 'No se pudo subir'; s.className = 's bad'; }
    };
    xhr.onerror = function () { s.textContent = 'Sin conexión'; s.className = 's bad'; };
    xhr.send(file);
  }
  function aviso(t) {
    var n = h('div', { class: 'q-toast', role: 'status', text: t });
    document.body.appendChild(n); setTimeout(function () { n.classList.add('fuera'); setTimeout(function () { n.remove(); }, 400); }, 3200);
  }

  /* ---------- Revisar y enviar ---------- */
  function resumenCampo(c, ctx) {
    if (c.tipo === 'titulo' || c.tipo === 'nota' || !U.cumple(c.si, ctx)) return null;
    if (c.tipo === 'grupo') {
      var items = (ctx[c.k] || []).filter(function (it) { return !U.vacio(it); });
      if (!items.length) return null;
      return h('div', { class: 'q-r-g' }, [h('span', { class: 'l', text: c.t }), h('div', null, items.map(function (it, i) {
        var partes = c.campos.map(function (sc) { var v = U.valorTexto(sc, it[sc.k]); return v ? sc.t + ': ' + v : null; }).filter(Boolean);
        return h('p', { text: (c.max > 1 ? (i + 1) + '. ' : '') + partes.join(' · ') });
      }))]);
    }
    var v = c.tipo === 'sensible' ? (st.sens[c.k] ? '•••• ' + st.sens[c.k].slice(-4) : st.mask[c.k]) : U.valorTexto(c, ctx[c.k]);
    if (!v) return null;
    return h('div', { class: 'q-r' }, [h('span', { class: 'l', text: c.t }), h('span', { text: v })]);
  }

  function pintarRevision() {
    var p = def.pasos[st.paso];
    raiz.innerHTML = '';
    raiz.appendChild(h('div', { class: 'f-sec-h' }, [h('span', { class: 'n', text: String(st.paso + 1) }), h('div', null, [h('h2', { text: p.t }), h('p', { text: p.st })])]));
    def.pasos.forEach(function (x, i) {
      if (x.revisar) return;
      var bloque = h('div', { class: 'q-rev' });
      var falta = x.campos ? faltantes(x) : [];
      bloque.appendChild(h('div', { class: 'q-rev-h' }, [h('h3', { text: (i + 1) + '. ' + x.t }), falta.length ? h('span', { class: 'q-chip falta', text: 'Faltan ' + falta.length }) : null,
        h('button', { type: 'button', class: 'link', text: 'Editar', onclick: function () { irA(i); } })]));
      if (x.campos) {
        var filas = x.campos.map(function (c) { return resumenCampo(c, st.datos); }).filter(Boolean);
        bloque.appendChild(filas.length ? h('div', { class: 'q-r-l' }, filas) : h('p', { class: 'hint', text: 'Todavía no hay respuestas en esta parte.' }));
      } else {
        var docs = docsVisibles();
        bloque.appendChild(h('div', { class: 'q-r-l' }, docs.map(function (d) {
          var n = subidos(d.k).length;
          return h('div', { class: 'q-r' }, [h('span', { class: 'l', text: d.t }), h('span', { class: 'q-chip ' + (n ? 'ok' : 'pend'), text: n ? '✓ ' + n + (n === 1 ? ' archivo' : ' archivos') : 'Pendiente' })]);
        })));
      }
      raiz.appendChild(bloque);
    });

    var firma = st.datos.firma = st.datos.firma || {};
    firma.acepto = firma.acepto || [];
    var cons = h('div', { class: 'consents' }, def.acepto.map(function (txt, i) {
      var inp = h('input', { type: 'checkbox', checked: !!firma.acepto[i] });
      inp.addEventListener('change', function () { firma.acepto[i] = inp.checked; inp.closest('.consent-box').classList.remove('invalid'); marcarCambio(); });
      return h('div', { class: 'field full consent-box' }, [h('label', { class: 'consent' }, [inp, h('span', { text: txt })])]);
    }));
    var hoy = new Date().toLocaleDateString('es-US', { day: 'numeric', month: 'long', year: 'numeric' });
    function nombreFirma(k, t) {
      var id = nid();
      var i = h('input', { class: 'input', id: id, type: 'text', maxlength: '160', autocomplete: 'off', placeholder: 'Nombre y apellidos' });
      i.value = firma[k] || '';
      i.addEventListener('input', function () { firma[k] = i.value.trim(); i.closest('.field').classList.remove('invalid'); marcarCambio(); });
      return h('div', { class: 'field' }, [h('label', { for: id, text: t + ' *' }), i, h('span', { class: 'err', text: 'Escribe tu nombre completo para firmar.' })]);
    }
    raiz.appendChild(h('div', { class: 'q-firma' }, [
      h('h3', { text: 'Aceptación y firma' }),
      cons,
      h('div', { class: 'grid', style: 'margin-top:16px' }, [nombreFirma('esposo', 'Firma del esposo: nombre completo'), nombreFirma('esposa', 'Firma de la esposa: nombre completo')]),
      h('p', { class: 'hint', text: 'Fecha: ' + hoy + '. Escribir su nombre aquí cuenta como su firma.' })
    ]));

    indicador = h('span', { class: 'q-save', text: 'Se guarda solo' });
    var estado = h('div', { class: 'f-status', role: 'status', 'aria-live': 'polite' });
    var btn = h('button', { class: 'btn btn-primary', type: 'button', onclick: function () { enviar(btn, estado, cons); } },
      [h('span', { class: 'btn-label', text: 'Enviar a AVA' }), icono('i-send', 'icon-sm arrow'), h('span', { class: 'spinner', 'aria-hidden': 'true' })]);
    raiz.appendChild(h('div', { class: 'f-submit' }, [btn, estado, h('div', { class: 'q-nav sola' }, [h('button', { type: 'button', class: 'btn btn-ghost', onclick: function () { irA(st.paso - 1); } }, [h('span', { text: 'Atrás' })]), indicador]),
      h('p', { class: 'f-legal' }, [icono('i-lock', 'icon-sm'), ' Sus datos y documentos se guardan cifrados en un sistema privado y solo los ve el equipo de AVA Multiservices.'])]));
  }

  var enviando = false;
  function enviar(btn, estado, cons) {
    if (enviando) return;
    function status(t, k) { estado.textContent = t; estado.className = 'f-status show ' + k; }
    for (var i = 0; i < def.pasos.length; i++) {
      var p = def.pasos[i];
      if (p.campos && faltantes(p).length) {
        status('Falta llenar algo en «' + p.t + '»: ' + faltantes(p).map(function (c) { return c.t; }).join(', ') + '.', 'error');
        var ir = h('button', { type: 'button', class: 'link', text: ' Ir a ' + p.t, onclick: (function (j) { return function () { irA(j); }; })(i) });
        estado.appendChild(ir);
        return;
      }
    }
    var firma = st.datos.firma || {};
    var malos = [];
    cons.querySelectorAll('.consent-box').forEach(function (b, j) { var ok = !!(firma.acepto || [])[j]; b.classList.toggle('invalid', !ok); if (!ok) malos.push(b); });
    raiz.querySelectorAll('.q-firma .grid .field').forEach(function (f, j) { var ok = !!firma[j ? 'esposa' : 'esposo']; f.classList.toggle('invalid', !ok); if (!ok) malos.push(f); });
    if (malos.length) { status('Marquen las casillas y escriban sus nombres para firmar.', 'error'); malos[0].scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    firma.fecha = new Date().toISOString();
    enviando = true; btn.classList.add('loading'); btn.disabled = true;
    status('Enviando su información de forma segura…', 'info');
    var esperar = guardando || Promise.resolve();
    esperar.then(function () { return guardar(true); }).then(function () {
      st.estado = 'enviado'; st.enviado_at = new Date().toISOString(); sucio = false;
      return Promise.race([avisarAna(), new Promise(function (ok) { setTimeout(ok, 3500); })]);
    }).then(function () {
      try { localStorage.removeItem(claveLocal()); } catch (_) { /* */ }
      gracias();
    }).catch(function (e) {
      enviando = false; btn.classList.remove('loading'); btn.disabled = false;
      var m = e && e.message;
      status(m && m !== 'Error' && !/fetch/i.test(m) ? m : 'No pudimos enviar. Revisen su conexión e inténtenlo de nuevo, o escríbannos por WhatsApp al (786) 816-2430.', 'error');
    });
  }

  function pendientes() { return docsVisibles().filter(function (d) { return !subidos(d.k).length; }); }
  function avisarAna() {
    var d = st.datos, pend = pendientes();
    return fetch('https://formsubmit.co/ajax/' + CONFIG.avisoEmail, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ _subject: 'Cuestionario I-130 enviado · ' + (def.nombre(d) || 'Sin nombre'), _template: 'table', _captcha: 'false',
        Cuestionario: def.titulo + ' (' + def.subtitulo + ')', Pareja: def.nombre(d) || '', 'Celular del esposo': d.p_cel || '', 'Celular de la esposa': d.b_cel || '',
        'Documentos subidos': String(st.docs.length), 'Documentos pendientes': pend.length ? pend.map(function (x) { return x.corto + ': ' + x.t; }).join(', ') : 'Ninguno', 'Ver respuestas en el panel': CONFIG.panelUrl })
    }).catch(function () { /* el aviso es opcional */ });
  }

  function gracias() {
    card.innerHTML = '';
    var pend = pendientes();
    card.appendChild(h('div', { class: 'f-ok' }, [
      h('div', { class: 'c', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' }),
      h('h2', { text: '¡Listo! Recibimos su información' }),
      h('p', { text: 'Gracias por confiar en AVA Multiservices. Vamos a revisar todo y les escribimos muy pronto.' }),
      pend.length ? h('div', { class: 'q-pend' }, [h('b', { text: 'Documentos pendientes' }), h('ul', null, pend.map(function (x) { return h('li', { text: x.corto + ': ' + x.t }); })),
        h('p', { text: 'Cuando los tengan, entren a este mismo enlace y súbanlos. Guárdenlo en sus favoritos o en el chat de WhatsApp.' })]) : null,
      h('div', { class: 'q-ok-acc' }, [
        pend.length ? h('button', { type: 'button', class: 'btn btn-ghost', onclick: function () { dibujarEnviado(); } }, [icono('i-upload', 'icon-sm'), h('span', { text: 'Subir documentos ahora' })]) : null,
        h('a', { class: 'btn btn-primary', href: 'https://wa.me/' + CONFIG.whatsapp, target: '_blank', rel: 'noopener' }, [icono('i-whatsapp', 'icon-fill'), h('span', { text: 'Escríbenos por WhatsApp' })])])
    ]));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Ya se envió: solo se pueden subir los documentos que faltaban
  function dibujarEnviado() {
    card.innerHTML = '';
    var f = st.enviado_at ? new Date(st.enviado_at).toLocaleDateString('es-US', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    card.appendChild(cabecera('Ya recibimos su información' + (f ? ' el ' + f : '') + '. Aquí pueden subir los documentos que faltaban; si necesitan cambiar una respuesta, escríbannos por WhatsApp.'));
    raiz = h('div', { class: 'f-body q-body' });
    raiz.appendChild(h('div', { class: 'f-sec-h' }, [h('span', { class: 'n' }, [icono('i-upload', 'icon-sm')]), h('div', null, [h('h2', { text: 'Documentos' }), h('p', { text: pendientes().length ? 'Faltan ' + pendientes().length + '. Cada archivo se envía en cuanto termina de subir.' : 'Ya tenemos todos los documentos. Si quieren agregar algo más, pueden subirlo aquí.' })])]));
    raiz.appendChild(pasoDocumentos(true));
    card.appendChild(raiz);
  }
})();
