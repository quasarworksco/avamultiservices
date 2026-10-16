/* Panel CRM — Bandeja única: WhatsApp, Instagram y Messenger, mensajes por enviar, respuestas rápidas y automatizaciones.
   Con las APIs conectadas se envía desde aquí; si no, cada envío abre WhatsApp con el texto listo y queda registrado. */
(function () {
  'use strict';
  var A = window.AVA, el = A.el, sb = A.sb;
  var CANALES = { whatsapp: 'WhatsApp', instagram: 'Instagram', messenger: 'Messenger', sms: 'SMS' };
  var TIPOS = { aviso_etapa: 'Cambio de etapa', recordatorio_documentos: 'Documentos', recordatorio_pago: 'Pago', recordatorio_cita: 'Cita', resena: 'Reseña de Google', campana: 'Campaña', franchise_tax: 'Franchise Tax', fuera_horario: 'Fuera de horario', manual: 'Manual' };
  var st = { tab: 'chats', conv: null };
  var ui = {};

  A.wa = function (tel, texto) {
    var d = A.soloDigitos(tel);
    if (d.length === 10) d = '1' + d;
    return 'https://wa.me/' + d + (texto ? '?text=' + encodeURIComponent(texto) : '');
  };

  // Lee el error que devuelve una función de Supabase ({ error, codigo })
  async function leerError(err) {
    try { return await err.context.json(); } catch (_) { return { error: 'No se pudo enviar.' }; }
  }
  function conectado(integ, canal) {
    return canal === 'whatsapp' ? !!integ.whatsapp : (canal === 'messenger' || canal === 'instagram') ? !!integ.meta : false;
  }

  A.contarBandeja = async function () {
    if (!A.puede('mensajes')) return;
    var r = await Promise.all([
      sb.from('conversaciones').select('no_leidos').gt('no_leidos', 0),
      sb.from('cola_mensajes').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente').lte('programado_para', new Date().toISOString())
    ]);
    var n = (r[0].data || []).reduce(function (a, x) { return a + x.no_leidos; }, 0) + (r[1].count || 0);
    var b = document.getElementById('count-ban');
    if (b) b.textContent = n ? n : '';
  };

  A.vista('bandeja', {
    permiso: 'mensajes',
    render: function (cont, params) {
      if (params[0]) st.tab = params[0];
      ui.body = el('div');
      cont.appendChild(A.cabecera('Comunicación', 'Mensajes', 'con tus clientes', []));
      var aviso = el('div');
      cont.appendChild(aviso);
      A.integraciones().then(function (integ) {
        if (integ.whatsapp && integ.meta) return;
        var faltan = !integ.whatsapp && !integ.meta ? 'WhatsApp Business, Instagram y Messenger aún no están conectados.' : !integ.whatsapp ? 'WhatsApp Business aún no está conectado.' : 'Instagram y Messenger aún no están conectados.';
        aviso.appendChild(el('div', { class: 'alert warn', style: 'margin-top:14px' }, [A.icon('i-alert', 'icon-sm'),
          faltan + (integ.whatsapp ? '' : ' Mientras tanto, cada mensaje de WhatsApp se abre en tu WhatsApp con el texto listo y queda registrado aquí.') + ' Tú respondes personalmente: lo automático solo prepara avisos y recordatorios.']));
      });
      ui.tabs = el('div', { class: 'tabs' });
      cont.appendChild(ui.tabs);
      cont.appendChild(ui.body);
      pintarTabs();
    }
  });

  function pintarTabs() {
    ui.tabs.innerHTML = '';
    [['chats', 'Conversaciones'], ['cola', 'Por enviar'], ['rapidas', 'Respuestas rápidas'], ['auto', 'Automatizaciones']].forEach(function (t) {
      if (t[0] === 'auto' && !A.puede('equipo')) return;
      ui.tabs.appendChild(el('button', { type: 'button', class: 'tab' + (st.tab === t[0] ? ' on' : ''), onclick: function () { st.tab = t[0]; history.replaceState(null, '', '#/bandeja/' + t[0]); pintarTabs(); } }, [t[1]]));
    });
    ui.body.innerHTML = '';
    ({ chats: chats, cola: cola, rapidas: rapidas, auto: auto })[st.tab](ui.body);
    A.contarBandeja();
  }

  /* ---------- Conversaciones ---------- */
  async function chats(box) {
    var wrap = el('div', { class: 'inbox' });
    var lista = el('div', { class: 'inbox-list' });
    var panel = el('div', { class: 'inbox-chat' }, [el('div', { class: 'empty' }, [el('b', { text: 'Elige una conversación' }), 'O empieza una nueva con un cliente.'])]);
    wrap.appendChild(lista); wrap.appendChild(panel);
    box.appendChild(el('div', { class: 'tools' }, [el('button', { class: 'btn btn-dark btn-sm', type: 'button', onclick: nuevaConv }, [A.icon('i-plus'), el('span', { text: 'Nueva conversación' })])]));
    box.appendChild(wrap);
    var r = await sb.from('conversaciones').select('*, clientes(id,nombre,apellidos,telefono)').order('ultimo_at', { ascending: false }).limit(300);
    var convs = r.data || [];
    if (!convs.length) lista.appendChild(el('div', { class: 'muted', style: 'padding:16px', text: 'Aún no hay conversaciones. Cuando conectemos WhatsApp, Instagram y Messenger llegarán aquí solas.' }));
    convs.forEach(function (c) {
      var item = el('button', { type: 'button', class: 'conv' + (st.conv === c.id ? ' on' : ''), onclick: function () { st.conv = c.id; lista.querySelectorAll('.conv').forEach(function (x) { x.classList.remove('on'); }); item.classList.add('on'); abrir(c, panel); } }, [
        el('span', { class: 'avatar ch-' + c.canal, text: A.iniciales(c.nombre || c.contacto) }),
        el('span', { class: 'conv-b' }, [el('b', { text: c.nombre || (c.clientes ? A.nombreDe(c.clientes) : c.contacto) }), el('span', { class: 'muted', text: CANALES[c.canal] + ' · ' + (c.ultimo_texto || '') })]),
        el('span', { class: 'conv-m' }, [el('span', { class: 'muted', text: A.hace(c.ultimo_at) }), c.no_leidos ? el('span', { class: 'count', text: c.no_leidos }) : null])
      ]);
      lista.appendChild(item);
      if (st.conv === c.id) abrir(c, panel);
    });
  }

  async function abrir(c, panel) {
    panel.innerHTML = '';
    if (c.no_leidos) { await sb.from('conversaciones').update({ no_leidos: 0 }).eq('id', c.id); A.contarBandeja(); }
    var nombre = c.nombre || (c.clientes ? A.nombreDe(c.clientes) : c.contacto);
    panel.appendChild(el('div', { class: 'chat-h' }, [
      el('div', null, [el('b', { text: nombre }), el('span', { class: 'muted', text: CANALES[c.canal] + ' · ' + c.contacto })]),
      c.cliente_id ? el('a', { class: 'mini-btn', href: '#/clientes/' + c.cliente_id, text: 'Ver ficha' }) : null
    ]));
    var msgs = el('div', { class: 'chat-msgs' });
    panel.appendChild(msgs);
    var r = await sb.from('mensajes_chat').select('*').eq('conversacion_id', c.id).order('created_at').limit(500);
    (r.data || []).forEach(function (m) {
      msgs.appendChild(el('div', { class: 'bub ' + (m.direccion === 'entrante' ? 'in' : 'out') }, [el('p', { text: m.texto }), el('span', { text: A.fecha(m.created_at, true) + (m.automatico ? ' · automático' : '') })]));
    });
    if (!(r.data || []).length) msgs.appendChild(el('div', { class: 'muted', style: 'text-align:center;padding:20px', text: 'Sin mensajes todavía.' }));
    setTimeout(function () { msgs.scrollTop = msgs.scrollHeight; }, 30);

    var integ = await A.integraciones();
    var directo = conectado(integ, c.canal);
    var txt = el('textarea', { class: 'input', placeholder: 'Escribe tu respuesta…', maxlength: 4000, style: 'min-height:70px' });
    var rap = (await sb.from('respuestas_rapidas').select('*').order('orden')).data || [];
    var primerNombre = (c.clientes && c.clientes.nombre) || (c.nombre || '').split(' ')[0] || '';
    var chips = el('div', { class: 'chips', style: 'margin-bottom:8px' }, rap.map(function (q) {
      return el('button', { type: 'button', class: 'chip-s', title: q.texto, text: q.titulo, onclick: function () { txt.value = q.texto.replace(/\{nombre\}/g, primerNombre); txt.focus(); } });
    }));
    panel.appendChild(el('div', { class: 'chat-f' }, [chips, txt, el('div', { class: 'row2', style: 'display:flex;gap:8px;justify-content:flex-end;margin-top:8px' }, [
      el('button', { class: 'btn btn-dark btn-sm', type: 'button', onclick: async function () {
        var t = txt.value.trim(); if (!t) { txt.focus(); return; }
        var boton = this; boton.disabled = true;
        if (directo) {
          var env = await sb.functions.invoke('enviar-mensaje', { body: { conversacion_id: c.id, texto: t } });
          boton.disabled = false;
          if (!env.error) { txt.value = ''; abrir(c, panel); return; }
          var info = await leerError(env.error);
          if (!(info.codigo === 'fuera_ventana' && c.canal === 'whatsapp')) { A.toast(info.error || 'No se pudo enviar.', 'error'); return; }
          if (!confirm('Pasaron más de 24 horas desde su último mensaje, así que WhatsApp no deja escribirle desde el CRM con texto libre. ¿Abrir tu WhatsApp con el mensaje listo?')) return;
        }
        boton.disabled = false;
        if (c.canal === 'whatsapp' || c.canal === 'sms') window.open(A.wa(c.contacto, t), '_blank', 'noopener');
        await sb.from('mensajes_chat').insert({ conversacion_id: c.id, direccion: 'saliente', texto: t });
        await sb.from('conversaciones').update({ ultimo_texto: t.slice(0, 200), ultimo_at: new Date().toISOString() }).eq('id', c.id);
        txt.value = '';
        abrir(c, panel);
      } }, [A.icon('i-send'), el('span', { text: directo ? 'Enviar' : c.canal === 'whatsapp' ? 'Enviar por WhatsApp' : 'Registrar respuesta' })])
    ])]));
  }

  async function nuevaConv() {
    var cl = (await sb.from('clientes').select('id,nombre,apellidos,telefono').order('nombre').limit(5000)).data || [];
    A.modal({
      titulo: 'Nueva conversación', ok: 'Abrir',
      campos: [
        { k: 'cliente_id', label: 'Cliente', type: 'select', full: true, options: [['', 'Otra persona (escribe el número)']].concat(cl.filter(function (c) { return c.telefono; }).map(function (c) { return [c.id, A.nombreDe(c) + ' · ' + c.telefono]; })) },
        { k: 'contacto', label: 'Teléfono (si no es cliente)', type: 'tel', max: 40 },
        { k: 'nombre', label: 'Nombre (si no es cliente)', max: 120 }
      ],
      guardar: async function (d, aviso) {
        var c = cl.filter(function (x) { return x.id === d.cliente_id; })[0];
        var tel = A.soloDigitos(c ? c.telefono : d.contacto);
        if (tel.length < 7) { A.msg(aviso, 'Escribe un teléfono válido.'); return false; }
        var r = await sb.from('conversaciones').upsert({ canal: 'whatsapp', contacto: tel, nombre: c ? A.nombreDe(c) : d.nombre, cliente_id: c ? c.id : null }, { onConflict: 'canal,contacto' }).select('id').single();
        if (r.error) { A.msg(aviso, 'No se pudo crear.'); return false; }
        st.conv = r.data.id; st.tab = 'chats'; pintarTabs();
      }
    });
  }

  /* ---------- Por enviar (cola) ---------- */
  async function cola(box) {
    var r = await sb.from('cola_mensajes').select('*').eq('estado', 'pendiente').order('programado_para').limit(500);
    var lista = r.data || [];
    var ahora = new Date().toISOString();
    var integ = await A.integraciones();
    box.appendChild(el('p', { class: 'muted', style: 'margin:14px 0', text: 'Avisos y recordatorios que el sistema preparó: cambios de etapa, documentos, pagos, citas, reseñas, Franchise Tax y campañas. ' +
      (integ.whatsapp ? 'Toca «Enviar» y sale por WhatsApp Business desde el CRM. Si activas el envío automático (pestaña Automatizaciones), salen solos cada 10 minutos.' : 'Cuando conectemos la API se enviarán solos; por ahora toca «Enviar» y se abre WhatsApp con el mensaje listo.') }));
    if (!lista.length) { box.appendChild(el('div', { class: 'empty' }, [el('b', { text: 'Nada pendiente' }), 'Aquí aparecerán los mensajes automáticos listos para enviar.'])); return; }
    var card = el('div', { class: 'card' });
    lista.forEach(function (m) {
      var futuro = m.programado_para > ahora;
      card.appendChild(el('div', { class: 'qrow' + (futuro ? ' later' : '') }, [
        el('div', { class: 'qrow-b' }, [
          el('div', null, [el('span', { class: 'chip-s', text: TIPOS[m.tipo] }), ' ', el('b', { text: m.nombre || m.telefono }), el('span', { class: 'muted', text: ' · ' + (futuro ? 'programado ' + A.fecha(m.programado_para, true) : A.hace(m.created_at)) })]),
          el('p', { text: m.texto }),
          m.error ? el('p', { class: 'muted', style: 'color:var(--danger,#b4472f);font-size:12.5px', text: 'No se pudo enviar (' + m.intentos + ' intento' + (m.intentos === 1 ? '' : 's') + '): ' + m.error }) : null
        ]),
        el('div', { class: 'qrow-a' }, [
          el('button', { class: 'btn btn-dark btn-sm', type: 'button', onclick: async function () {
            if (integ.whatsapp) {
              this.disabled = true;
              var env = await sb.functions.invoke('enviar-mensaje', { body: { cola_id: m.id } });
              if (env.error) { var info = await leerError(env.error); A.toast(info.error || 'No se pudo enviar.', 'error'); }
              else A.toast('Mensaje enviado.');
              pintarTabs();
              return;
            }
            window.open(A.wa(m.telefono, m.texto), '_blank', 'noopener');
            await sb.from('cola_mensajes').update({ estado: 'enviado', enviado_at: new Date().toISOString() }).eq('id', m.id);
            if (m.cliente_id) await registrarEnChat(m);
            pintarTabs();
          } }, [A.icon('i-send'), el('span', { text: 'Enviar' })]),
          el('button', { class: 'mini-btn', type: 'button', text: 'Descartar', onclick: async function () { await sb.from('cola_mensajes').update({ estado: 'cancelado' }).eq('id', m.id); pintarTabs(); } })
        ])
      ]));
    });
    box.appendChild(card);
  }
  async function registrarEnChat(m) {
    var tel = A.soloDigitos(m.telefono);
    var r = await sb.from('conversaciones').upsert({ canal: 'whatsapp', contacto: tel, nombre: m.nombre, cliente_id: m.cliente_id, ultimo_texto: m.texto.slice(0, 200), ultimo_at: new Date().toISOString() }, { onConflict: 'canal,contacto' }).select('id').single();
    if (r.data) await sb.from('mensajes_chat').insert({ conversacion_id: r.data.id, direccion: 'saliente', texto: m.texto, automatico: true });
  }

  /* ---------- Respuestas rápidas ---------- */
  async function rapidas(box) {
    var r = await sb.from('respuestas_rapidas').select('*').order('orden');
    var card = el('div', { class: 'card', style: 'margin-top:14px' }, [el('div', { class: 'card-h' }, [el('h3', { class: 't', text: 'Respuestas rápidas' }), el('button', { class: 'mini-btn', type: 'button', text: 'Nueva respuesta', onclick: function () { editarRapida(null); } })]),
      el('p', { class: 'muted', style: 'margin-bottom:10px', text: 'Úsalas con un clic dentro de cada conversación. Escribe {nombre} para poner el nombre del cliente.' })]);
    (r.data || []).forEach(function (q) {
      card.appendChild(el('button', { type: 'button', class: 'site-item-b', style: 'display:block;padding:12px 0;border-top:1px solid var(--line);width:100%', onclick: function () { editarRapida(q); } }, [el('b', { text: q.titulo }), el('span', { class: 'muted', text: q.texto })]));
    });
    box.appendChild(card);
  }
  function editarRapida(q) {
    var nuevo = !q; q = q || {};
    A.modal({
      titulo: nuevo ? 'Nueva respuesta rápida' : 'Respuesta rápida',
      campos: [{ k: 'titulo', label: 'Nombre corto', required: true, value: q.titulo, max: 80 }, { k: 'orden', label: 'Orden', type: 'number', value: q.orden || 10 }, { k: 'texto', label: 'Mensaje', type: 'textarea', full: true, required: true, value: q.texto, max: 2000 }],
      guardar: async function (d, aviso) {
        var r = nuevo ? await sb.from('respuestas_rapidas').insert(d) : await sb.from('respuestas_rapidas').update(d).eq('id', q.id);
        if (r.error) { A.msg(aviso, 'No se pudo guardar.'); return false; }
        pintarTabs();
      },
      borrar: nuevo ? null : async function () { await sb.from('respuestas_rapidas').delete().eq('id', q.id); pintarTabs(); }
    });
  }

  /* ---------- Automatizaciones ---------- */
  var AUTOS = [
    ['fuera_horario', 'Respuesta fuera de horario', 'Se envía sola cuando alguien escribe fuera de tu horario o cuando la activas porque no puedes contestar.', []],
    ['aviso_etapa', 'Aviso de cambio de etapa', 'Cuando mueves un caso de etapa, se prepara un aviso para el cliente.', ['nombre', 'servicio', 'etapa']],
    ['recordatorio_documentos', 'Recordatorio de documentos', 'Si a un caso le faltan documentos de su lista (o lleva más de 3 días esperando), se prepara un recordatorio semanal con lo que falta.', ['nombre', 'servicio', 'faltan', 'link_portal']],
    ['recordatorio_pago', 'Recordatorio de pago', '2 días antes de cada cobro mensual.', ['nombre', 'monto', 'servicio', 'fecha']],
    ['recordatorio_cita', 'Recordatorio de cita', 'Un día antes de cada cita.', ['nombre', 'fecha', 'hora']],
    ['resena', 'Pedir reseña de Google', 'Un día después de terminar un caso.', ['nombre', 'link_resena']],
    ['franchise_tax', 'Aviso de Franchise Tax', 'El 1 de abril, a los clientes con LLC.', ['nombre']]
  ];
  async function auto(box) {
    var r = await sb.from('ajustes').select('valor').eq('clave', 'whatsapp').single();
    var cfg = (r.data && r.data.valor) || {};
    var integ = await A.integraciones();
    var envio = el('input', { type: 'checkbox' }); envio.checked = !!cfg.envio_automatico;
    envio.addEventListener('change', guardar);
    var envioCard = el('div', { class: 'card', style: 'margin-top:14px' }, [
      el('div', { class: 'card-h' }, [el('h3', { class: 't', text: 'Envío automático de «Por enviar»' }), el('span', { class: 'switch' }, [envio, el('span')])]),
      el('p', { class: 'muted', text: integ.whatsapp
        ? 'Encendido: cada 10 minutos el CRM envía solo los avisos pendientes por WhatsApp Business. Apagado: tú los revisas y tocas «Enviar». A quien no te haya escrito en 24 horas se le envía con la plantilla aprobada por Meta.'
        : 'Se podrá encender cuando conectemos WhatsApp Business. Mientras tanto los avisos esperan en «Por enviar».' })
    ]);
    if (!integ.whatsapp) envio.disabled = true;
    var grid = el('div', { class: 'auto-grid' });
    AUTOS.forEach(function (a) {
      var c = cfg[a[0]] || {};
      var on = el('input', { type: 'checkbox' }); on.checked = !!c.activo;
      var ta = el('textarea', { class: 'input', maxlength: 1000, style: 'min-height:96px' }); ta.value = c.mensaje || '';
      var extra = null;
      if (a[0] === 'fuera_horario') {
        var h = c.horario || {};
        extra = el('div', { class: 'horario' }, ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(function (dn, i) {
          var k = String(i + 1), v = h[k];
          return el('label', { class: 'h-row' }, [el('span', { text: dn }), el('input', { class: 'input sm', type: 'time', 'data-d': k, 'data-p': '0', value: v ? v[0] : '' }), el('input', { class: 'input sm', type: 'time', 'data-d': k, 'data-p': '1', value: v ? v[1] : '' })]);
        }));
      }
      grid.appendChild(el('div', { class: 'card auto-card', 'data-k': a[0] }, [
        el('div', { class: 'card-h' }, [el('h3', { class: 't', text: a[1] }), el('span', { class: 'switch' }, [on, el('span')])]),
        el('p', { class: 'muted', style: 'margin-bottom:8px', text: a[2] }),
        ta,
        a[3].length ? el('p', { class: 'muted', style: 'margin-top:6px;font-size:12px', text: 'Variables: ' + a[3].map(function (v) { return '{' + v + '}'; }).join(' ') }) : null,
        extra
      ]));
      on.addEventListener('change', guardar); ta.addEventListener('change', guardar);
      if (extra) extra.querySelectorAll('input').forEach(function (i) { i.addEventListener('change', guardar); });
    });
    async function guardar() {
      var n = Object.assign({}, cfg, { envio_automatico: envio.checked });
      grid.querySelectorAll('.auto-card').forEach(function (card) {
        var k = card.dataset.k, o = Object.assign({}, n[k] || {});
        o.activo = card.querySelector('.switch input').checked;
        o.mensaje = card.querySelector('textarea').value;
        if (k === 'fuera_horario') {
          var h = {};
          card.querySelectorAll('.horario input').forEach(function (i) { if (i.value) { (h[i.dataset.d] = h[i.dataset.d] || ['', ''])[i.dataset.p] = i.value; } });
          Object.keys(h).forEach(function (d) { if (!h[d][0] || !h[d][1]) delete h[d]; });
          o.horario = h;
        }
        n[k] = o;
      });
      var u = await sb.from('ajustes').update({ valor: n }).eq('clave', 'whatsapp');
      A.toast(u.error ? 'No se pudo guardar.' : 'Automatizaciones guardadas.', u.error ? 'error' : '');
      if (!u.error) cfg = n;
    }
    box.appendChild(el('p', { class: 'muted', style: 'margin:14px 0', text: 'Tú sigues respondiendo personalmente. Esto solo prepara avisos puntuales; cada uno se puede apagar.' }));
    box.appendChild(envioCard);
    box.appendChild(grid);
  }
})();
