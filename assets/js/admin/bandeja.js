/* Panel CRM — Bandeja única: WhatsApp, Instagram y Messenger, mensajes por enviar, respuestas rápidas y automatizaciones.
   Con las APIs conectadas se envía desde aquí; si no, cada envío abre WhatsApp con el texto listo y queda registrado. */
(function () {
  'use strict';
  var A = window.AVA, el = A.el, sb = A.sb;
  var CANAL = {
    whatsapp: { n: 'WhatsApp', ic: 'i-whatsapp', relleno: true },
    messenger: { n: 'Messenger', ic: 'i-messenger', relleno: true },
    instagram: { n: 'Instagram', ic: 'i-instagram' },
    sms: { n: 'SMS', ic: 'i-message' }
  };
  var TIPOS = { aviso_etapa: 'Cambio de etapa', recordatorio_documentos: 'Documentos', recordatorio_pago: 'Pago', recordatorio_cita: 'Cita', resena: 'Reseña de Google', campana: 'Campaña', franchise_tax: 'Franchise Tax', fuera_horario: 'Fuera de horario', manual: 'Manual' };
  var st = { tab: 'chats', conv: null, canal: 'todos', etapa: 'todas' };
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
    document.title = (n ? '(' + n + ') ' : '') + document.title.replace(/^\(\d+\) /, '');
  };

  /* ---------- Avisos al instante: los mensajes nuevos llegan solos y suenan ---------- */
  var rt = null, visto = {}, audio = null;
  function sonidoActivo() { try { return localStorage.getItem('ava-sonido') !== 'no'; } catch (_) { return true; } }
  // El navegador solo deja sonar después de que la persona tocó la página una vez
  function prepararAudio() {
    if (audio || !(window.AudioContext || window.webkitAudioContext)) return;
    audio = new (window.AudioContext || window.webkitAudioContext)();
  }
  ['pointerdown', 'keydown'].forEach(function (ev) { document.addEventListener(ev, prepararAudio, { once: true, capture: true }); });
  function sonar() {
    if (!sonidoActivo() || !audio) return;
    if (audio.state === 'suspended') audio.resume();
    var t = audio.currentTime;
    [[880, 0], [1320, 0.13]].forEach(function (n) {
      var o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine'; o.frequency.value = n[0];
      g.gain.setValueAtTime(0.0001, t + n[1]);
      g.gain.exponentialRampToValueAtTime(0.18, t + n[1] + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + n[1] + 0.35);
      o.connect(g); g.connect(audio.destination);
      o.start(t + n[1]); o.stop(t + n[1] + 0.4);
    });
  }
  A.escucharBandeja = function () {
    if (rt || !A.puede('mensajes')) return;
    rt = sb.channel('bandeja-avisos').on('postgres_changes', { event: '*', schema: 'public', table: 'conversaciones' }, function (p) {
      var c = p.new || {};
      window.dispatchEvent(new CustomEvent('ava:conversacion', { detail: c }));
      // Solo avisa de mensajes recién llegados (no de cambios de etapa ni de marcar como leído)
      if (!c.id || !c.ultimo_entrante_at || !c.no_leidos || visto[c.id] === c.ultimo_entrante_at) return;
      visto[c.id] = c.ultimo_entrante_at;
      if (Date.now() - new Date(c.ultimo_entrante_at).getTime() > 5 * 60000) return;
      var canal = (CANAL[c.canal] || CANAL.sms).n;
      sonar();
      A.contarBandeja();
      if (location.hash.indexOf('#/bandeja') !== 0) A.toast('Nuevo mensaje de ' + (c.nombre || 'un contacto') + ' por ' + canal, 'ok');
      if (document.hidden && window.Notification && Notification.permission === 'granted' && sonidoActivo()) {
        try { new Notification('Nuevo mensaje · ' + canal, { body: (c.nombre ? c.nombre + ': ' : '') + (c.ultimo_texto || ''), tag: c.id, icon: '/assets/img/favicon.svg' }); } catch (_) { /* */ }
      }
    }).subscribe();
  };
  function botonSonido() {
    var b = el('button', { type: 'button', class: 'btn btn-ghost btn-sm' });
    function pintar() {
      b.innerHTML = '';
      b.appendChild(A.icon(sonidoActivo() ? 'i-bell' : 'i-bell-off', 'icon-sm' + (sonidoActivo() ? ' ico-bell' : '')));
      b.appendChild(el('span', { text: sonidoActivo() ? 'Sonido activado' : 'Sonido apagado' }));
      b.title = sonidoActivo() ? 'Suena cuando llega un mensaje nuevo. Toca para silenciar.' : 'Toca para que suene cuando llegue un mensaje.';
    }
    b.addEventListener('click', function () {
      var on = !sonidoActivo();
      try { localStorage.setItem('ava-sonido', on ? 'si' : 'no'); } catch (_) { /* */ }
      prepararAudio();
      if (on) { sonar(); if (window.Notification && Notification.permission === 'default') Notification.requestPermission(); }
      pintar();
    });
    pintar();
    return b;
  }

  A.vista('bandeja', {
    permiso: 'mensajes',
    render: function (cont, params) {
      if (params[0]) st.tab = params[0];
      if (params[0] === 'chats' && params[1]) { st.conv = params[1]; st.canal = 'todos'; st.etapa = 'todas'; }
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
  // Cada canal con su logo y su color para reconocerlo de un vistazo
  function logo(canal, cls) {
    var c = CANAL[canal] || CANAL.sms;
    return A.icon(c.ic, (cls || '') + (c.relleno ? ' icon-fill' : ''));
  }
  function pastilla(canal) {
    return el('span', { class: 'ch-pill ch-' + canal }, [logo(canal, 'icon-sm'), el('span', { text: (CANAL[canal] || CANAL.sms).n })]);
  }
  var ETAPAS = { nuevo: 'Nuevo', interesado: 'Interesado', cita: 'Cita agendada', cliente: 'Cliente', no_interesado: 'No interesado' };
  var FILTROS_ETAPA = [['todas', 'Todas las etapas'], ['sin_responder', 'Sin responder'], ['seguimiento', 'Toca seguimiento'], ['calientes', 'Calientes (IA)'], ['prospectos', 'Prospectos activos'], ['nuevo', 'Nuevos'], ['interesado', 'Interesados'], ['cita', 'Con cita agendada'], ['cliente', 'Clientes'], ['no_interesado', 'No interesados']];
  // Escribió y nadie le ha contestado todavía
  // Qué tan interesado está, según la IA
  var TEMP = { caliente: ['i-flame', 'Caliente'], tibio: ['i-sun', 'Tibio'], frio: ['i-snow', 'Frío'] };
  function pastillaTemp(k, extra) { var t = TEMP[k] || TEMP.tibio; return el('span', Object.assign({ class: 'tp tp-' + (TEMP[k] ? k : 'tibio') }, extra || {}), [A.icon(t[0], 'icon-sm'), t[1]]); }
  function chipTemp(c) { return TEMP[c.temperatura] ? pastillaTemp(c.temperatura, { title: 'Interés según la IA' + (c.ia && c.ia.motivo ? ': ' + c.ia.motivo : '') }) : null; }
  function sinResponder(c) { return !!c.ultimo_entrante_at && (!c.ultimo_saliente_at || c.ultimo_saliente_at < c.ultimo_entrante_at); }
  function pasaEtapa(c) {
    if (st.etapa === 'todas') return true;
    if (st.etapa === 'sin_responder') return sinResponder(c) && c.etapa !== 'no_interesado';
    if (st.etapa === 'prospectos') return ['nuevo', 'interesado', 'cita'].indexOf(c.etapa) >= 0;
    if (st.etapa === 'calientes') return c.temperatura === 'caliente' && c.etapa !== 'no_interesado';
    if (st.etapa === 'seguimiento') return enSeguimiento(c);
    return c.etapa === st.etapa;
  }
  // Prospecto que no ha cerrado y ya le tocó seguimiento (día 2, 5, 7…)
  function enSeguimiento(c) { return (c.seguimientos || []).length && !c.cliente_id && ['nuevo', 'interesado', 'cita'].indexOf(c.etapa) !== -1; }
  function chipSeg(c) { return enSeguimiento(c) ? el('span', { class: 'seg-chip', title: 'Le tocó seguimiento y aún no cierra' }, [A.icon('i-clock', 'icon-sm'), 'Seguimiento día ' + Math.max.apply(null, c.seguimientos)]) : null; }
  function chipEtapa(etapa) { return el('span', { class: 'et et-' + etapa, text: ETAPAS[etapa] || etapa }); }
  function nombreConv(c) {
    if (c.nombre) return c.nombre;
    if (c.clientes) return A.nombreDe(c.clientes);
    return c.canal === 'whatsapp' || c.canal === 'sms' ? '+' + c.contacto : 'Contacto de ' + (CANAL[c.canal] || CANAL.sms).n;
  }
  // En Messenger e Instagram el «contacto» es un número interno de Meta: no se muestra
  function detalleConv(c) {
    if (c.canal === 'whatsapp' || c.canal === 'sms') return '+' + c.contacto;
    if (c.canal === 'instagram') return 'Mensaje directo de Instagram';
    return 'Mensaje de la página de Facebook';
  }
  function avatarConv(c) {
    return el('span', { class: 'conv-av' }, [
      el('span', { class: 'avatar ch-' + c.canal, text: A.iniciales(nombreConv(c).replace(/^[@+]/, '')) }),
      el('span', { class: 'ch-badge ch-' + c.canal, title: (CANAL[c.canal] || CANAL.sms).n }, [logo(c.canal)])
    ]);
  }

  async function chats(box) {
    var wrap = el('div', { class: 'inbox' });
    var lista = el('div', { class: 'inbox-list' });
    var panel = el('div', { class: 'inbox-chat' }, [el('div', { class: 'empty' }, [el('b', { text: 'Elige una conversación' }), 'O empieza una nueva con un cliente.'])]);
    var filtros = el('div', { class: 'ch-filtros', role: 'tablist', 'aria-label': 'Filtrar por canal' });
    var items = el('div');
    var selEtapa = el('select', { class: 'input sm et-filtro', 'aria-label': 'Filtrar por etapa' }, FILTROS_ETAPA.map(function (f) { return el('option', { value: f[0], text: f[1] }); }));
    selEtapa.value = st.etapa;
    selEtapa.addEventListener('change', function () { st.etapa = selEtapa.value; pintarFiltros(); pintarLista(); });
    lista.appendChild(el('div', { class: 'inbox-fil' }, [filtros, el('div', { class: 'et-fil' }, [selEtapa])])); lista.appendChild(items);
    wrap.appendChild(lista); wrap.appendChild(panel);
    box.appendChild(el('div', { class: 'tools' }, [el('button', { class: 'btn btn-dark btn-sm', type: 'button', onclick: nuevaConv }, [A.icon('i-plus'), el('span', { text: 'Nueva conversación' })]), botonSonido()]));
    box.appendChild(wrap);
    var convs = [], firma = '';

    function pintarFiltros() {
      filtros.innerHTML = '';
      [['todos', 'Todos'], ['whatsapp', 'WhatsApp'], ['messenger', 'Messenger'], ['instagram', 'Instagram']].forEach(function (f) {
        var de = convs.filter(function (c) { return (f[0] === 'todos' || c.canal === f[0]) && pasaEtapa(c); });
        var sinLeer = de.reduce(function (a, c) { return a + (c.no_leidos || 0); }, 0);
        filtros.appendChild(el('button', { type: 'button', role: 'tab', 'aria-selected': String(st.canal === f[0]), class: 'ch-f ch-' + f[0] + (st.canal === f[0] ? ' on' : ''), title: f[1], 'aria-label': f[1], onclick: function () { st.canal = f[0]; pintarFiltros(); pintarLista(); } }, [
          f[0] === 'todos' ? null : logo(f[0], 'icon-sm'), el('span', { text: f[1] }), sinLeer ? el('span', { class: 'count', text: sinLeer }) : null
        ]));
      });
    }
    function pintarLista() {
      items.innerHTML = '';
      var vis = convs.filter(function (c) { return (st.canal === 'todos' || c.canal === st.canal) && pasaEtapa(c); });
      if (!vis.length) {
        items.appendChild(el('div', { class: 'muted', style: 'padding:16px', text: !convs.length ? 'Aún no hay conversaciones. Los mensajes de WhatsApp, Instagram y Messenger llegarán aquí solos.' : st.etapa === 'sin_responder' ? '¡Todo respondido! No hay nadie esperando respuesta.' : 'No hay conversaciones con este filtro.' }));
        return;
      }
      vis.forEach(function (c) {
        var item = el('button', { type: 'button', class: 'conv ch-' + c.canal + (st.conv === c.id ? ' on' : '') + (c.no_leidos ? ' nueva' : ''), onclick: function () {
          st.conv = c.id; items.querySelectorAll('.conv').forEach(function (x) { x.classList.remove('on'); }); item.classList.add('on', 'abierta');
          if (c.no_leidos) { c.no_leidos = 0; item.classList.remove('nueva'); var n = item.querySelector('.count'); if (n) n.remove(); pintarFiltros(); }
          abrir(c, panel, wrap);
        } }, [
          avatarConv(c),
          el('span', { class: 'conv-b' }, [el('b', { text: nombreConv(c) }), el('span', { class: 'conv-t' }, [el('span', { class: 'ch-txt ch-' + c.canal, text: CANAL[c.canal] ? CANAL[c.canal].n : 'SMS' }), el('span', { class: 'muted', text: ' · ' + (c.ultimo_texto || '') })]),
            el('span', { class: 'conv-e' }, [chipEtapa(c.etapa), chipTemp(c), chipSeg(c), c.servicio && A.SERVICIOS[c.servicio] ? el('span', { class: 'muted', text: A.SERVICIOS[c.servicio].corto }) : null, sinResponder(c) && c.etapa !== 'no_interesado' ? el('span', { class: 'sr', text: 'Sin responder' }) : null])]),
          el('span', { class: 'conv-m' }, [el('span', { class: 'muted', text: A.hace(c.ultimo_at) }), c.no_leidos ? el('span', { class: 'count', text: c.no_leidos }) : null])
        ]);
        items.appendChild(item);
      });
    }
    async function cargar(primera) {
      var r = await sb.from('conversaciones').select('*, clientes(id,nombre,apellidos,telefono)').order('ultimo_at', { ascending: false }).limit(300);
      if (r.error) return;
      var f = (r.data || []).map(function (c) { return [c.id, c.ultimo_at, c.no_leidos, c.nombre, c.etapa, c.servicio, c.asignado_a, c.ultimo_saliente_at, c.cliente_id].join(','); }).join('|');
      if (!primera && f === firma) return;
      firma = f; convs = r.data || [];
      pintarFiltros(); pintarLista();
      var abierta = convs.filter(function (c) { return c.id === st.conv; })[0];
      // Primera vez: abre la conversación guardada. Después: solo se recarga si llegó algo nuevo a la abierta.
      // También se refresca cuando la IA termina de analizar la conversación abierta
      if (abierta && (primera || abierta.no_leidos || abierta.ia_at !== st.iaVista)) abrir(abierta, panel, wrap, !primera);
      A.contarBandeja();
    }
    ui.recargar = function () { cargar(false); };
    await cargar(true);
    // Los mensajes nuevos llegan al instante (Realtime); cada 60 s se revisa por si acaso
    var espera = null;
    function alCambiar() {
      if (!document.body.contains(wrap)) { window.removeEventListener('ava:conversacion', alCambiar); return; }
      clearTimeout(espera); espera = setTimeout(function () { cargar(false); }, 250);
    }
    window.addEventListener('ava:conversacion', alCambiar);
    var t = setInterval(function () {
      if (!document.body.contains(wrap)) { clearInterval(t); return; }
      if (!document.hidden) cargar(false);
    }, 60000);
  }

  async function abrir(c, panel, wrap, refresco) {
    var borrador = refresco && panel.querySelector('textarea') ? panel.querySelector('textarea').value : '';
    // Al refrescar, se arma aparte y se cambia de una vez (sin parpadeo)
    var dst = refresco ? document.createDocumentFragment() : panel;
    if (!refresco) panel.innerHTML = '';
    if (wrap) wrap.classList.add('con-chat');
    if (c.no_leidos) { c.no_leidos = 0; await sb.from('conversaciones').update({ no_leidos: 0 }).eq('id', c.id); A.contarBandeja(); }
    var nombre = nombreConv(c);
    var enlace = c.canal === 'messenger' ? 'https://business.facebook.com/latest/inbox/messenger' : c.canal === 'instagram' ? 'https://business.facebook.com/latest/inbox/instagram_direct' : null;
    panel.className = 'inbox-chat ch-' + c.canal;
    dst.appendChild(el('div', { class: 'chat-h' }, [
      el('button', { type: 'button', class: 'icon-btn chat-volver', 'aria-label': 'Volver a la lista', onclick: function () { wrap.classList.remove('con-chat'); } }, [A.icon('i-chevron-left', 'icon-sm')]),
      avatarConv(c),
      el('div', { class: 'chat-h-b' }, [el('b', { text: nombre }), el('span', { class: 'chat-h-s' }, [pastilla(c.canal), el('span', { class: 'muted', text: detalleConv(c) })])]),
      el('div', { class: 'chat-h-a' }, [
        c.cliente_id ? el('a', { class: 'mini-btn', href: '#/clientes/' + c.cliente_id, text: 'Ver ficha' }) : null,
        enlace ? el('a', { class: 'mini-btn', href: enlace, target: '_blank', rel: 'noopener', title: 'Abrir en Meta Business Suite' }, [A.icon('i-external', 'icon-sm')]) : null
      ])
    ]));
    st.iaVista = c.ia_at;
    dst.appendChild(barraProspecto(c, panel, wrap));
    var msgs = el('div', { class: 'chat-msgs' });
    dst.appendChild(msgs);
    var r = await sb.from('mensajes_chat').select('*').eq('conversacion_id', c.id).order('created_at').limit(500);
    var dia = '';
    // Enlaces temporales para ver las fotos y archivos del chat
    var rutas = [];
    (r.data || []).forEach(function (m) { (m.adjuntos || []).forEach(function (a) { rutas.push(a.path); }); });
    var urlDe = {};
    if (rutas.length) {
      var fr = await sb.storage.from('chat').createSignedUrls(rutas, 3600);
      (fr.data || []).forEach(function (x) { if (x.signedUrl) urlDe[x.path] = x.signedUrl; });
    }
    (r.data || []).forEach(function (m) {
      var d = A.fecha(m.created_at);
      if (d !== dia) { dia = d; msgs.appendChild(el('div', { class: 'chat-dia' }, [el('span', { text: d })])); }
      var hora = new Date(m.created_at).toLocaleTimeString('es-US', { hour: 'numeric', minute: '2-digit' });
      var marca = m.direccion === 'saliente' ? ({ enviado: ' · ✓', entregado: ' · ✓✓', leido: ' · ✓✓ leído', error: ' · no se envió' })[m.estado] || '' : '';
      var adj = m.adjuntos || [];
      var texto = m.texto || '';
      // «[Foto]», «[Archivo] nombre»…: con el archivo a la vista sobra la etiqueta
      if (adj.length) { texto = texto.replace(/^\[[^\]]+\]\s*/, ''); if (adj[0] && texto === adj[0].nombre) texto = ''; }
      msgs.appendChild(el('div', { class: 'bub ' + (m.direccion === 'entrante' ? 'in' : 'out') + (m.estado === 'error' ? ' err' : '') + (adj.length ? ' con-adj' : '') }, [
        adj.length ? el('div', { class: 'adjs' }, adj.map(function (a) { return verAdjunto(c, m, a, urlDe[a.path]); })) : null,
        texto ? el('p', { text: texto }) : null,
        el('span', { text: hora + (m.automatico ? ' · automático' : '') + marca })
      ]));
    });
    if (!(r.data || []).length) msgs.appendChild(el('div', { class: 'muted', style: 'text-align:center;padding:20px', text: 'Sin mensajes todavía.' }));
    setTimeout(function () { msgs.scrollTop = msgs.scrollHeight; }, 30);
    // Las fotos cambian el alto al cargar: se vuelve a bajar al final
    msgs.querySelectorAll('img').forEach(function (i) { i.addEventListener('load', function () { msgs.scrollTop = msgs.scrollHeight; }, { once: true }); });

    var integ = await A.integraciones();
    var directo = conectado(integ, c.canal);
    // Meta solo deja responder con texto libre dentro de las 24 h siguientes al último mensaje del cliente
    var horas = c.ultimo_entrante_at ? (Date.now() - new Date(c.ultimo_entrante_at).getTime()) / 3600e3 : null;
    var cerrada = directo && c.canal !== 'whatsapp' && horas !== null && horas > 24;
    var txt = el('textarea', { class: 'input', placeholder: 'Escribe tu respuesta por ' + (CANAL[c.canal] || CANAL.sms).n + '…', maxlength: 4000, style: 'min-height:70px' });
    txt.value = borrador;
    var rap = (await sb.from('respuestas_rapidas').select('*').order('orden')).data || [];
    var primerNombre = (c.clientes && c.clientes.nombre) || (c.nombre && c.nombre.charAt(0) !== '@' ? c.nombre.split(' ')[0] : '');
    var chips = el('div', { class: 'chips', style: 'margin-bottom:8px' }, rap.map(function (q) {
      return el('button', { type: 'button', class: 'chip-s', title: q.texto, text: q.titulo, onclick: function () { txt.value = q.texto.replace(/\{nombre\}/g, primerNombre).replace(/ ,/g, ','); txt.focus(); } });
    }));
    // Adjuntar foto o archivo (solo con el canal conectado: Meta lo envía desde el CRM)
    var pendiente = null;
    var previa = el('div', { class: 'adj-prev', hidden: true });
    var archivo = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif,application/pdf,video/mp4', hidden: true });
    function pintarPrevia() {
      previa.innerHTML = ''; previa.hidden = !pendiente;
      if (!pendiente) return;
      previa.appendChild(el('span', { class: 'adj-f' }, [A.icon(/^image\//.test(pendiente.type) ? 'i-image' : 'i-file', 'icon-sm'), el('b', { text: pendiente.name }), el('span', { class: 'muted', text: tam(pendiente.size) })]));
      previa.appendChild(el('button', { type: 'button', class: 'link-btn', text: 'Quitar', onclick: function () { pendiente = null; archivo.value = ''; pintarPrevia(); } }));
    }
    archivo.addEventListener('change', function () {
      var f = archivo.files[0]; if (!f) return;
      if (f.size > 25 * 1024 * 1024) { A.toast('El archivo supera 25 MB.', 'error'); archivo.value = ''; return; }
      pendiente = f; pintarPrevia(); txt.focus();
    });
    var clip = el('button', { type: 'button', class: 'icon-btn clip', 'aria-label': 'Adjuntar foto o archivo', title: directo ? 'Adjuntar foto o PDF' : 'Para enviar archivos desde el CRM, el canal debe estar conectado', onclick: function () {
      if (cerrada) { window.open(enlace, '_blank', 'noopener'); return; }
      if (!directo) { A.toast((CANAL[c.canal] || CANAL.sms).n + ' aún no está conectado: envía el archivo desde tu teléfono.', 'error'); return; }
      archivo.click();
    } }, [A.icon('i-clip', 'icon-sm')]);

    var enviar = el('button', { class: 'btn btn-sm btn-ch ch-' + c.canal, type: 'button', onclick: async function () {
      var t = txt.value.trim(); if (!t && !pendiente) { txt.focus(); return; }
      if (cerrada) { window.open(enlace, '_blank', 'noopener'); return; }
      var boton = this; boton.disabled = true;
      if (directo) {
        var cuerpo = { conversacion_id: c.id, texto: t };
        if (pendiente) {
          var ruta = c.id + '/' + Date.now() + '-' + limpio(pendiente.name);
          A.toast('Subiendo ' + pendiente.name + '…');
          var up = await sb.storage.from('chat').upload(ruta, pendiente, { contentType: pendiente.type || 'application/octet-stream' });
          if (up.error) { boton.disabled = false; A.toast('No se pudo subir el archivo.', 'error'); return; }
          cuerpo.adjunto = { path: ruta, nombre: pendiente.name, tipo: pendiente.type || 'application/octet-stream' };
        }
        var env = await sb.functions.invoke('enviar-mensaje', { body: cuerpo });
        boton.disabled = false;
        if (!env.error) { txt.value = ''; pendiente = null; c.ultimo_texto = t || '[Archivo]'; abrir(c, panel, wrap); return; }
        var info = await leerError(env.error);
        if (!(info.codigo === 'fuera_ventana' && c.canal === 'whatsapp')) { A.toast(info.error || 'No se pudo enviar.', 'error'); return; }
        if (!confirm('Pasaron más de 24 horas desde su último mensaje, así que WhatsApp no deja escribirle desde el CRM con texto libre. ¿Abrir tu WhatsApp con el mensaje listo?')) return;
      }
      boton.disabled = false;
      if (c.canal === 'whatsapp' || c.canal === 'sms') window.open(A.wa(c.contacto, t), '_blank', 'noopener');
      await sb.from('mensajes_chat').insert({ conversacion_id: c.id, direccion: 'saliente', texto: t });
      await sb.from('conversaciones').update({ ultimo_texto: t.slice(0, 200), ultimo_at: new Date().toISOString() }).eq('id', c.id);
      txt.value = '';
      abrir(c, panel, wrap);
    } }, [logo(c.canal, 'icon-sm'), el('span', { text: cerrada ? 'Responder en Meta Business Suite' : directo ? 'Enviar por ' + (CANAL[c.canal] || CANAL.sms).n : c.canal === 'whatsapp' ? 'Enviar por WhatsApp' : 'Registrar respuesta' })]);
    txt.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); enviar.click(); } });
    dst.appendChild(el('div', { class: 'chat-f' }, [
      cerrada ? el('div', { class: 'alert warn', style: 'margin-bottom:8px' }, [A.icon('i-alert', 'icon-sm'), 'Pasaron más de 24 horas desde su último mensaje, así que Meta no deja responderle desde el CRM. Contéstale desde Meta Business Suite (el botón la abre) o espera a que vuelva a escribir.']) : null,
      cajaIA(c, txt, integ), chips, previa, txt, archivo,
      el('div', { style: 'display:flex;gap:8px;align-items:center;justify-content:space-between;margin-top:8px' }, [el('span', { style: 'display:flex;align-items:center;gap:10px' }, [clip, el('span', { class: 'muted', style: 'font-size:11.5px', text: 'Ctrl + Enter para enviar' })]), enviar])
    ]));
    if (refresco) { panel.replaceChildren(dst); msgs.scrollTop = msgs.scrollHeight; }
    else txt.focus({ preventScroll: true });
  }

  /* ---------- Fotos y archivos del chat ---------- */
  function limpio(n) { return String(n || 'archivo').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.\-]+/g, '_').slice(-80); }
  function tam(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  // Texto de la nota de voz (lo escribe la IA al llegar el audio)
  function transcripcion(c, m, a) {
    if (a.transcripcion) return el('div', { class: 'adj-tr' }, [el('span', { class: 'adj-tr-k' }, [A.icon('i-sparkles', 'icon-sm'), 'Transcripción']), el('p', { text: a.transcripcion })]);
    if (a.transcripcion === '') return el('div', { class: 'adj-tr vacia', text: 'La nota de voz no tiene palabras que transcribir.' });
    var reciente = Date.now() - new Date(m.created_at).getTime() < 3 * 60000 && !a.transcripcion_error;
    if (reciente) return el('div', { class: 'adj-tr pend' }, [el('span', { class: 'adj-tr-k' }, [A.icon('i-sparkles', 'icon-sm'), 'Transcribiendo…'])]);
    var caja = el('div', { class: 'adj-tr pend' });
    var b = el('button', { type: 'button', class: 'link-btn', text: a.transcripcion_error ? 'Intentar de nuevo' : 'Transcribir a texto', onclick: async function () {
      b.disabled = true; b.textContent = 'Transcribiendo…';
      if (a.transcripcion_error) {
        await sb.from('mensajes_chat').update({ adjuntos: (m.adjuntos || []).map(function (x) { if (x.path !== a.path) return x; var y = Object.assign({}, x); delete y.transcripcion_error; return y; }) }).eq('id', m.id);
      }
      var r = await sb.functions.invoke('ia-mensajes', { body: { conversacion_id: c.id } });
      if (r.error) { var e = {}; try { e = await r.error.context.json(); } catch (_) { /* */ } A.toast(e.codigo === 'no_conectado' ? 'Conecta el asistente con IA en Ajustes para transcribir.' : (e.error || 'No se pudo transcribir.'), 'error'); b.disabled = false; b.textContent = 'Transcribir a texto'; return; }
      var n = await sb.from('mensajes_chat').select('adjuntos').eq('id', m.id).maybeSingle();
      var x = ((n.data && n.data.adjuntos) || []).filter(function (y) { return y.path === a.path; })[0];
      if (x) { m.adjuntos = n.data.adjuntos; caja.replaceWith(transcripcion(c, m, x)); }
    } });
    if (a.transcripcion_error) caja.appendChild(el('span', { class: 'muted', text: a.transcripcion_error + ' ' }));
    caja.appendChild(b);
    return caja;
  }
  function verAdjunto(c, m, a, url) {
    var caja = el('div', { class: 'adj' });
    if (!url) { caja.appendChild(el('span', { class: 'adj-f' }, [A.icon('i-file', 'icon-sm'), el('b', { text: a.nombre }), el('span', { class: 'muted', text: 'No disponible' })])); return caja; }
    if (/^image\//.test(a.tipo)) caja.appendChild(el('a', { class: 'adj-img', href: url, target: '_blank', rel: 'noopener', title: 'Ver en grande' }, [el('img', { src: url, alt: a.nombre })]));
    else if (/^video\//.test(a.tipo)) caja.appendChild(el('video', { src: url, controls: true, preload: 'metadata', class: 'adj-vid' }));
    else if (/^audio\//.test(a.tipo)) { caja.appendChild(el('audio', { src: url, controls: true, preload: 'none' })); caja.appendChild(transcripcion(c, m, a)); }
    else caja.appendChild(el('a', { class: 'adj-f', href: url, target: '_blank', rel: 'noopener' }, [A.icon('i-file', 'icon-sm'), el('b', { text: a.nombre }), a.tam ? el('span', { class: 'muted', text: tam(a.tam) }) : null]));
    var acc = el('div', { class: 'adj-acc' }, [
      el('button', { type: 'button', class: 'link-btn', text: 'Descargar', onclick: async function () {
        var d = await sb.storage.from('chat').createSignedUrl(a.path, 120, { download: a.nombre });
        if (d.data) location.href = d.data.signedUrl; else A.toast('No se pudo descargar.', 'error');
      } })
    ]);
    if (A.puede('documentos')) {
      var g = el('button', { type: 'button', class: 'link-btn', text: a.guardado ? 'Guardado en documentos ✓' : 'Guardar en documentos', disabled: !!a.guardado, onclick: function () { guardarEnDocs(c, m, a, g); } });
      acc.appendChild(g);
    }
    caja.appendChild(acc);
    return caja;
  }
  // Copia el archivo del chat a los Documentos del cliente
  async function guardarEnDocs(c, m, a, boton) {
    if (!c.cliente_id) { A.toast('Primero conviértelo en cliente con el botón de arriba.', 'error'); return; }
    boton.disabled = true; boton.textContent = 'Guardando…';
    var bl = await sb.storage.from('chat').download(a.path);
    if (bl.error) { boton.disabled = false; boton.textContent = 'Guardar en documentos'; A.toast('No se pudo leer el archivo.', 'error'); return; }
    var ruta = 'clientes/' + c.cliente_id + '/' + Date.now() + '-' + limpio(a.nombre);
    var up = await sb.storage.from('documentos').upload(ruta, bl.data, { contentType: a.tipo, upsert: false });
    var ins = up.error ? up : await sb.from('documentos').insert({ cliente_id: c.cliente_id, nombre: a.nombre.slice(0, 200), path: ruta, tipo: a.tipo, tamano: a.tam || bl.data.size });
    if (ins.error) { boton.disabled = false; boton.textContent = 'Guardar en documentos'; A.toast('No se pudo guardar en documentos.', 'error'); return; }
    a.guardado = true;
    await sb.from('mensajes_chat').update({ adjuntos: (m.adjuntos || []).map(function (x) { return x.path === a.path ? Object.assign({}, x, { guardado: true }) : x; }) }).eq('id', m.id);
    boton.textContent = 'Guardado en documentos ✓';
    A.toast('Guardado en los documentos del cliente.', 'ok');
  }

  /* ---------- Asistente con IA: resumen, interés y respuesta sugerida (nunca envía solo) ---------- */
  function cajaIA(c, txt, integ) {
    var caja = el('div', { class: 'ia-box' });
    if (!integ.ia && !c.ia) return caja;
    function pintar(cargando) {
      caja.innerHTML = '';
      var ia = c.ia;
      var analizar = el('button', { type: 'button', class: 'link-btn', text: cargando ? 'Pensando…' : ia ? 'Otra sugerencia' : 'Analizar con IA', disabled: !!cargando, onclick: async function () {
        pintar(true);
        var r = await sb.functions.invoke('ia-mensajes', { body: { conversacion_id: c.id } });
        if (r.error) { var e = {}; try { e = await r.error.context.json(); } catch (_) { /* */ } A.toast(e.error || 'La IA no pudo responder.', 'error'); pintar(); return; }
        if (r.data && r.data.ia) { c.ia = r.data.ia; c.temperatura = r.data.ia.temperatura; c.ia_at = r.data.ia.at; st.iaVista = c.ia_at; }
        pintar();
      } });
      if (!ia) { caja.appendChild(el('div', { class: 'ia-h' }, [el('span', { class: 'ia-t' }, [A.icon('i-sparkles', 'icon-sm'), 'Asistente con IA']), analizar])); return; }
      var datos = [ia.telefono ? 'Tel. ' + ia.telefono : null, ia.email ? ia.email : null].filter(Boolean).join(' · ');
      caja.appendChild(el('div', { class: 'ia-h' }, [
        el('span', { class: 'ia-t' }, [A.icon('i-sparkles', 'icon-sm'), 'IA']), pastillaTemp(ia.temperatura),
        ia.servicio && A.SERVICIOS[ia.servicio] ? el('span', { class: 'muted', text: 'Busca: ' + A.SERVICIOS[ia.servicio].corto }) : null,
        ia.idioma === 'en' ? el('span', { class: 'muted', text: 'Escribe en inglés' }) : null,
        el('span', { style: 'flex:1' }), analizar
      ]));
      if (ia.resumen) caja.appendChild(el('p', { class: 'ia-r', text: ia.resumen + (datos ? ' · ' + datos : '') }));
      if (ia.sugerencia) {
        caja.appendChild(el('div', { class: 'ia-s' }, [el('p', { text: ia.sugerencia }),
          el('button', { type: 'button', class: 'mini-btn', text: 'Usar esta respuesta', onclick: function () { txt.value = ia.sugerencia; txt.focus(); } })]));
      }
    }
    pintar();
    return caja;
  }

  /* ---------- Prospecto: etapa, servicio, responsable y convertir en cliente ---------- */
  async function guardarConv(c, cambios) {
    var r = await sb.from('conversaciones').update(cambios).eq('id', c.id).select('*').single();
    if (r.error) { A.toast('No se pudo guardar.', 'error'); return false; }
    Object.assign(c, r.data);
    if (ui.recargar) ui.recargar();
    return true;
  }
  function barraProspecto(c, panel, wrap) {
    var barra = el('div', { class: 'chat-p' });
    var etapas = el('div', { class: 'et-seg', role: 'radiogroup', 'aria-label': 'Etapa' });
    function pintarEtapas() {
      etapas.innerHTML = '';
      Object.keys(ETAPAS).forEach(function (k) {
        etapas.appendChild(el('button', { type: 'button', role: 'radio', 'aria-checked': String(c.etapa === k), class: 'et-b et-' + k + (c.etapa === k ? ' on' : ''), text: ETAPAS[k], onclick: async function () {
          if (c.etapa === k) return;
          if (k === 'cliente' && !c.cliente_id) { convertir(c, panel, wrap); return; }
          var antes = c.etapa; c.etapa = k; pintarEtapas();
          if (!(await guardarConv(c, { etapa: k }))) { c.etapa = antes; pintarEtapas(); }
        } }));
      });
    }
    pintarEtapas();
    var serv = el('select', { class: 'input sm', 'aria-label': 'Servicio de interés' }, [el('option', { value: '', text: 'Servicio de interés…' })].concat(Object.keys(A.SERVICIOS).filter(function (k) { return k !== 'otro'; }).map(function (k) {
      return el('option', { value: k, text: A.SERVICIOS[k].corto === 'Otro' ? A.SERVICIOS[k].label : A.SERVICIOS[k].corto });
    })));
    serv.value = c.servicio || '';
    serv.addEventListener('change', function () { guardarConv(c, { servicio: serv.value || null }); });
    var asig = el('select', { class: 'input sm', 'aria-label': 'Responsable' }, [el('option', { value: '', text: 'Sin asignar' })]);
    A.equipo().then(function (eq) {
      eq.forEach(function (m) { asig.appendChild(el('option', { value: m.user_id, text: m.nombre || 'Equipo' })); });
      asig.value = c.asignado_a || '';
    });
    asig.addEventListener('change', function () { guardarConv(c, { asignado_a: asig.value || null }); });
    barra.appendChild(etapas);
    barra.appendChild(el('div', { class: 'chat-p-r' }, [serv, asig,
      c.cliente_id ? null : el('button', { type: 'button', class: 'btn btn-dark btn-sm', onclick: function () { convertir(c, panel, wrap); } }, [A.icon('i-user-plus', 'icon-sm'), el('span', { text: 'Convertir en cliente' })])
    ]));
    return barra;
  }
  var ORIGEN_CANAL = { whatsapp: 'whatsapp', messenger: 'facebook', instagram: 'instagram', sms: 'otro' };
  function convertir(c, panel, wrap) {
    var ia = c.ia || {};
    var partes = ((c.nombre && c.nombre.charAt(0) !== '@' ? c.nombre.replace(/\.$/, '') : '') || ia.nombre || '').trim().split(/\s+/);
    var servicios = [['', 'No por ahora']].concat(Object.keys(A.SERVICIOS).filter(function (k) { return !A.SERVICIOS[k].oculto; }).map(function (k) { return [k, A.SERVICIOS[k].label]; }));
    A.modal({
      titulo: 'Convertir en cliente', ok: 'Crear cliente',
      campos: [
        { k: 'nombre', label: 'Nombre', required: true, max: 120, value: partes[0] || '' },
        { k: 'apellidos', label: 'Apellidos', max: 120, value: partes.slice(1).join(' ') },
        { k: 'telefono', label: 'Teléfono', type: 'tel', max: 40, value: c.canal === 'whatsapp' ? c.contacto : (ia.telefono || '') },
        { k: 'email', label: 'Correo', type: 'email', max: 200, value: ia.email || '' },
        { k: 'servicio', label: 'Abrir un caso de', type: 'select', full: true, options: servicios, value: c.servicio && A.SERVICIOS[c.servicio] && !A.SERVICIOS[c.servicio].oculto ? c.servicio : '' }
      ],
      guardar: async function (d, aviso) {
        if (!d.nombre) { A.msg(aviso, 'Escribe el nombre.'); return false; }
        var r = await A.nuevoClienteBD({ nombre: d.nombre, apellidos: d.apellidos || null, telefono: d.telefono || null, email: d.email || null, origen: ORIGEN_CANAL[c.canal] || 'otro' }).select('id').single();
        if (r.error) { A.msg(aviso, 'No se pudo crear el cliente.'); return false; }
        if (d.servicio) {
          var sv = A.SERVICIOS[d.servicio];
          await sb.from('casos').insert({ cliente_id: r.data.id, servicio: d.servicio, etapa: sv.etapas[0] });
        }
        await guardarConv(c, { cliente_id: r.data.id, etapa: 'cliente', nombre: [d.nombre, d.apellidos].filter(Boolean).join(' ').slice(0, 120), servicio: d.servicio || c.servicio || null });
        A.toast('Cliente creado' + (d.servicio ? ' con su caso abierto.' : '.'), 'ok');
        abrir(c, panel, wrap, true);
      }
    });
  }

  async function nuevaConv() {
    var cl = await A.clientesBasicos();
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
        st.conv = r.data.id; st.tab = 'chats'; st.canal = 'todos'; pintarTabs();
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
    ['franchise_tax', 'Aviso de Franchise Tax', 'El 1 de abril, a los clientes con LLC.', ['nombre']],
    ['seguimiento', 'Seguimiento de prospectos', 'Si un prospecto deja de escribir o alguien llena un formulario y no se vuelve cliente, te creo una tarea esos días con este mensaje listo para copiar. Si vuelve a escribir, el conteo empieza de nuevo.', ['nombre', 'servicio']]
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
      if (a[0] === 'seguimiento') {
        extra = el('label', { class: 'seg-dias' }, [el('span', { text: 'Días después del último mensaje' }), el('input', { class: 'input sm', 'data-dias': '1', value: (c.dias || [2, 5, 7]).join(', '), placeholder: '2, 5, 7' })]);
      }
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
      if (extra) (extra.tagName === 'INPUT' ? [extra] : extra.querySelectorAll('input')).forEach(function (i) { i.addEventListener('change', guardar); });
    });
    async function guardar() {
      var n = Object.assign({}, cfg, { envio_automatico: envio.checked });
      grid.querySelectorAll('.auto-card').forEach(function (card) {
        var k = card.dataset.k, o = Object.assign({}, n[k] || {});
        o.activo = card.querySelector('.switch input').checked;
        o.mensaje = card.querySelector('textarea').value;
        if (k === 'seguimiento') {
          var dd = (card.querySelector('[data-dias]').value.match(/\d+/g) || []).map(Number).filter(function (x) { return x >= 1 && x <= 60; });
          o.dias = dd.filter(function (x, i) { return dd.indexOf(x) === i; }).sort(function (x, y) { return x - y; }).slice(0, 6);
          if (!o.dias.length) o.dias = [2, 5, 7];
          card.querySelector('[data-dias]').value = o.dias.join(', ');
        }
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
