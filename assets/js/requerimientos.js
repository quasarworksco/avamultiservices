/* Propuesta CRM — envío de requerimientos de la clienta a Supabase (solo inserción) */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://szmkcwtkorsndvmxywai.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_Ri5Pcd0a9dphA8W5qJ2YvQ_veqm7I26';

  var form = document.getElementById('req-form');
  if (!form) return;
  var btn = document.getElementById('rq-send');
  var status = form.querySelector('.rq-status');
  var $ = function (id) { return document.getElementById(id); };
  var val = function (id) { return ($(id).value || '').trim(); };
  var checked = function (name) {
    return Array.prototype.map.call(form.querySelectorAll('input[name="' + name + '"]:checked'), function (c) { return c.value; });
  };

  function invalid(el, bad) { el.closest('.field').classList.toggle('invalid', bad); }
  ['rq-nombre', 'rq-req'].forEach(function (id) { $(id).addEventListener('input', function () { invalid($(id), false); }); });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (form.querySelector('[name="_honey"]').value) return;
    var okNombre = val('rq-nombre').length >= 2;
    var okReq = val('rq-req').length >= 10;
    invalid($('rq-nombre'), !okNombre);
    invalid($('rq-req'), !okReq);
    if (!okNombre || !okReq) {
      (okNombre ? $('rq-req') : $('rq-nombre')).focus();
      return;
    }

    btn.classList.add('loading');
    btn.disabled = true;
    status.className = 'rq-status';

    var datos = {
      nombre: val('rq-nombre'),
      email: val('rq-email') || null,
      plan_pago: (form.querySelector('input[name="plan"]:checked') || {}).value || 'por_definir',
      modulos: checked('mod'),
      extras: checked('ext'),
      requerimientos: val('rq-req'),
      servicios: val('rq-serv') || null,
      equipo: val('rq-equipo') || null,
      control_actual: val('rq-control') || null,
      fecha_deseada: val('rq-fecha') || null
    };

    fetch(SUPABASE_URL + '/rest/v1/requerimientos_crm', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(datos)
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      form.hidden = true;
      $('req-done').hidden = false;
      $('req-done').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }).catch(function () {
      btn.classList.remove('loading');
      btn.disabled = false;
      status.textContent = 'No pudimos enviar tus requerimientos. Revisa tu conexión e inténtalo de nuevo.';
      status.className = 'rq-status show error';
    });
  });
})();
