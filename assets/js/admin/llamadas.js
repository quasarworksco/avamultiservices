/* Panel CRM — Llamadas: marcador, historial, grabaciones y lo que la IA extrae de cada llamada */
(function () {
  'use strict';
  var A = window.AVA, el = A.el, sb = A.sb;
  var SDK = 'https://cdn.jsdelivr.net/npm/@twilio/voice-sdk@2.18.3/dist/twilio.min.js';
  var BUCKET = 'llamadas';
  var COLS = 'id,created_at,direccion,canal,numero,cliente_id,conversacion_id,usuario,estado,inicio,duracion_seg,grabacion_path,con_aviso,ia,ia_estado,ia_error,notas, clientes(id,nombre,apellidos,telefono,region)';
  var ESTADOS = { iniciando: 'Iniciando', sonando: 'Sonando', en_curso: 'En curso', completada: 'Completada', sin_respuesta: 'Sin respuesta', ocupado: 'Ocupado', fallida: 'Falló', cancelada: 'Cancelada' };
  var IA_EST = { pendiente: ['Por procesar', 'pend'], procesando: ['Procesando…', 'proc'], listo: ['Información lista', 'ok'], error: ['No se pudo procesar', 'err'] };
  var st = { filtro: 'todas', q: '', cliente: null };
  var linea = { estado: null, device: null, llamada: null, fila: null, inicio: 0, reloj: null, numero: '' };

  function dur(s) { if (!s) return '0:00'; s = Math.round(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function e164(t) { var d = String(t || '').replace(/\D/g, ''); if (d.length === 10) return '+1' + d; if (d.length === 11 && d[0] === '1') return '+' + d; return null; }
  function bonito(n) { var d = String(n || '').replace(/\D/g, '').slice(-10); return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : (n || 'Número privado'); }
  function deTexas(region) { return /^(tx|texas)$/i.test(String(region || '').trim()); }
  function quien(l) { return l.clientes ? A.nombreDe(l.clientes) : (l.ia && l.ia.nombre_cliente) || bonito(l.numero); }

  /* ---------- Línea telefónica (Twilio Voice en el navegador) ---------- */
  A.estadoLinea = function () {
    if (!linea.estado) linea.estado = sb.rpc('llamadas_estado').then(function (r) { return r.data || {}; }, function () { return {}; });
    return linea.estado;
  };
  function cargarSDK() {
    if (window.Twilio && window.Twilio.Device) return Promise.resolve();
    return new Promise(function (ok, mal) { var s = document.createElement('script'); s.src = SDK; s.onload = ok; s.onerror = mal; document.head.appendChild(s); });
  }
  async function token() {
    var r = await sb.functions.invoke('llamadas', { body: { accion: 'token' } });
    if (r.error) { var e = {}; try { e = await r.error.context.json(); } catch (_) { /* */ } throw new Error(e.error || 'No se pudo conectar la línea.'); }
    return r.data;
  }
  // Se prepara al entrar al panel para que suenen las llamadas que entran
  A.iniciarLinea = async function () {
    if (!A.puede('llamadas') || linea.device) return linea.device;
    var est = await A.estadoLinea();
    if (!est.conectado) return null;
    try {
      await cargarSDK();
      var t = await token();
      var d = new window.Twilio.Device(t.token, { codecPreferences: ['opus', 'pcmu'], closeProtection: 'Hay una llamada en curso. ¿Seguro que quieres salir?' });
      d.on('tokenWillExpire', async function () { try { d.updateToken((await token()).token); } catch (_) { /* */ } });
      d.on('incoming', entrante);
      d.on('error', function (e) { A.toast('Línea: ' + (e.message || 'error'), 'error'); });
      await d.register();
      linea.device = d;
      return d;
    } catch (e) { console.warn('Línea de llamadas', e); return null; }
  };

  function flotante() {
    var f = document.getElementById('ll-flot');
    if (!f) { f = el('div', { class: 'll-flot', id: 'll-flot', role: 'dialog', 'aria-live': 'assertive' }); document.body.appendChild(f); }
    return f;
  }
  function cerrarFlotante() { var f = document.getElementById('ll-flot'); if (f) f.remove(); }

  async function entrante(call) {
    var num = call.parameters && call.parameters.From;
    var d = String(num || '').replace(/\D/g, '').slice(-10);
    var c = d.length === 10 ? (await sb.from('clientes').select('id,nombre,apellidos').like('tel_digitos', '%' + d).limit(1)).data : null;
    var nombre = c && c[0] ? A.nombreDe(c[0]) : bonito(num);
    var f = flotante(); f.innerHTML = '';
    f.appendChild(el('div', { class: 'll-flot-h' }, [el('span', { class: 'll-pulso' }, [A.icon('i-phone', 'icon-sm')]), el('div', null, [el('b', { text: nombre }), el('span', { text: 'Llamada entrante' })])]));
    f.appendChild(el('div', { class: 'll-flot-b' }, [
      el('button', { class: 'll-btn rojo', type: 'button', onclick: function () { call.reject(); cerrarFlotante(); } }, [A.icon('i-x', 'icon-sm'), 'Rechazar']),
      el('button', { class: 'll-btn verde', type: 'button', onclick: function () { call.accept(); enLlamada(call, nombre); } }, [A.icon('i-phone', 'icon-sm'), 'Contestar'])
    ]));
    call.on('cancel', cerrarFlotante); call.on('disconnect', terminada);
    A.toast('Llamada de ' + nombre);
  }

  function enLlamada(call, nombre) {
    linea.llamada = call; linea.inicio = Date.now();
    var f = flotante(); f.innerHTML = '';
    var reloj = el('span', { text: '0:00' });
    var mudo = el('button', { class: 'll-btn', type: 'button', onclick: function () { var m = !call.isMuted(); call.mute(m); mudo.classList.toggle('on', m); mudo.lastChild.textContent = m ? 'Activar micrófono' : 'Silenciar'; } }, [A.icon('i-bell-off', 'icon-sm'), el('span', { text: 'Silenciar' })]);
    var tecl = el('div', { class: 'll-mini-tec', hidden: true }, '123456789*0#'.split('').map(function (k) { return el('button', { type: 'button', text: k, onclick: function () { call.sendDigits(k); } }); }));
    f.appendChild(el('div', { class: 'll-flot-h' }, [el('span', { class: 'll-pulso vivo' }, [A.icon('i-phone', 'icon-sm')]), el('div', null, [el('b', { text: nombre }), reloj])]));
    f.appendChild(tecl);
    f.appendChild(el('div', { class: 'll-flot-b' }, [mudo,
      el('button', { class: 'll-btn', type: 'button', onclick: function () { tecl.hidden = !tecl.hidden; } }, [A.icon('i-dots', 'icon-sm'), 'Teclado']),
      el('button', { class: 'll-btn rojo', type: 'button', onclick: function () { call.disconnect(); } }, [A.icon('i-x', 'icon-sm'), 'Colgar'])]));
    clearInterval(linea.reloj);
    linea.reloj = setInterval(function () { reloj.textContent = dur((Date.now() - linea.inicio) / 1000) + ' · en llamada'; }, 500);
  }
  function terminada() {
    clearInterval(linea.reloj); linea.llamada = null; cerrarFlotante();
    A.toast('Llamada terminada. La IA procesará la grabación en un momento.');
    if (location.hash.indexOf('#/llamadas') === 0) setTimeout(function () { if (ui.recargar) ui.recargar(); }, 2500);
  }

  async function llamar(numero, cliente, grabar) {
    var to = e164(numero);
    if (!to) { A.toast('Escribe un número de EE. UU. de 10 dígitos.', 'error'); return; }
    var d = await A.iniciarLinea();
    if (!d) { A.toast('La línea no está lista. Revisa la conexión en Ajustes.', 'error'); return; }
    var conAviso = grabar ? !(cliente && deTexas(cliente.region)) : null;
    var r = await sb.from('llamadas').insert({ direccion: 'saliente', canal: 'telefono', numero: to, cliente_id: cliente ? cliente.id : null, estado: 'iniciando', con_aviso: conAviso, usuario: A.yo().user_id, ia_estado: grabar ? 'pendiente' : 'sin_grabacion' }).select('id').single();
    if (r.error) { A.toast('No se pudo iniciar la llamada.', 'error'); return; }
    try {
      var call = await d.connect({ params: { To: to, llamada: r.data.id } });
      enLlamada(call, cliente ? A.nombreDe(cliente) : bonito(to));
      call.on('disconnect', terminada); call.on('cancel', terminada);
      call.on('error', function (e) { A.toast('La llamada falló: ' + (e.message || ''), 'error'); terminada(); });
    } catch (e) { A.toast('No se pudo llamar: ' + (e.message || ''), 'error'); }
  }

  /* ---------- Vista ---------- */
  var ui = {};
  A.vista('llamadas', {
    permiso: 'llamadas',
    render: async function (cont, partes) {
      st.cliente = null; st.filtro = 'todas'; st.q = '';
      var est = await A.estadoLinea();
      cont.appendChild(A.cabecera('Comunicación', 'Llamadas', 'con tus clientes', [
        el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: function () { subir(); } }, [A.icon('i-upload'), el('span', { text: 'Subir grabación' })]),
        el('button', { class: 'btn btn-dark btn-sm', type: 'button', onclick: function () { ui.busca.focus(); ui.marcador.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }, [A.icon('i-phone'), el('span', { text: 'Nueva llamada' })])
      ]));
      if (!est.conectado) cont.appendChild(el('div', { class: 'alert warn', style: 'margin-top:14px' }, [A.icon('i-alert', 'icon-sm'),
        el('span', null, ['Tu línea de llamadas todavía no está conectada. Mientras tanto, llama desde tu celular y toca ', el('b', { text: 'Subir grabación' }), ': la IA la transcribe y extrae toda la información. ', A.puede('equipo') ? el('a', { href: '#/ajustes', text: 'Conectar la línea' }) : null])]));
      if (est.conectado && !est.ia) cont.appendChild(el('div', { class: 'alert warn', style: 'margin-top:14px' }, [A.icon('i-alert', 'icon-sm'), 'Conecta el asistente con IA (Groq) en Ajustes para transcribir y resumir las llamadas.']));
      ui.kpis = el('div', { class: 'cb-kpis' });
      cont.appendChild(ui.kpis);
      ui.marcador = marcador(est);
      ui.hist = el('div', { class: 'card ll-hist' });
      cont.appendChild(el('div', { class: 'll-grid' }, [ui.marcador, ui.hist]));
      ui.recargar = cargar;
      if (partes[0] === 'marcar' && partes[1]) {
        var c = await sb.from('clientes').select('id,nombre,apellidos,telefono,region').eq('id', partes[1]).maybeSingle();
        if (c.data) elegir(c.data);
      }
      if (partes[0] === 'ver' && partes[1]) { var l = await sb.from('llamadas').select(COLS).eq('id', partes[1]).maybeSingle(); if (l.data) detalle(l.data); }
      cargar();
    }
  });

  function marcador(est) {
    var num = el('input', { class: 'll-num', inputmode: 'tel', placeholder: '(214) 555-0123', 'aria-label': 'Número', oninput: function () { if (st.cliente && this.value.replace(/\D/g, '').slice(-10) !== String(st.cliente.telefono || '').replace(/\D/g, '').slice(-10)) quitar(); pintarAviso(); } });
    var sugs = el('div', { class: 'll-sugs', hidden: true });
    var busca = el('input', { class: 'input sm', type: 'search', placeholder: 'Buscar cliente por nombre o teléfono', 'aria-label': 'Buscar cliente', oninput: buscar });
    ui.busca = busca; ui.num = num;
    var chip = el('div', { class: 'll-cli', hidden: true });
    var grabar = el('input', { type: 'checkbox', checked: true, onchange: pintarAviso });
    var aviso = el('p', { class: 'll-aviso' });
    var tBuscar;
    function buscar() {
      clearTimeout(tBuscar);
      var q = busca.value.trim();
      if (q.length < 2) { sugs.hidden = true; return; }
      tBuscar = setTimeout(async function () {
        var dig = q.replace(/\D/g, '');
        var f = dig.length >= 3 ? 'tel_digitos.ilike.%' + dig + '%' : 'nombre.ilike.%' + q + '%,apellidos.ilike.%' + q + '%';
        var r = await sb.from('clientes').select('id,nombre,apellidos,telefono,region').or(f).limit(6);
        sugs.innerHTML = ''; sugs.hidden = !(r.data || []).length;
        (r.data || []).forEach(function (c) { sugs.appendChild(el('button', { type: 'button', onclick: function () { elegir(c); } }, [el('b', { text: A.nombreDe(c) }), el('span', { text: c.telefono || 'Sin teléfono' })])); });
      }, 250);
    }
    elegir = function (c) {
      st.cliente = c; busca.value = ''; sugs.hidden = true;
      num.value = bonito(c.telefono || '');
      chip.hidden = false; chip.innerHTML = '';
      chip.appendChild(el('span', { class: 'avatar', text: A.iniciales(A.nombreDe(c)) }));
      chip.appendChild(el('div', null, [el('b', { text: A.nombreDe(c) }), el('span', { text: (c.region ? c.region + ' · ' : '') + 'Ver solo sus llamadas abajo' })]));
      chip.appendChild(el('button', { type: 'button', class: 'fm-b', 'aria-label': 'Quitar cliente', onclick: function () { quitar(); num.value = ''; pintarAviso(); } }, [A.icon('i-x', 'icon-sm')]));
      pintarAviso(); cargar();
    };
    function quitar() { if (!st.cliente) return; st.cliente = null; chip.hidden = true; cargar(); }
    function pintarAviso() {
      if (!grabar.checked) { aviso.className = 'll-aviso'; aviso.textContent = 'Esta llamada no se grabará.'; return; }
      var tx = st.cliente && deTexas(st.cliente.region);
      aviso.className = 'll-aviso ' + (tx ? 'tx' : 'av');
      aviso.textContent = tx ? 'Cliente de Texas: se graba sin aviso.' : 'Cliente fuera de Texas o sin dirección: al contestar oye «esta llamada puede ser grabada».';
    }
    var teclas = [['1', ''], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'], ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'], ['*', ''], ['0', '+'], ['#', '']];
    var teclado = el('div', { class: 'll-tec' }, teclas.map(function (t) {
      return el('button', { type: 'button', onclick: function () { num.value = (num.value + t[0]); num.dispatchEvent(new Event('input')); } }, [el('b', { text: t[0] }), el('span', { text: t[1] })]);
    }));
    var borrar = el('button', { type: 'button', class: 'll-borrar', 'aria-label': 'Borrar', onclick: function () { num.value = num.value.slice(0, -1); num.dispatchEvent(new Event('input')); } }, [A.icon('i-chevron-left', 'icon-sm')]);
    var boton = el('button', { class: 'll-llamar', type: 'button', onclick: function () {
      if (est.conectado) { llamar(num.value, st.cliente, grabar.checked); return; }
      var t = e164(num.value); if (!t) { A.toast('Escribe un número de 10 dígitos.', 'error'); return; }
      location.href = 'tel:' + t;
      setTimeout(function () { A.toast('Cuando termines, toca «Subir grabación» si la grabaste.'); }, 800);
    } }, [A.icon('i-phone'), el('span', { text: est.conectado ? 'Llamar' : 'Llamar desde mi celular' })]);
    pintarAviso();
    return el('div', { class: 'card ll-marcador' }, [
      el('div', { class: 'card-h' }, [el('h3', { class: 't', text: 'Marcador' }), el('span', { class: 'll-linea ' + (est.conectado ? 'on' : 'off') }, [el('i'), est.conectado ? 'Línea ' + bonito(est.numero) : 'Línea sin conectar'])]),
      el('div', { class: 'll-buscar' }, [busca, sugs]), chip,
      el('div', { class: 'll-pantalla' }, [num, borrar]), teclado,
      el('label', { class: 'switch-l ll-grabar' }, [el('span', { class: 'switch' }, [grabar, el('span')]), el('span', { text: 'Grabar y analizar con IA' })]), aviso,
      boton
    ]);
  }
  var elegir = function () {};

  async function cargar() {
    var q = sb.from('llamadas').select(COLS).order('created_at', { ascending: false }).limit(200);
    if (st.cliente) q = q.eq('cliente_id', st.cliente.id);
    var r = await q;
    var filas = r.data || [];
    pintarKpis(filas);
    pintarHist(filas, r.error);
    clearTimeout(ui.tSondeo);
    if (filas.some(function (l) { return l.ia_estado === 'procesando' || l.ia_estado === 'pendiente' && l.grabacion_path; }) && document.querySelector('.ll-hist')) ui.tSondeo = setTimeout(cargar, 6000);
  }
  function pintarKpis(filas) {
    var hoy = A.hoyISO(), semana = Date.now() - 7 * 864e5;
    var deHoy = filas.filter(function (l) { return new Date(l.created_at).toLocaleDateString('en-CA') === hoy; }).length;
    var min = Math.round(filas.filter(function (l) { return new Date(l.created_at) > semana; }).reduce(function (a, l) { return a + (l.duracion_seg || 0); }, 0) / 60);
    var listas = filas.filter(function (l) { return l.ia_estado === 'listo' && new Date(l.created_at) > semana; }).length;
    var perdidas = filas.filter(function (l) { return l.direccion === 'entrante' && l.estado !== 'completada' && new Date(l.created_at) > semana; }).length;
    ui.kpis.innerHTML = '';
    [['azul', 'i-phone', deHoy, 'Llamadas hoy', 'Salientes y entrantes'], ['verde', 'i-clock', min, 'Minutos esta semana', 'Tiempo hablando con clientes'],
      ['morado', 'i-sparkles', listas, 'Resumidas por la IA', 'Últimos 7 días'], ['ambar', 'i-bell', perdidas, 'Perdidas', 'Entrantes sin contestar · 7 días']].forEach(function (s, i) {
      ui.kpis.appendChild(el('div', { class: 'cb-kpi ' + s[0], style: 'animation-delay:' + i * 60 + 'ms' }, [el('span', { class: 'cb-ico' }, [A.icon(s[1])]), el('div', { class: 'k', text: String(s[2]) }), el('div', { class: 'l', text: s[3] }), el('div', { class: 'd', text: s[4] })]));
    });
  }
  function pintarHist(filas, error) {
    var h = ui.hist; h.innerHTML = '';
    var filtros = [['todas', 'Todas'], ['salientes', 'Salientes'], ['entrantes', 'Entrantes'], ['perdidas', 'Perdidas'], ['ia', 'Con información IA']];
    h.appendChild(el('div', { class: 'card-h' }, [el('h3', { class: 't', text: st.cliente ? 'Llamadas de ' + A.nombreDe(st.cliente) : 'Historial reciente' }),
      el('input', { class: 'input sm ll-q', type: 'search', placeholder: 'Buscar', value: st.q, oninput: function () { st.q = this.value.toLowerCase(); pintarHist(filas); var i = ui.hist.querySelector('.ll-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); } })]));
    h.appendChild(el('div', { class: 'cb-filtros' }, filtros.map(function (f) { return el('button', { type: 'button', class: 'cb-f' + (st.filtro === f[0] ? ' on' : ''), onclick: function () { st.filtro = f[0]; pintarHist(filas); } }, [f[1]]); })));
    if (error) { h.appendChild(el('div', { class: 'empty', text: 'No se pudieron cargar las llamadas.' })); return; }
    var v = filas.filter(function (l) {
      if (st.filtro === 'salientes' && l.direccion !== 'saliente') return false;
      if (st.filtro === 'entrantes' && l.direccion !== 'entrante') return false;
      if (st.filtro === 'perdidas' && !(l.direccion === 'entrante' && l.estado !== 'completada')) return false;
      if (st.filtro === 'ia' && l.ia_estado !== 'listo') return false;
      return !st.q || [quien(l), l.numero, l.ia && l.ia.resumen].join(' ').toLowerCase().indexOf(st.q) !== -1;
    });
    if (!v.length) { h.appendChild(el('div', { class: 'empty' }, filas.length ? ['No hay llamadas con ese filtro.'] : [el('b', { text: 'Todavía no hay llamadas' }), 'Haz tu primera llamada con el marcador o sube una grabación.'])); return; }
    var lista = el('div', { class: 'll-lista' });
    v.forEach(function (l, i) {
      var perdida = l.direccion === 'entrante' && l.estado !== 'completada';
      var tipo = l.canal === 'grabacion' ? 'gr' : perdida ? 'per' : l.direccion === 'entrante' ? 'ent' : 'sal';
      var ico = { gr: 'i-upload', per: 'i-x', ent: 'i-down', sal: 'i-up' }[tipo];
      var iaE = IA_EST[l.ia_estado];
      lista.appendChild(el('button', { type: 'button', class: 'll-fila', style: 'animation-delay:' + Math.min(i * 30, 300) + 'ms', onclick: function () { detalle(l); } }, [
        el('span', { class: 'll-ico ' + tipo, title: { gr: 'Grabación subida', per: 'Perdida', ent: 'Entrante', sal: 'Saliente' }[tipo] }, [A.icon(ico, 'icon-sm')]),
        el('div', { class: 'll-t' }, [el('b', { text: quien(l) }),
          el('span', { class: 'muted', text: A.hace(l.created_at) + (l.duracion_seg ? ' · ' + dur(l.duracion_seg) : '') + (l.canal === 'grabacion' ? ' · grabación subida' : perdida ? ' · ' + ESTADOS[l.estado].toLowerCase() : '') }),
          l.ia && l.ia.resumen ? el('span', { class: 'll-res', text: l.ia.resumen }) : null]),
        el('div', { class: 'll-chips' }, [iaE ? el('span', { class: 'll-ia ' + iaE[1] }, [A.icon('i-sparkles', 'icon-sm'), iaE[0]]) : null, l.grabacion_path ? el('span', { class: 'll-rec', title: 'Tiene grabación' }, [el('i')]) : null])
      ]));
    });
    h.appendChild(lista);
  }

  /* ---------- Detalle de una llamada ---------- */
  async function detalle(l) {
    var aviso = el('div', { class: 'msg', hidden: true });
    var cuerpo = [aviso];
    if (l.grabacion_path) {
      var audio = el('audio', { controls: true, preload: 'none', class: 'll-audio' });
      cuerpo.push(el('div', { class: 'd-sec' }, [el('h3', { text: 'Grabación' }), audio]));
      sb.storage.from(BUCKET).createSignedUrl(l.grabacion_path, 3600).then(function (r) { if (r.data) audio.src = r.data.signedUrl; });
    }
    var ia = l.ia || {};
    var sec = el('div', { class: 'd-sec' }, [el('h3', { text: 'Lo que extrajo la IA' })]);
    if (l.ia_estado === 'listo') {
      if (ia.resumen) sec.appendChild(el('p', { class: 'll-resumen', text: ia.resumen }));
      if (ia.necesita) sec.appendChild(el('p', { class: 'muted', text: 'Necesita: ' + ia.necesita }));
      if ((ia.datos || []).length) {
        sec.appendChild(el('h4', { class: 'll-h4', text: 'Datos que dio' }));
        sec.appendChild(el('div', { class: 'fm-resp' }, ia.datos.map(function (d) {
          return el('div', { class: 'fm-r' }, [el('span', { class: 'muted', text: d.campo }), el('span', null, [d.valor + ' ', el('button', { type: 'button', class: 'mini-btn', text: 'Copiar', onclick: function () { navigator.clipboard.writeText(d.valor).then(function () { A.toast('Copiado.'); }); } })])]);
        })));
      }
      if ((ia.documentos_pendientes || []).length) { sec.appendChild(el('h4', { class: 'll-h4', text: 'Documentos pendientes' })); sec.appendChild(el('ul', { class: 'll-ul' }, ia.documentos_pendientes.map(function (x) { return el('li', { text: x }); }))); }
      if ((ia.proximos_pasos || []).length) { sec.appendChild(el('h4', { class: 'll-h4', text: 'Próximos pasos' })); sec.appendChild(el('ul', { class: 'll-ul' }, ia.proximos_pasos.map(function (x) { return el('li', { text: x }); }))); }
      if ((ia.tareas || []).length && A.puede('tareas')) {
        sec.appendChild(el('h4', { class: 'll-h4', text: 'Tareas sugeridas' }));
        var crear = async function (t, b) {
          var f = new Date(Date.now() + (t.en_dias || 0) * 864e5).toLocaleDateString('en-CA');
          var r = await sb.from('tareas').insert({ titulo: t.titulo.slice(0, 200), fecha: f, asignada_a: A.yo().user_id, cliente_id: l.cliente_id, enlace: 'llamadas/ver/' + l.id, creada_por: A.yo().user_id });
          if (r.error) { A.toast('No se pudo crear la tarea.', 'error'); return false; }
          if (b) { b.disabled = true; b.textContent = 'Creada'; }
          return true;
        };
        var botones = [];
        sec.appendChild(el('div', { class: 'll-tareas' }, ia.tareas.map(function (t) {
          var b = el('button', { type: 'button', class: 'mini-btn', text: 'Crear tarea', onclick: async function () { if (await crear(t, b)) { A.toast('Tarea creada.'); A.contarTareas(); } } });
          botones.push([t, b]);
          return el('div', { class: 'll-tarea' }, [el('span', { text: t.titulo + (t.en_dias ? ' · en ' + t.en_dias + (t.en_dias === 1 ? ' día' : ' días') : ' · hoy') }), b]);
        })));
        sec.appendChild(el('button', { class: 'link-btn', type: 'button', text: 'Crear todas las tareas', onclick: async function () { var n = 0; for (var i = 0; i < botones.length; i++) if (!botones[i][1].disabled && await crear(botones[i][0], botones[i][1])) n++; A.toast(n + ' tareas creadas.'); A.contarTareas(); } }));
      }
      if (l.cliente_id && A.puede('clientes')) sec.appendChild(el('button', { class: 'btn btn-ghost btn-sm', type: 'button', style: 'margin-top:12px', onclick: async function () {
        var c = await sb.from('clientes').select('notas').eq('id', l.cliente_id).single();
        var txt = 'Llamada del ' + A.fecha(l.created_at, true) + ':\n' + (ia.resumen || '') + ((ia.documentos_pendientes || []).length ? '\nDocumentos pendientes: ' + ia.documentos_pendientes.join(', ') : '') + ((ia.proximos_pasos || []).length ? '\nPróximos pasos: ' + ia.proximos_pasos.join('; ') : '');
        var u = await sb.from('clientes').update({ notas: ((c.data && c.data.notas ? c.data.notas + '\n\n' : '') + txt).slice(0, 8000) }).eq('id', l.cliente_id);
        A.toast(u.error ? 'No se pudo guardar.' : 'Resumen guardado en las notas del cliente.', u.error ? 'error' : '');
      } }, [A.icon('i-edit', 'icon-sm'), el('span', { text: 'Guardar resumen en sus notas' })]));
      // Transcripción completa (con datos sensibles): solo con permiso, queda registrado
      var tr = el('div', { class: 'll-tr' });
      tr.appendChild(A.puede('sensibles') ? el('button', { class: 'link-btn', type: 'button', text: 'Ver transcripción completa', onclick: async function () {
        var r = await sb.rpc('ver_transcripcion', { p_id: l.id });
        if (r.error) { A.toast('No se pudo abrir la transcripción.', 'error'); return; }
        tr.innerHTML = ''; tr.appendChild(el('pre', { text: r.data || '(vacía)' }));
      } }) : el('span', { class: 'muted', text: 'La transcripción completa requiere el permiso «Datos sensibles».' }));
      sec.appendChild(el('h4', { class: 'll-h4', text: 'Transcripción' })); sec.appendChild(tr);
    } else if (l.ia_estado === 'procesando' || (l.ia_estado === 'pendiente' && l.grabacion_path)) {
      sec.appendChild(el('p', { class: 'muted', text: 'La IA está escuchando la grabación. En unos segundos verás el resumen.' }));
    } else if (l.ia_estado === 'error') {
      sec.appendChild(el('p', { class: 'msg err', text: l.ia_error || 'No se pudo procesar.' }));
    } else sec.appendChild(el('p', { class: 'muted', text: 'Esta llamada no tiene grabación.' }));
    if (l.grabacion_path && l.ia_estado !== 'procesando') sec.appendChild(el('button', { class: 'link-btn', type: 'button', style: 'display:block;margin-top:10px', text: l.ia_estado === 'listo' ? 'Procesar de nuevo' : 'Procesar con IA', onclick: function () { procesar(l); } }));
    cuerpo.push(sec);

    // Cliente y notas
    var notas = el('textarea', { class: 'input', rows: 3, maxlength: 2000, placeholder: 'Notas de la llamada' }); notas.value = l.notas || '';
    var clienteSec = el('div', { class: 'd-sec' }, [el('h3', { text: 'Cliente' })]);
    if (l.cliente_id) clienteSec.appendChild(el('a', { class: 'btn btn-ghost btn-sm', href: '#/clientes/' + l.cliente_id }, [A.icon('i-users', 'icon-sm'), el('span', { text: 'Ver ficha de ' + quien(l) })]));
    else {
      var lista = await A.clientesBasicos();
      var sel = el('select', { class: 'input sm' }, [el('option', { value: '', text: 'Ligar a un cliente…' })].concat(lista.map(function (c) { return el('option', { value: c.id, text: A.nombreDe(c) }); })));
      clienteSec.appendChild(el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, [sel, el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Ligar', onclick: async function () {
        if (!sel.value) return;
        var u = await sb.from('llamadas').update({ cliente_id: sel.value }).eq('id', l.id);
        if (u.error) { A.toast('No se pudo ligar.', 'error'); return; }
        A.toast('Llamada ligada al cliente.'); A.cerrarDrawer(); cargar();
      } }), A.puede('clientes') ? el('button', { class: 'btn btn-dark btn-sm', type: 'button', text: 'Crear cliente', onclick: async function () {
        var partes = String(ia.nombre_cliente || '').trim().split(/\s+/);
        var n = await A.nuevoClienteBD({ nombre: partes[0] || 'Cliente', apellidos: partes.slice(1).join(' ') || null, telefono: l.numero ? bonito(l.numero) : null, origen: 'otro', notas: ia.resumen ? 'De una llamada: ' + ia.resumen : null }).select('id').single();
        if (n.error) { A.toast('No se pudo crear el cliente.', 'error'); return; }
        await sb.from('llamadas').update({ cliente_id: n.data.id }).eq('id', l.id);
        A.toast('Cliente creado.'); A.ir('clientes/' + n.data.id);
      } }) : null]));
    }
    clienteSec.appendChild(el('div', { class: 'field', style: 'margin-top:12px' }, [el('label', { text: 'Notas' }), notas]));
    clienteSec.appendChild(el('button', { class: 'btn btn-ghost btn-sm', type: 'button', style: 'margin-top:8px', text: 'Guardar notas', onclick: async function () {
      var u = await sb.from('llamadas').update({ notas: notas.value.trim() || null }).eq('id', l.id);
      A.toast(u.error ? 'No se pudo guardar.' : 'Notas guardadas.', u.error ? 'error' : '');
    } }));
    cuerpo.push(clienteSec);

    var pie = [];
    if (l.numero) pie.push(el('button', { class: 'btn btn-dark', type: 'button', onclick: function () { A.cerrarDrawer(); ui.num.value = bonito(l.numero); if (l.clientes) elegir(Object.assign({ id: l.cliente_id }, l.clientes)); ui.marcador.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }, [A.icon('i-phone'), el('span', { text: 'Volver a llamar' })]));
    pie.push(el('button', { class: 'link-btn danger', type: 'button', text: 'Eliminar llamada y grabación', onclick: async function () {
      if (!confirm('¿Eliminar esta llamada y su grabación? No se puede deshacer.')) return;
      if (l.grabacion_path) await sb.storage.from(BUCKET).remove([l.grabacion_path]);
      var d = await sb.from('llamadas').delete().eq('id', l.id);
      if (d.error) { A.msg(aviso, 'No se pudo eliminar.'); return; }
      A.toast('Llamada eliminada.'); A.cerrarDrawer(); cargar();
    } }));
    A.drawer({ titulo: quien(l), meta: (l.direccion === 'entrante' ? 'Entrante' : l.canal === 'grabacion' ? 'Grabación subida' : 'Saliente') + ' · ' + A.fecha(l.created_at, true) + (l.duracion_seg ? ' · ' + dur(l.duracion_seg) : '') + (l.con_aviso === false ? ' · grabada sin aviso (Texas)' : l.con_aviso ? ' · con aviso de grabación' : ''), cuerpo: cuerpo, pie: pie, mantenerScroll: true });
  }

  async function procesar(l) {
    A.toast('La IA está escuchando la grabación…');
    var r = await sb.functions.invoke('llamadas', { body: { accion: 'procesar', llamada_id: l.id } });
    var n = await sb.from('llamadas').select(COLS).eq('id', l.id).maybeSingle();
    if (r.error) { var e = {}; try { e = await r.error.context.json(); } catch (_) { /* */ } A.toast(e.error || 'No se pudo procesar.', 'error'); }
    else A.toast('Listo: la IA extrajo la información de la llamada.');
    if (n.data) detalle(n.data);
    cargar();
  }

  /* ---------- Subir una grabación (llamada desde el celular, reunión…) ---------- */
  async function subir() {
    var clientes = await A.clientesBasicos();
    var archivo = el('input', { type: 'file', accept: 'audio/*,video/mp4,.m4a,.mp3,.wav,.ogg,.opus,.aac,.webm' });
    var m = A.modal({
      titulo: 'Subir grabación', ok: 'Subir y analizar',
      campos: [
        { k: 'cliente_id', label: 'Cliente', type: 'select', full: true, value: st.cliente ? st.cliente.id : '', options: [['', 'Todavía no es cliente / no sé']].concat(clientes.map(function (c) { return [c.id, A.nombreDe(c)]; })) },
        { k: 'direccion', label: 'Tipo', type: 'select', value: 'saliente', options: [['saliente', 'Yo llamé'], ['entrante', 'Me llamaron']] },
        { k: 'fecha', label: 'Fecha y hora', type: 'datetime-local', value: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) }
      ],
      extra: el('div', { class: 'field', style: 'margin-top:12px' }, [el('label', { text: 'Archivo de audio (hasta 25 MB)' }), archivo,
        el('p', { class: 'muted', style: 'margin-top:8px;font-size:12.5px', text: 'Sirve la grabación de una llamada, una nota de voz o una reunión en persona. La IA la transcribe y extrae los datos, documentos pendientes, próximos pasos y tareas.' })]),
      guardar: async function (d, aviso) {
        var f = archivo.files[0];
        if (!f) { A.msg(aviso, 'Elige el archivo de audio.'); return false; }
        if (f.size > 25 * 1024 * 1024) { A.msg(aviso, 'El archivo pesa más de 25 MB. Recórtalo o exporta en menor calidad.'); return false; }
        A.msg(aviso, 'Subiendo la grabación…', 'ok');
        var id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
        var ext = (/\.([a-z0-9]{2,5})$/i.exec(f.name) || [0, 'mp3'])[1].toLowerCase();
        var path = 'subidas/' + id + '.' + ext;
        var up = await sb.storage.from(BUCKET).upload(path, f, { contentType: f.type || 'audio/mpeg' });
        if (up.error) { A.msg(aviso, 'No se pudo subir el archivo.'); return false; }
        var r = await sb.from('llamadas').insert({ direccion: d.direccion, canal: 'grabacion', cliente_id: d.cliente_id || null, estado: 'completada', inicio: d.fecha ? new Date(d.fecha).toISOString() : null, created_at: d.fecha ? new Date(d.fecha).toISOString() : undefined, grabacion_path: path, ia_estado: 'pendiente', usuario: A.yo().user_id }).select(COLS).single();
        if (r.error) { await sb.storage.from(BUCKET).remove([path]); A.msg(aviso, 'No se pudo guardar.'); return false; }
        // Duración del audio (para el historial)
        try { var a = new Audio(URL.createObjectURL(f)); a.addEventListener('loadedmetadata', function () { if (isFinite(a.duration)) sb.from('llamadas').update({ duracion_seg: Math.round(a.duration) }).eq('id', r.data.id).then(function () {}); }); } catch (_) { /* */ }
        setTimeout(function () { procesar(r.data); }, 50);
      }
    });
    return m;
  }
})();
