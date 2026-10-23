/* AVA Multiservices — Firma electrónica de contratos con enlace privado */
(function () {
  'use strict';
  var API = 'https://szmkcwtkorsndvmxywai.supabase.co/rest/v1/rpc/';
  var KEY = 'sb_publishable_Ri5Pcd0a9dphA8W5qJ2YvQ_veqm7I26';
  var $ = function (id) { return document.getElementById(id); };
  var token = new URLSearchParams(location.search).get('t') || '';
  function rpc(fn, body) {
    return fetch(API + fn, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j && j.message || 'Error'); return j; }); });
  }
  function noEncontrado() { $('titulo').textContent = 'Enlace no válido'; $('texto').textContent = 'Este enlace no existe o ya no está disponible. Pide uno nuevo a AVA Multiservices.'; }
  if (!/^[0-9a-f-]{36}$/i.test(token)) { noEncontrado(); return; }

  rpc('ver_contrato', { p_token: token }).then(function (k) {
    if (!k) { noEncontrado(); return; }
    $('titulo').textContent = k.titulo;
    $('para').textContent = 'Para ' + k.cliente;
    if (window.AVA_FORMATO && window.AVA_FORMATO.usa(k.contenido)) { $('texto').classList.add('fx-doc'); $('texto').innerHTML = window.AVA_FORMATO(k.contenido); }
    else $('texto').textContent = k.contenido;
    if (k.estado === 'firmado') return mostrarFirmado(k.firmado_nombre, k.firmado_at);
    $('firmar').hidden = false;
    iniciarLienzo();
  }).catch(noEncontrado);

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
    var nombre = $('nombre').value.trim();
    var falta = !hay ? 'Dibuja tu firma.' : nombre.length < 3 ? 'Escribe tu nombre completo.' : !$('acepto').checked ? 'Marca la casilla para aceptar el contrato.' : '';
    if (falta) { err.textContent = falta; err.hidden = false; return; }
    var b = $('ok'); b.disabled = true;
    rpc('firmar_contrato', { p_token: token, p_nombre: nombre, p_firma: cv.toDataURL('image/png'), p_agente: navigator.userAgent.slice(0, 300) })
      .then(function (ok) { if (!ok) throw new Error('no'); mostrarFirmado(nombre, new Date().toISOString()); window.scrollTo({ top: 0, behavior: 'smooth' }); })
      .catch(function () { b.disabled = false; err.textContent = 'No se pudo firmar. Recarga la página e inténtalo de nuevo.'; err.hidden = false; });
  });
})();
