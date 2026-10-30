/* AVA Multiservices — Firma electrónica de contratos.
   ?t=  contrato preparado para un cliente
   ?p=  enlace general de una plantilla: el cliente llena sus datos y firma */
(function () {
  'use strict';
  var API = 'https://szmkcwtkorsndvmxywai.supabase.co/rest/v1/rpc/';
  var KEY = 'sb_publishable_Ri5Pcd0a9dphA8W5qJ2YvQ_veqm7I26';
  var $ = function (id) { return document.getElementById(id); };
  var q = new URLSearchParams(location.search);
  var token = q.get('t') || '', plantilla = q.get('p') || '';
  var VACIO = '__________';
  var CONOCIDAS = ['nombre', 'direccion', 'ciudad_estado_zip', 'fecha_nacimiento', 'telefono', 'email', 'fecha', 'pago', 'servicio', 'monto_consulta', 'esquema_pago'];
  function rpc(fn, body) {
    return fetch(API + fn, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j && j.message || 'Error'); return j; }); });
  }
  function noEncontrado() { $('titulo').textContent = 'Enlace no válido'; $('texto').textContent = 'Este enlace no existe o ya no está disponible. Pide uno nuevo a AVA Multiservices.'; }
  function pintarTexto(t) {
    if (window.AVA_FORMATO && window.AVA_FORMATO.usa(t)) { $('texto').classList.add('fx-doc'); $('texto').innerHTML = window.AVA_FORMATO(t); }
    else $('texto').textContent = t;
  }
  var uuid = /^[0-9a-f-]{36}$/i;

  if (uuid.test(token)) cargarContrato();
  else if (uuid.test(plantilla)) cargarPlantilla();
  else noEncontrado();

  function cargarContrato() {
    rpc('ver_contrato', { p_token: token }).then(function (k) {
      if (!k) { noEncontrado(); return; }
      $('titulo').textContent = k.titulo;
      $('para').textContent = 'Para ' + k.cliente;
      $('datos').hidden = true;
      pintarTexto(k.contenido);
      if (k.estado === 'firmado') return mostrarFirmado(k.firmado_nombre, k.firmado_at);
      $('firmar').hidden = false;
      iniciarLienzo();
    }).catch(noEncontrado);
  }

  /* ---------- Enlace general: datos + vista previa ---------- */
  var base = null;
  var fechaLarga = function (iso) { return iso ? new Date(iso + 'T12:00:00').toLocaleDateString('es-US', { day: 'numeric', month: 'long', year: 'numeric' }) : ''; };
  var hoy = (function () { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); })();
  function val(id) { return $(id).value.trim(); }
  function usa(v) { return base && base.contenido.indexOf('{' + v + '}') !== -1; }

  function cargarPlantilla() {
    rpc('contrato_publico', { p_token: plantilla }).then(function (p) {
      if (!p || !p.contenido) { noEncontrado(); return; }
      base = p;
      document.title = p.titulo + ' · AVA Multiservices';
      $('titulo').textContent = p.titulo;
      $('para').textContent = 'Llena tus datos y firma';
      // Solo se piden los datos que el contrato usa (nombre y teléfono siempre)
      Array.prototype.forEach.call(document.querySelectorAll('#datos [data-var]'), function (f) { f.hidden = !usa(f.getAttribute('data-var')); });
      if (usa('email')) $('l-email').textContent = 'Correo *';
      $('datos').hidden = false;
      $('paso-firma').textContent = '3 · Tu firma';
      vistaPrevia();
      var t = null;
      Array.prototype.forEach.call(document.querySelectorAll('#datos input'), function (i) {
        i.addEventListener('input', function () { clearTimeout(t); t = setTimeout(vistaPrevia, 250); });
      });
      $('d-nombre').addEventListener('change', function () { if (!$('nombre').value.trim()) $('nombre').value = val('d-nombre'); });
      $('firmar').hidden = false;
      iniciarLienzo();
    }).catch(noEncontrado);
  }

  function datos() {
    return { nombre: val('d-nombre'), telefono: val('d-telefono'), email: val('d-email'), direccion: val('d-direccion'), ciudad: val('d-ciudad'), estado: val('d-estado'), zip: val('d-zip'), fecha_nacimiento: $('d-nac').value };
  }
  function vistaPrevia() {
    var d = datos();
    var vars = Object.assign({}, base.valores || {}, {
      nombre: d.nombre, direccion: d.direccion, telefono: d.telefono, email: d.email, fecha: fechaLarga(hoy),
      ciudad_estado_zip: [d.ciudad, [d.estado, d.zip].filter(Boolean).join(' ')].filter(Boolean).join(', '),
      fecha_nacimiento: fechaLarga(d.fecha_nacimiento)
    });
    pintarTexto(base.contenido.replace(/\{([a-z_]+)\}/g, function (todo, k) {
      return vars[k] ? String(vars[k]) : (k in vars || CONOCIDAS.indexOf(k) !== -1 ? VACIO : todo);
    }));
  }
  function faltaDato() {
    var d = datos(), tel = d.telefono.replace(/\D/g, '');
    if (tel.length === 11 && tel[0] === '1') tel = tel.slice(1);
    if (d.nombre.split(/\s+/).filter(Boolean).length < 2) return ['d-nombre', 'Escribe tu nombre y apellido.'];
    if (tel.length !== 10) return ['d-telefono', 'Escribe tu teléfono de 10 dígitos.'];
    if ((d.email || usa('email')) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return ['d-email', 'Revisa tu correo.'];
    if (usa('direccion') && d.direccion.length < 5) return ['d-direccion', 'Escribe tu dirección.'];
    if (usa('ciudad_estado_zip')) {
      if (!d.ciudad) return ['d-ciudad', 'Escribe tu ciudad.'];
      if (!d.estado) return ['d-estado', 'Escribe tu estado.'];
      if (!/^\d{5}(-?\d{4})?$/.test(d.zip)) return ['d-zip', 'Escribe tu ZIP de 5 dígitos.'];
    }
    if (usa('fecha_nacimiento') && (!d.fecha_nacimiento || d.fecha_nacimiento < '1900-01-01' || d.fecha_nacimiento > hoy)) return ['d-nac', 'Escribe tu fecha de nacimiento.'];
    return null;
  }

  function mostrarFirmado(nombre, cuando) {
    $('firmar').hidden = true; $('firmado').hidden = false;
    $('info').textContent = 'Firmado por ' + nombre + ' el ' + new Date(cuando).toLocaleString('es-US', { dateStyle: 'long', timeStyle: 'short' }) + '.';
  }

  var cv, ctx, trazo = false, hay = false;
  function iniciarLienzo() {
    cv = $('lienzo'); ctx = cv.getContext('2d');
    function ajustar() { var r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1; cv.width = r.width * dpr; cv.height = r.height * dpr; ctx.scale(dpr, dpr); ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#2a2a2a'; hay = false; $('hint').hidden = false; }
    ajustar();
    function pos(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    cv.addEventListener('pointerdown', function (e) { trazo = true; cv.setPointerCapture(e.pointerId); var p = pos(e); ctx.beginPath(); ctx.moveTo(p[0], p[1]); });
    cv.addEventListener('pointermove', function (e) { if (!trazo) return; var p = pos(e); ctx.lineTo(p[0], p[1]); ctx.stroke(); hay = true; $('hint').hidden = true; });
    cv.addEventListener('pointerup', function () { trazo = false; });
    $('borrar').addEventListener('click', function () { ctx.clearRect(0, 0, cv.width, cv.height); hay = false; $('hint').hidden = false; });
  }

  $('ok').addEventListener('click', function () {
    var err = $('err'); err.hidden = true;
    function aviso(t) { err.textContent = t; err.hidden = false; }
    if (base) {
      var f = faltaDato();
      if (f) { aviso(f[1]); $(f[0]).focus(); $(f[0]).scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    }
    var nombre = $('nombre').value.trim();
    var falta = !hay ? 'Dibuja tu firma.' : nombre.length < 3 ? 'Escribe tu nombre completo.' : !$('acepto').checked ? 'Marca la casilla para aceptar el contrato.' : '';
    if (falta) { aviso(falta); return; }
    var b = $('ok'); b.disabled = true;
    var firma = cv.toDataURL('image/png'), agente = navigator.userAgent.slice(0, 300);
    if (!base) {
      rpc('firmar_contrato', { p_token: token, p_nombre: nombre, p_firma: firma, p_agente: agente })
        .then(function (ok) { if (!ok) throw new Error('no'); mostrarFirmado(nombre, new Date().toISOString()); window.scrollTo({ top: 0, behavior: 'smooth' }); })
        .catch(function () { b.disabled = false; aviso('No se pudo firmar. Recarga la página e inténtalo de nuevo.'); });
      return;
    }
    rpc('firmar_contrato_publico', { p_token: plantilla, p_datos: datos(), p_nombre: nombre, p_firma: firma, p_agente: agente })
      .then(function (r) {
        if (!r || !r.ok) { b.disabled = false; aviso((r && r.error) || 'No se pudo firmar. Inténtalo de nuevo.'); return; }
        // Desde aquí la página queda como el contrato firmado de esta persona
        token = r.token; base = null;
        history.replaceState(null, '', location.pathname + '?t=' + r.token);
        $('datos').hidden = true;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return rpc('ver_contrato', { p_token: r.token }).then(function (k) {
          if (k) { $('para').textContent = 'Para ' + k.cliente; pintarTexto(k.contenido); }
          mostrarFirmado(nombre, (k && k.firmado_at) || new Date().toISOString());
        }, function () { mostrarFirmado(nombre, new Date().toISOString()); });
      })
      .catch(function () { b.disabled = false; aviso('No se pudo firmar. Revisa tu conexión e inténtalo de nuevo.'); });
  });
})();
