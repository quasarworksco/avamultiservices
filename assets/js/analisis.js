/* AVA Multiservices — Análisis de crédito y propuesta con enlace privado; el cliente la acepta aquí mismo */
(function () {
  'use strict';
  var API = 'https://szmkcwtkorsndvmxywai.supabase.co/rest/v1/rpc/';
  var KEY = 'sb_publishable_Ri5Pcd0a9dphA8W5qJ2YvQ_veqm7I26';
  var $ = function (id) { return document.getElementById(id); };
  var token = new URLSearchParams(location.search).get('t') || '';
  var dinero = function (n) { return Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: Number(n) % 1 ? 2 : 0 }); };
  var fecha = function (v) { return new Date(String(v).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-US', { day: 'numeric', month: 'long', year: 'numeric' }); };
  var hoy = new Date(); hoy = new Date(hoy.getTime() - hoy.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  var BUROS = [['transunion', 'TransUnion'], ['experian', 'Experian'], ['equifax', 'Equifax']];

  function rpc(nombre, cuerpo) {
    return fetch(API + nombre, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }).then(function (r) { return r.json(); });
  }
  function n(tag, cls, texto, hijos) {
    var e = document.createElement(tag); if (cls) e.className = cls; if (texto != null) e.textContent = texto;
    (hijos || []).forEach(function (h) { if (h) e.appendChild(h); }); return e;
  }
  function noValido() { $('cargando').textContent = 'Este análisis no existe, fue anulado o el enlace está incompleto. Escríbenos a AVA Multiservices.'; }
  if (!/^[0-9a-f-]{36}$/i.test(token)) { noValido(); return; }

  rpc('ver_cotizacion', { p_token: token }).then(function (q) {
    if (!q || !q.datos) { noValido(); return; }
    var d = q.datos, doc = $('doc');
    document.title = 'Tu análisis de crédito · AVA Multiservices';
    doc.appendChild(n('div', 'an-top', null, [(function () { var i = document.createElement('img'); i.src = '../assets/img/logo.svg'; i.alt = 'AVA Multiservices'; return i; })(),
      n('div', 'an-n', null, [n('span', 'an-k', 'Análisis de crédito'), n('b', null, q.cliente), n('span', null, 'Preparado el ' + fecha(q.fecha))])]));

    doc.appendChild(n('h2', null, 'Tus puntajes hoy'));
    doc.appendChild(n('div', 'an-pts', null, BUROS.map(function (b) { return n('div', null, null, [n('small', null, b[1]), n('b', null, d.puntajes && d.puntajes[b[0]] ? String(d.puntajes[b[0]]) : '—')]); })));
    if (d.meta) doc.appendChild(n('p', 'an-meta', 'Meta: llegar a ' + d.meta + ' puntos.'));

    doc.appendChild(n('h2', null, 'Lo que encontramos en tu reporte'));
    var t = n('table', 'an-tabla');
    t.appendChild(n('tr', null, null, [n('th', null, ''), n('th', null, 'Cuentas negativas'), n('th', null, 'Saldo de esas cuentas'), n('th', null, 'Consultas')]));
    BUROS.forEach(function (b) { var x = (d.buros || {})[b[0]] || {}; t.appendChild(n('tr', null, null, [n('td', null, b[1]), n('td', null, String(x.negativas || 0)), n('td', null, dinero(x.saldo || 0)), n('td', null, String(x.consultas || 0))])); });
    doc.appendChild(t);
    if ((d.cuentas || []).length) {
      doc.appendChild(n('p', 'an-k', 'Cuentas que afectan tu crédito'));
      doc.lastChild.style.margin = '16px 0 8px';
      doc.appendChild(n('div', 'an-cta', null, d.cuentas.map(function (c) { return n('div', 'an-c', null, [n('span', null, c.nombre, [n('small', null, [c.estado, c.saldo].filter(Boolean).join(' · '))]), n('span', null, (c.buros || []).join(', '))]); })));
    }
    if (d.diagnostico) { doc.appendChild(n('h2', null, 'Diagnóstico')); doc.appendChild(n('p', 'an-tx', d.diagnostico)); }
    if ((d.servicios || []).length) { doc.appendChild(n('h2', null, 'Lo que vamos a trabajar')); doc.appendChild(n('ul', 'an-srv', null, d.servicios.map(function (s) { return n('li', null, s); }))); }

    doc.appendChild(n('h2', null, 'Nuestra propuesta'));
    var prop = n('div', 'an-prop', null, [n('span', 'an-k', 'Inversión del paquete'), n('div', 'an-precio', q.precio != null ? dinero(q.precio) : 'A convenir'),
      d.forma_pago ? n('p', null, 'Forma de pago: ' + d.forma_pago) : null, d.duracion ? n('p', null, 'Tiempo estimado: ' + d.duracion) : null,
      q.vence ? n('p', null, 'Propuesta válida hasta el ' + fecha(q.vence)) : null]);
    doc.appendChild(prop);
    if (d.notas) doc.appendChild(n('p', 'an-tx', d.notas)).style.marginTop = '12px';
    doc.appendChild(n('div', 'an-croa', 'No cobramos nada antes de realizar el trabajo. Antes de empezar firmarás un contrato por escrito y tendrás 3 días hábiles para cancelarlo sin ningún costo. Nadie puede garantizar que un buró elimine información correcta y al día de tu reporte.'));

    // Aceptar la propuesta
    var zona = n('div', 'an-acepta');
    function aceptada(cuando) { zona.innerHTML = ''; zona.appendChild(n('div', 'an-ok', '✓ Aceptaste esta propuesta' + (cuando ? ' el ' + fecha(cuando) : '') + '. Te enviaremos el contrato para firmar.')); }
    if (q.estado === 'aceptada') aceptada(q.aceptada_at);
    else if (q.vence && q.vence < hoy) zona.appendChild(n('div', 'an-croa', 'Esta propuesta venció. Escríbenos y te la actualizamos.'));
    else {
      var nom = document.createElement('input'); nom.placeholder = 'Escribe tu nombre completo'; nom.autocomplete = 'name'; nom.maxLength = 160;
      var err = n('div', 'an-err'); var b = n('button', 'btn btn-primary'); b.type = 'button'; b.appendChild(n('span', 'btn-label', 'Acepto la propuesta'));
      b.onclick = function () {
        err.textContent = '';
        if (nom.value.trim().length < 3) { err.textContent = 'Escribe tu nombre completo.'; nom.focus(); return; }
        b.disabled = true;
        rpc('aceptar_cotizacion', { p_token: token, p_nombre: nom.value.trim() }).then(function (r) {
          b.disabled = false;
          if (r && r.ok) aceptada(new Date().toISOString()); else err.textContent = (r && r.error) || 'No se pudo registrar. Intenta de nuevo.';
        }).catch(function () { b.disabled = false; err.textContent = 'No se pudo registrar. Revisa tu conexión.'; });
      };
      zona.appendChild(n('p', 'an-k', '¿Quieres empezar?'));
      zona.appendChild(nom); zona.appendChild(err); zona.appendChild(b);
      zona.appendChild(n('small', 'muted', 'Aceptar la propuesta no te cobra nada: es para que te enviemos el contrato.'));
    }
    doc.appendChild(zona);

    var tel = String(q.telefono || '').replace(/\D/g, ''); if (tel.length === 10) tel = '1' + tel;
    if (tel) { $('pregunta').href = 'https://wa.me/' + tel + '?text=' + encodeURIComponent('Hola, tengo una pregunta sobre mi análisis de crédito.'); $('pregunta').hidden = false; }
    $('cargando').hidden = true; doc.hidden = false; $('acciones').hidden = false;
  }).catch(noValido);
})();
