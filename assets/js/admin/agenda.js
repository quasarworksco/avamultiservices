/* Panel CRM — Agenda de citas (las reservas llegan desde avamultiservices.com/citas) */
(function () {
  'use strict';
  var A = window.AVA, el = A.el, sb = A.sb;
  var EST = { solicitada: 'Solicitada', confirmada: 'Confirmada', cancelada: 'Cancelada', completada: 'Completada', no_asistio: 'No asistió' };
  var CLASE = { solicitada: 'pendiente', confirmada: 'activo', cancelada: 'cancelado', completada: 'completado', no_asistio: 'cancelado' };
  var st = { desde: lunes(new Date()) };

  function lunes(d) { d = new Date(d); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; }
  function hora(iso) { return new Date(iso).toLocaleTimeString('es-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }); }
  function diaISO(iso) { return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); }

  A.contarCitas = async function () {
    if (!A.puede('citas')) return;
    var r = await sb.from('citas').select('id', { count: 'exact', head: true }).eq('estado', 'solicitada').gte('inicio', new Date().toISOString());
    var n = document.getElementById('count-cit');
    if (n) n.textContent = r.count ? r.count : '';
  };

  A.vista('agenda', {
    permiso: 'citas',
    render: function (cont) {
      var cuerpo = el('div');
      cont.appendChild(A.cabecera('Citas', 'Agenda', 'de la semana', [
        el('a', { class: 'btn btn-ghost btn-sm', href: '../citas/', target: '_blank', rel: 'noopener' }, [A.icon('i-external'), el('span', { text: 'Página de reservas' })]),
        el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: googleCalendar }, [A.icon('i-calendar'), el('span', { text: 'Google Calendar' })]),
        el('button', { class: 'btn btn-dark btn-sm', type: 'button', onclick: function () { editar(null, pintar); } }, [A.icon('i-plus'), el('span', { text: 'Nueva cita' })])
      ]));
      cont.appendChild(el('div', { class: 'alert ok', style: 'margin-top:14px' }, [A.icon('i-calendar', 'icon-sm'), 'Tus clientes reservan en avamultiservices.com/citas según tu horario. Reciben recordatorio un día antes. Para ver tus citas en el celular, toca «Google Calendar».']));
      cont.appendChild(cuerpo);
      async function pintar() {
        var fin = new Date(st.desde); fin.setDate(fin.getDate() + 7);
        var r = await sb.from('citas').select('*').gte('inicio', st.desde.toISOString()).lt('inicio', fin.toISOString()).order('inicio');
        cuerpo.innerHTML = '';
        var nav = el('div', { class: 'card-h', style: 'margin-top:18px' }, [
          el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Semana anterior', onclick: function () { st.desde.setDate(st.desde.getDate() - 7); pintar(); } }, [A.icon('i-chevron-left', 'icon-sm')]),
          el('h3', { class: 'cal-title', text: 'Semana del ' + st.desde.toLocaleDateString('es-US', { day: 'numeric', month: 'long' }) }),
          el('button', { class: 'icon-btn', type: 'button', style: 'transform:scaleX(-1)', 'aria-label': 'Semana siguiente', onclick: function () { st.desde.setDate(st.desde.getDate() + 7); pintar(); } }, [A.icon('i-chevron-left', 'icon-sm')])
        ]);
        cuerpo.appendChild(nav);
        var semana = el('div', { class: 'week' });
        for (var i = 0; i < 7; i++) {
          var d = new Date(st.desde); d.setDate(d.getDate() + i);
          var iso = d.toLocaleDateString('en-CA');
          var col = el('div', { class: 'week-d' + (iso === A.hoyISO() ? ' today' : '') }, [el('div', { class: 'week-h' }, [el('span', { text: d.toLocaleDateString('es-US', { weekday: 'short' }) }), el('b', { text: d.getDate() })])]);
          (r.data || []).filter(function (c) { return diaISO(c.inicio) === iso; }).forEach(function (c) {
            col.appendChild(el('button', { type: 'button', class: 'cita c-' + c.estado, onclick: function () { editar(c, pintar); } }, [el('b', { text: hora(c.inicio) }), el('span', { text: c.nombre }), el('span', { class: 'muted', text: c.servicio || '' })]));
          });
          semana.appendChild(col);
        }
        cuerpo.appendChild(semana);
        A.contarCitas();
      }
      pintar();
    }
  });

  /* Enlace privado para suscribirse a las citas desde Google Calendar (se actualiza solo) */
  var FUNC = 'https://szmkcwtkorsndvmxywai.supabase.co/functions/v1/calendario?t=';
  async function googleCalendar() {
    var r = await sb.rpc('mi_calendario');
    if (r.error || !r.data) { A.toast('No se pudo crear tu enlace de calendario.', 'error'); return; }
    var caja = el('div', { class: 'gcal' });
    function pintar(token) {
      var url = FUNC + token;
      caja.innerHTML = '';
      caja.appendChild(el('div', { class: 'gcal-top' }, [
        el('span', { class: 'gcal-logo' }, [A.icon('i-calendar')]),
        el('div', null, [el('b', { text: 'Tus citas del CRM en Google Calendar' }), el('div', { class: 'muted', text: 'Aparecen en tu celular y computadora con aviso 30 minutos antes. Se actualizan solas.' })])
      ]));
      caja.appendChild(el('label', { class: 'gcal-l', text: 'Tu enlace privado' }));
      var inp = el('input', { class: 'input sm', readonly: true, value: url, onclick: function () { this.select(); } });
      caja.appendChild(el('div', { class: 'gcal-url' }, [inp,
        el('button', { class: 'btn btn-dark btn-sm', type: 'button', onclick: function () { navigator.clipboard.writeText(url).then(function () { A.toast('Enlace copiado. Ahora pégalo en Google Calendar.'); }); } }, [A.icon('i-copy', 'icon-sm'), el('span', { text: 'Copiar' })])
      ]));
      var pasos = [
        ['Copia tu enlace', 'Con el botón «Copiar» de arriba.'],
        ['Abre Google Calendar en la computadora', 'En calendar.google.com, a la izquierda, junto a «Otros calendarios», toca el signo + y elige «Desde URL».'],
        ['Pega el enlace y toca «Agregar calendario»', 'Aparece «Citas AVA». Puedes cambiarle el color en sus opciones.'],
        ['Listo en el celular también', 'En la app de Google Calendar entra a Configuración → Citas AVA y activa «Sincronizar».']
      ];
      caja.appendChild(el('ol', { class: 'gcal-pasos' }, pasos.map(function (x, i) {
        return el('li', { style: 'animation-delay:' + (i * 80) + 'ms' }, [el('span', { class: 'gcal-n', text: String(i + 1) }), el('div', null, [el('b', { text: x[0] }), el('div', { class: 'muted', text: x[1] })])]);
      })));
      caja.appendChild(el('a', { class: 'btn btn-ghost btn-sm', href: 'https://calendar.google.com/calendar/u/0/r/settings/addbyurl', target: '_blank', rel: 'noopener', style: 'margin-top:12px' }, [A.icon('i-external', 'icon-sm'), el('span', { text: 'Abrir Google Calendar' })]));
      caja.appendChild(el('p', { class: 'gcal-nota' }, [A.icon('i-lock', 'icon-sm'), el('span', { text: 'Google revisa el enlace cada pocas horas, así que una cita nueva puede tardar en aparecer. El enlace es solo tuyo: no lo compartas. Si se filtra, crea uno nuevo y el anterior deja de funcionar.' })]));
      caja.appendChild(el('button', { class: 'link-btn', type: 'button', text: 'Crear un enlace nuevo', onclick: async function () {
        if (!confirm('El enlace actual dejará de funcionar y tendrás que agregar el nuevo en Google Calendar. ¿Continuar?')) return;
        var n = await sb.rpc('mi_calendario', { regenerar: true });
        if (n.error || !n.data) { A.toast('No se pudo crear el enlace.', 'error'); return; }
        A.toast('Enlace nuevo creado.'); pintar(n.data);
      } }));
    }
    pintar(r.data);
    A.modal({ titulo: 'Google Calendar', ok: 'Listo', campos: [], extra: caja, guardar: function () {} });
  }

  async function editar(c, alGuardar) {
    var nueva = !c; c = c || {};
    var cfg = await A.recordar('config_citas', function () { return sb.rpc('config_citas').then(function (r) { return r.data || {}; }); });
    var iniLocal = c.inicio ? new Date(c.inicio).toLocaleString('sv-SE', { timeZone: 'America/Chicago' }).slice(0, 16).replace(' ', 'T') : '';
    var m = A.modal({
      titulo: nueva ? 'Nueva cita' : 'Cita de ' + c.nombre,
      campos: [
        { k: 'nombre', label: 'Nombre', required: true, max: 120, value: c.nombre },
        { k: 'telefono', label: 'Teléfono', type: 'tel', required: true, max: 40, value: c.telefono },
        { k: 'email', label: 'Correo', type: 'email', value: c.email },
        { k: 'servicio', label: 'Servicio', type: 'select', value: c.servicio || '', options: (cfg.servicios || ['Otro']).map(function (s) { return [s, s]; }) },
        { k: 'inicio', label: 'Fecha y hora (Dallas)', type: 'datetime-local', required: true, value: iniLocal },
        { k: 'estado', label: 'Estado', type: 'select', value: c.estado || 'confirmada', options: Object.keys(EST).map(function (k) { return [k, EST[k]]; }) },
        { k: 'notas', label: 'Notas', type: 'textarea', full: true, max: 1000, value: c.notas }
      ],
      extra: !nueva && c.telefono ? el('div', { class: 'quick', style: 'margin-top:12px' }, [el('a', { href: A.wa ? A.wa(c.telefono, 'Hola ' + c.nombre.split(' ')[0] + ', te escribe AVA Multiservices sobre tu cita del ' + A.fecha(c.inicio, true) + '.') : '#', target: '_blank', rel: 'noopener' }, [A.icon('i-whatsapp'), 'Escribirle'])]) : null,
      guardar: async function (d, aviso) {
        var ini = aChicago(d.inicio);
        if (!ini) { A.msg(aviso, 'Revisa la fecha y hora.'); return false; }
        d.inicio = ini.toISOString();
        d.fin = new Date(ini.getTime() + (cfg.duracion || 30) * 60000).toISOString();
        if (nueva) d.origen = 'panel';
        var r = nueva ? await sb.from('citas').insert(d) : await sb.from('citas').update(d).eq('id', c.id);
        if (r.error) { A.msg(aviso, 'No se pudo guardar.'); return false; }
        A.toast('Cita guardada.'); alGuardar();
      },
      borrar: nueva ? null : async function () { await sb.from('citas').delete().eq('id', c.id); alGuardar(); }
    });
    return m;
  }

  /* Convierte "AAAA-MM-DDTHH:MM" en hora de Dallas a Date */
  function aChicago(v) {
    if (!v) return null;
    var guess = new Date(v + ':00Z');
    var enChicago = new Date(guess.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    var enUTC = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
    return new Date(guess.getTime() + (enUTC - enChicago));
  }
  A.aChicago = aChicago;
})();
