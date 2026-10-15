/* AVA Multiservices — Reserva de citas en línea (horario y cupos vienen del panel) */
(function () {
  'use strict';
  var API = 'https://szmkcwtkorsndvmxywai.supabase.co/rest/v1/rpc/';
  var KEY = 'sb_publishable_Ri5Pcd0a9dphA8W5qJ2YvQ_veqm7I26';
  var H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
  var $ = function (id) { return document.getElementById(id); };
  var st = { servicio: null, dia: null, hora: null };
  var cfg = null, ocupadas = [];

  function rpc(fn, body) {
    return fetch(API + fn, { method: 'POST', headers: H, body: JSON.stringify(body || {}) }).then(function (r) {
      return r.json().then(function (j) { if (!r.ok) throw new Error(j && j.message || 'Error'); return j; });
    });
  }
  function btn(cls, txt, on) { var b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = txt; b.addEventListener('click', on); return b; }

  /* "AAAA-MM-DD" + "HH:MM" en hora de Dallas → Date */
  function enZona(fecha, hora) {
    var guess = new Date(fecha + 'T' + hora + ':00Z');
    var z = new Date(guess.toLocaleString('en-US', { timeZone: cfg.zona }));
    var u = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
    return new Date(guess.getTime() + (u - z));
  }
  function hoyZona(offset) {
    var d = new Date(Date.now() + offset * 86400000);
    return d.toLocaleDateString('en-CA', { timeZone: cfg.zona });
  }
  function dow(iso) { var d = new Date(iso + 'T12:00:00Z'); return ((d.getUTCDay() + 6) % 7) + 1; }

  rpc('config_citas').then(function (c) {
    cfg = c || {};
    cfg.zona = cfg.zona || 'America/Chicago';
    (cfg.servicios || ['Consulta']).forEach(function (s) {
      $('servicios').appendChild(btn('opt', s, function () { st.servicio = s; marcar('#servicios .opt', this); }));
    });
    var desde = new Date().toISOString(), hasta = new Date(Date.now() + (cfg.dias_max || 30) * 86400000).toISOString();
    return rpc('citas_ocupadas', { p_desde: desde, p_hasta: hasta });
  }).then(function (o) {
    ocupadas = (o || []).map(function (x) { return [new Date(x.inicio).getTime(), new Date(x.fin).getTime()]; });
    for (var i = 0; i <= (cfg.dias_max || 30); i++) {
      var iso = hoyZona(i), h = cfg.horario && cfg.horario[String(dow(iso))];
      var d = new Date(iso + 'T12:00:00Z');
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'day';
      b.innerHTML = '<span>' + d.toLocaleDateString('es-US', { weekday: 'short', timeZone: 'UTC' }) + '</span><b>' + d.getUTCDate() + '</b><span>' + d.toLocaleDateString('es-US', { month: 'short', timeZone: 'UTC' }) + '</span>';
      b.disabled = !h || slots(iso).length === 0;
      (function (iso) { b.addEventListener('click', function () { st.dia = iso; st.hora = null; marcar('#dias .day', this); pintarHoras(); }); })(iso);
      $('dias').appendChild(b);
    }
  }).catch(function () {
    $('err').textContent = 'No pudimos cargar la agenda. Escríbenos por WhatsApp al +1 786 816 2430.'; $('err').hidden = false;
  });

  function slots(iso) {
    var h = cfg.horario && cfg.horario[String(dow(iso))];
    if (!h) return [];
    var dur = cfg.duracion || 30, min = Date.now() + (cfg.anticipacion_horas || 12) * 3600000, out = [];
    var p = h[0].split(':'), q = h[1].split(':');
    for (var t = +p[0] * 60 + +p[1]; t + dur <= +q[0] * 60 + +q[1]; t += dur) {
      var hh = String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
      var ini = enZona(iso, hh).getTime(), fin = ini + dur * 60000;
      if (ini < min) continue;
      if (ocupadas.some(function (o) { return o[0] < fin && o[1] > ini; })) continue;
      out.push([hh, new Date(ini)]);
    }
    return out;
  }
  function pintarHoras() {
    var box = $('horas'); box.innerHTML = '';
    slots(st.dia).forEach(function (s) {
      var etiqueta = s[1].toLocaleTimeString('es-US', { hour: 'numeric', minute: '2-digit', timeZone: cfg.zona });
      box.appendChild(btn('opt', etiqueta, function () { st.hora = s[1]; marcar('#horas .opt', this); }));
    });
    if (!box.children.length) box.innerHTML = '<p style="color:var(--muted)">No quedan horarios este día. Elige otro.</p>';
  }
  function marcar(sel, el) { document.querySelectorAll(sel).forEach(function (x) { x.classList.toggle('on', x === el); }); }

  $('f').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('err'); err.hidden = true;
    var nombre = $('nombre').value.trim(), tel = $('telefono').value.trim();
    var falta = !st.servicio ? 'Elige un servicio.' : !st.dia ? 'Elige un día.' : !st.hora ? 'Elige una hora.' : nombre.length < 2 ? 'Escribe tu nombre.' : tel.replace(/\D/g, '').length < 7 ? 'Escribe un teléfono válido.' : '';
    if (falta) { err.textContent = falta; err.hidden = false; return; }
    var b = $('enviar'); b.disabled = true; b.classList.add('loading');
    rpc('reservar_cita', { p_nombre: nombre, p_telefono: tel, p_email: $('email').value.trim(), p_servicio: st.servicio, p_inicio: st.hora.toISOString(), p_notas: $('notas').value.trim() })
      .then(function () {
        var cuando = st.hora.toLocaleString('es-US', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: cfg.zona });
        $('resumen').innerHTML = '';
        [['Servicio', st.servicio], ['Cuándo', cuando + ' (hora de Dallas)'], ['A nombre de', nombre]].forEach(function (r) {
          var p = document.createElement('p'); var s = document.createElement('b'); s.textContent = r[0] + ': '; p.appendChild(s); p.appendChild(document.createTextNode(r[1])); $('resumen').appendChild(p);
        });
        var fin = new Date(st.hora.getTime() + (cfg.duracion || 30) * 60000);
        var f = function (d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };
        var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AVA Multiservices//Citas//ES', 'BEGIN:VEVENT', 'UID:' + Date.now() + '@avamultiservices.com', 'DTSTAMP:' + f(new Date()), 'DTSTART:' + f(st.hora), 'DTEND:' + f(fin), 'SUMMARY:Cita AVA Multiservices · ' + st.servicio, 'LOCATION:Dallas, TX', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
        $('ics').href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
        $('f').hidden = true; $('ok').hidden = false; window.scrollTo({ top: 0, behavior: 'smooth' });
      })
      .catch(function (x) {
        b.disabled = false; b.classList.remove('loading');
        err.textContent = /reservado|disponible|horario/i.test(x.message) ? 'Ese horario acaba de ocuparse. Elige otro, por favor.' : 'No pudimos reservar. Inténtalo de nuevo o escríbenos por WhatsApp.';
        err.hidden = false;
      });
  });
})();
