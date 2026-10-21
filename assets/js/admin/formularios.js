/* Panel CRM — Formularios: crea formularios con su enlace público y recibe las respuestas */
(function () {
  'use strict';
  var A = window.AVA, el = A.el, sb = A.sb;
  var SITIO = 'https://avamultiservices.com';
  var BUCKET = 'documentos';
  var COLS_R = 'id,created_at,formulario_id,datos,archivos,nombre,apellidos,telefono,email,estado,cliente_id,caso_id,notas';
  var ESTADOS = { nuevo: 'Nueva', en_proceso: 'En proceso', completado: 'Completada', archivado: 'Archivada' };

  // Tipos de pregunta: [nombre, icono, descripción]
  var TIPOS = {
    seccion: ['Sección', 'i-layout', 'Título que separa el formulario en partes'],
    texto: ['Texto corto', 'i-edit', 'Nombre, ciudad, empleador…'],
    parrafo: ['Párrafo', 'i-list', 'Respuesta larga'],
    telefono: ['Teléfono', 'i-phone', 'Con validación de 10 dígitos'],
    email: ['Correo', 'i-mail', 'Con validación'],
    fecha: ['Fecha', 'i-calendar', 'Calendario para elegir el día'],
    numero: ['Número', 'i-calculator', 'Cantidades, años, dependientes'],
    opciones: ['Una opción', 'i-check', 'El cliente elige una'],
    multiple: ['Varias opciones', 'i-clipboard', 'El cliente marca varias'],
    lista: ['Lista desplegable', 'i-list', 'Para muchas opciones'],
    si_no: ['Sí / No', 'i-check', 'Pregunta rápida'],
    archivo: ['Subir archivos', 'i-upload', 'Fotos o PDF, hasta 5'],
    firma: ['Firma', 'i-edit', 'Firma con el dedo'],
    sensible: ['Seguro Social / ITIN', 'i-lock', 'Se guarda bajo llave'],
    acepto: ['Casilla de acepto', 'i-shield', 'Autorizaciones y términos']
  };
  var CON_OPCIONES = { opciones: 1, multiple: 1, lista: 1 };
  var MAPAS = [['', 'No'], ['nombre', 'Nombre del cliente'], ['apellidos', 'Apellidos'], ['telefono', 'Teléfono'], ['email', 'Correo']];

  function nid() { return 'c' + Math.random().toString(36).slice(2, 8); }
  function C(tipo, etiqueta, o) { return Object.assign({ id: nid(), tipo: tipo, etiqueta: etiqueta, requerido: false }, o || {}); }
  function contacto() {
    return [C('seccion', 'Tus datos', { ayuda: 'Para poder contactarte.' }), C('texto', 'Nombre', { requerido: true, mapa: 'nombre' }), C('texto', 'Apellidos', { requerido: true, mapa: 'apellidos' }),
      C('telefono', 'Teléfono', { requerido: true, mapa: 'telefono' }), C('email', 'Correo electrónico', { mapa: 'email' })];
  }
  var PLANTILLAS = [
    { k: 'blanco', t: 'En blanco', d: 'Empieza con los datos de contacto y agrega tus preguntas.', ic: 'i-plus', f: function () { return { titulo: 'Nuevo formulario', descripcion: '', servicio: null, campos: contacto() }; } },
    { k: 'taxes', t: 'Taxes 2026', d: 'Datos de la declaración, dependientes, W-2 / 1099 y firma.', ic: 'i-calculator', f: function () {
      return { titulo: 'Preparación de taxes 2026', servicio: 'taxes', descripcion: 'Completa tus datos y sube tus documentos para preparar tu declaración. Toda la información es confidencial.',
        mensaje_final: 'Gracias. Revisaremos tus documentos y te escribiremos si falta algo. Si quieres, agenda tu cita en avamultiservices.com/citas.',
        campos: contacto().concat([C('fecha', 'Fecha de nacimiento'), C('sensible', 'Número de Seguro Social o ITIN', { requerido: true }),
          C('seccion', 'Tu declaración', { ayuda: 'Cuéntanos cómo trabajaste este año.' }),
          C('opciones', 'Estado civil', { requerido: true, opciones: ['Soltero/a', 'Casado/a declarando juntos', 'Casado/a declarando separado', 'Cabeza de familia', 'Viudo/a'] }),
          C('multiple', '¿Cómo recibiste ingresos?', { requerido: true, opciones: ['W-2 (empleado)', '1099 (contratista)', 'Negocio propio', 'Uber / Lyft / delivery', 'Desempleo', 'Otro'] }),
          C('numero', '¿Cuántos dependientes tienes?'), C('si_no', '¿Hicimos tus taxes el año pasado?'),
          C('texto', 'Cuenta y ruta bancaria para el reembolso (opcional)', { ayuda: 'Si prefieres, te la pedimos en la cita.' }),
          C('seccion', 'Documentos', { ayuda: 'Fotos claras o PDF.' }), C('archivo', 'ID con foto (licencia o pasaporte)', { requerido: true }), C('archivo', 'W-2, 1099 y otros formularios de ingresos', { requerido: true }),
          C('archivo', 'Declaración del año pasado (si la tienes)'), C('seccion', 'Autorización'),
          C('acepto', 'Autorizo a AVA Multiservices a preparar mi declaración con la información que entrego y confirmo que es verdadera.', { requerido: true }), C('firma', 'Tu firma', { requerido: true })]) };
    } },
    { k: 'llc', t: 'Formación de LLC', d: 'Nombre del negocio, socios, dirección y documentos.', ic: 'i-building', f: function () {
      return { titulo: 'Formación de tu LLC en Texas', servicio: 'llc', descripcion: 'Con esta información registramos tu LLC, sacamos el EIN y preparamos el Operating Agreement.',
        campos: contacto().concat([C('seccion', 'Tu negocio'), C('texto', 'Nombre que quieres para la LLC', { requerido: true, ayuda: 'Escribe 2 o 3 opciones por si el primero no está disponible.' }),
          C('parrafo', '¿A qué se dedica el negocio?', { requerido: true }), C('opciones', '¿Cuántos dueños tendrá?', { requerido: true, opciones: ['Solo yo', '2 socios', '3 o más'] }),
          C('parrafo', 'Nombre completo y porcentaje de cada socio'), C('texto', 'Dirección del negocio', { requerido: true }), C('sensible', 'Seguro Social o ITIN del dueño principal (para el EIN)'),
          C('seccion', 'Documentos'), C('archivo', 'ID con foto de cada socio', { requerido: true }), C('acepto', 'Confirmo que la información es correcta.', { requerido: true })]) };
    } },
    { k: 'inmigracion', t: 'Inmigración', d: 'Trámite, datos personales y documentos para revisar.', ic: 'i-passport', f: function () {
      return { titulo: 'Documentos migratorios', servicio: 'inmigracion', descripcion: 'Preparamos y revisamos formularios de USCIS. No somos abogados ni damos asesoría legal.',
        campos: contacto().concat([C('lista', '¿Qué trámite necesitas?', { requerido: true, opciones: ['Renovación de permiso de trabajo', 'Renovación de green card', 'Ciudadanía', 'Petición familiar', 'Cambio de dirección', 'Traducción de documentos', 'Otro'] }),
          C('fecha', 'Fecha de nacimiento'), C('texto', 'País de nacimiento'), C('texto', 'Número A (si lo tienes)'), C('parrafo', 'Cuéntanos tu caso'),
          C('archivo', 'Documentos que tengas (permiso, green card, cartas de USCIS)'), C('acepto', 'Entiendo que AVA Multiservices prepara formularios y no da asesoría legal.', { requerido: true })]) };
    } },
    { k: 'notaria', t: 'Notaría', d: 'Tipo de documento, fecha deseada e identificación.', ic: 'i-stamp', f: function () {
      return { titulo: 'Solicitud de notaría', servicio: 'otro', descripcion: 'Poderes, affidavits, permisos de viaje y más.',
        campos: contacto().concat([C('lista', '¿Qué documento necesitas notarizar?', { requerido: true, opciones: ['Poder notarial', 'Permiso de viaje para menor', 'Affidavit / declaración jurada', 'Carta de invitación', 'Otro'] }),
          C('fecha', '¿Para qué día lo necesitas?'), C('parrafo', 'Detalles'), C('archivo', 'Foto de tu ID')]) };
    } },
    { k: 'contabilidad', t: 'Contabilidad mensual', d: 'Datos del negocio y estados de cuenta.', ic: 'i-trending', f: function () {
      return { titulo: 'Contabilidad mensual', servicio: 'contabilidad', descripcion: 'Llevamos los libros de tu negocio cada mes.',
        campos: contacto().concat([C('texto', 'Nombre del negocio', { requerido: true }), C('opciones', 'Tipo de negocio', { opciones: ['LLC', 'Corporación', 'Negocio propio (sole proprietor)'] }),
          C('numero', '¿Cuántas cuentas de banco usa el negocio?'), C('si_no', '¿Tienes empleados?'), C('archivo', 'Estados de cuenta del último mes')]) };
    } },
    { k: 'contacto', t: 'Contacto general', d: 'Nombre, teléfono, servicio de interés y mensaje.', ic: 'i-message', f: function () {
      return { titulo: 'Cuéntanos qué necesitas', servicio: null, descripcion: 'Te contestamos el mismo día.',
        campos: contacto().concat([C('lista', '¿Qué servicio te interesa?', { requerido: true, opciones: ['Taxes', 'Reparación de crédito', 'Formación de LLC', 'Inmigración', 'Notaría', 'Contabilidad', 'Otro'] }), C('parrafo', 'Tu mensaje')]) };
    } }
  ];

  function slugDe(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'formulario'; }
  function urlDe(f) { return SITIO + '/f/?s=' + f.slug; }
  function compartir(f) { window.open('https://wa.me/?text=' + encodeURIComponent('Hola, por favor completa este formulario de AVA Multiservices: ' + urlDe(f)), '_blank', 'noopener'); }
  function copiar(txt, msg) { navigator.clipboard.writeText(txt).then(function () { A.toast(msg || 'Enlace copiado.'); }, function () { A.toast(txt); }); }

  /* ---------- Lista de formularios ---------- */
  A.vista('formularios', {
    permiso: 'solicitudes',
    render: function (cont, partes) {
      if (partes[0]) { editor(cont, partes[0]); return; }
      lista(cont);
    }
  });

  async function lista(cont) {
    cont.appendChild(A.cabecera('Captura', 'Formularios', 'con tu marca', [
      el('a', { class: 'btn btn-ghost btn-sm', href: '#/respuestas' }, [A.icon('i-inbox'), el('span', { text: 'Respuestas' })]),
      el('button', { class: 'btn btn-dark btn-sm', type: 'button', onclick: elegirPlantilla }, [A.icon('i-plus'), el('span', { text: 'Nuevo formulario' })])
    ]));
    cont.appendChild(el('div', { class: 'alert ok', style: 'margin-top:14px' }, [A.icon('i-sparkles', 'icon-sm'), 'Crea un formulario, comparte su enlace por WhatsApp o en tu bio, y cada respuesta llega a Solicitudes → Formularios con sus documentos.']));
    var box = el('div', { class: 'fm-grid' }, [el('div', { class: 'empty', text: 'Cargando…' })]);
    cont.appendChild(box);
    var r = await Promise.all([
      sb.from('formularios').select('id,slug,titulo,descripcion,servicio,activo,campos,updated_at').order('created_at', { ascending: false }),
      sb.from('formulario_respuestas').select('formulario_id,estado').limit(10000),
      sb.from('cuestionarios').select('estado,nuevo').neq('estado', 'archivado').limit(10000)
    ]);
    box.innerHTML = '';
    if (r[0].error) { box.appendChild(el('div', { class: 'empty', text: 'No se pudieron cargar los formularios.' })); return; }
    box.appendChild(tarjetaI130(r[2].data || []));
    var cuenta = {};
    (r[1].data || []).forEach(function (x) { var c = cuenta[x.formulario_id] = cuenta[x.formulario_id] || { t: 0, n: 0 }; c.t++; if (x.estado === 'nuevo') c.n++; });
    if (!r[0].data.length) {
      box.appendChild(el('div', { class: 'empty fm-vacio' }, [el('b', { text: 'Tu primer formulario' }), 'Empieza con una plantilla, por ejemplo la de Taxes 2026, y ajústala a tu gusto.',
        el('button', { class: 'btn btn-dark btn-sm', type: 'button', style: 'margin-top:14px', onclick: elegirPlantilla }, [A.icon('i-plus'), el('span', { text: 'Crear formulario' })])]));
      return;
    }
    r[0].data.forEach(function (f, i) {
      var c = cuenta[f.id] || { t: 0, n: 0 };
      var preguntas = (f.campos || []).filter(function (x) { return x.tipo !== 'seccion'; }).length;
      var sw = el('label', { class: 'switch', title: f.activo ? 'Activo: recibe respuestas' : 'Apagado: el enlace no funciona' }, [el('input', { type: 'checkbox', checked: f.activo || null, onchange: async function () {
        var u = await sb.from('formularios').update({ activo: this.checked }).eq('id', f.id);
        if (u.error) { A.toast('No se pudo cambiar.', 'error'); this.checked = !this.checked; return; }
        f.activo = this.checked; tarjeta.classList.toggle('off', !f.activo); A.toast(f.activo ? 'Formulario activo.' : 'Formulario apagado: el enlace ya no recibe respuestas.');
      } }), el('span')]);
      var tarjeta = el('div', { class: 'fm-card' + (f.activo ? '' : ' off'), style: 'animation-delay:' + Math.min(i * 50, 400) + 'ms', 'data-svc': f.servicio || 'otro' }, [
        el('div', { class: 'fm-top' }, [el('span', { class: 'fm-ico' }, [A.icon('i-clipboard', 'icon-sm')]), el('div', { class: 'fm-tt' }, [el('b', { text: f.titulo }), el('span', { class: 'muted', text: preguntas + (preguntas === 1 ? ' pregunta' : ' preguntas') + (f.servicio && A.SERVICIOS[f.servicio] ? ' · abre caso de ' + A.SERVICIOS[f.servicio].corto : '') })]), sw]),
        el('div', { class: 'fm-link' }, [el('code', { text: 'avamultiservices.com/f/?s=' + f.slug }),
          el('button', { class: 'mini-btn', type: 'button', text: 'Copiar', onclick: function () { copiar(urlDe(f)); } })]),
        el('div', { class: 'fm-num' }, [
          el('a', { href: '#/respuestas/' + f.id }, [el('b', { text: c.t }), el('span', { text: c.t === 1 ? 'respuesta' : 'respuestas' })]),
          c.n ? el('a', { class: 'nuevas', href: '#/respuestas/' + f.id }, [el('b', { text: c.n }), el('span', { text: c.n === 1 ? 'nueva' : 'nuevas' })]) : null
        ]),
        el('div', { class: 'fm-acc' }, [
          el('a', { class: 'btn btn-dark btn-sm', href: '#/formularios/' + f.id }, [A.icon('i-edit', 'icon-sm'), el('span', { text: 'Editar' })]),
          el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: function () { compartir(f); } }, [A.icon('i-whatsapp', 'icon-sm'), el('span', { text: 'Compartir' })]),
          el('a', { class: 'btn btn-ghost btn-sm', href: urlDe(f).replace(SITIO, location.hostname === '192.0.2.2' ? location.origin : SITIO), target: '_blank', rel: 'noopener', title: 'Abrir el formulario' }, [A.icon('i-external', 'icon-sm')])
        ])
      ]);
      box.appendChild(tarjeta);
    });
  }

  // Cuestionario I-130: no tiene un enlace público único, cada pareja recibe el suyo
  function tarjetaI130(qs) {
    var nuevos = qs.filter(function (x) { return x.nuevo; }).length, llenando = qs.filter(function (x) { return x.estado === 'borrador'; }).length;
    return el('div', { class: 'fm-card fm-i130', 'data-svc': 'inmigracion' }, [
      el('div', { class: 'fm-top' }, [el('span', { class: 'fm-ico' }, [A.icon('i-passport', 'icon-sm')]), el('div', { class: 'fm-tt' }, [el('b', { text: 'Petición por matrimonio (I-130)' }), el('span', { class: 'muted', text: 'Por pasos · guardar y volver · documentos ahora o después' })]),
        el('span', { class: 'fm-tag', text: 'Por pareja' })]),
      el('p', { class: 'muted', style: 'font-size:13px', text: 'Cada pareja recibe su propio enlace. Créalo aquí o desde la ficha del cliente.' }),
      el('div', { class: 'fm-num' }, [
        el('a', { href: '#/cuestionarios' }, [el('b', { text: qs.length }), el('span', { text: qs.length === 1 ? 'activo' : 'activos' })]),
        llenando ? el('a', { href: '#/cuestionarios' }, [el('b', { text: llenando }), el('span', { text: 'llenando' })]) : null,
        nuevos ? el('a', { class: 'nuevas', href: '#/cuestionarios' }, [el('b', { text: nuevos }), el('span', { text: nuevos === 1 ? 'nuevo' : 'nuevos' })]) : null
      ]),
      el('div', { class: 'fm-acc' }, [
        el('button', { class: 'btn btn-dark btn-sm', type: 'button', onclick: function () { A.nuevoCuestionario({ alCrear: function () { } }); } }, [A.icon('i-plus', 'icon-sm'), el('span', { text: 'Nuevo enlace' })]),
        el('a', { class: 'btn btn-ghost btn-sm', href: '#/cuestionarios' }, [A.icon('i-list', 'icon-sm'), el('span', { text: 'Ver respuestas' })])
      ])
    ]);
  }

  function elegirPlantilla() {
    var grid = el('div', { class: 'fm-plantillas' });
    var m = A.modal({ titulo: 'Nuevo formulario', ok: 'Cerrar', campos: [], extra: el('div', null, [el('p', { class: 'muted', style: 'margin-bottom:12px', text: 'Elige una plantilla. Después cambias, quitas o agregas lo que quieras.' }), grid]), guardar: function () {} });
    PLANTILLAS.forEach(function (p) {
      grid.appendChild(el('button', { type: 'button', class: 'fm-pl', onclick: async function () {
        this.disabled = true;
        var d = p.f();
        var base = slugDe(d.titulo), slug = base, intento = 1, r;
        do {
          r = await sb.from('formularios').insert({ titulo: d.titulo, descripcion: d.descripcion || null, servicio: d.servicio || null, mensaje_final: d.mensaje_final || null, campos: d.campos, slug: slug, activo: false }).select('id').single();
          if (r.error && /duplicate|unique/i.test(r.error.message)) slug = base + '-' + (++intento);
          else break;
        } while (intento < 20);
        if (r.error) { this.disabled = false; A.toast('No se pudo crear el formulario.', 'error'); return; }
        document.querySelector('.modal') && document.querySelector('.modal').remove();
        A.toast('Formulario creado. Revísalo y actívalo cuando esté listo.');
        A.ir('formularios/' + r.data.id);
      } }, [el('span', { class: 'fm-pl-ico' }, [A.icon(p.ic, 'icon-sm')]), el('b', { text: p.t }), el('span', { class: 'muted', text: p.d })]));
    });
    return m;
  }

  /* ---------- Editor ---------- */
  async function editor(cont, id) {
    var r = await sb.from('formularios').select('*').eq('id', id).maybeSingle();
    if (r.error || !r.data) { cont.appendChild(el('div', { class: 'empty', text: 'No encontramos este formulario.' })); return; }
    var f = r.data, campos = JSON.parse(JSON.stringify(f.campos || [])), abierto = null, sucio = false;
    var frame = el('iframe', { class: 'fm-frame', title: 'Vista previa del formulario', src: '../f/?vista=1' });
    var listo = false;
    window.addEventListener('message', function oir(e) {
      if (!frame.isConnected) { window.removeEventListener('message', oir); return; }
      if (e.source === frame.contentWindow && e.data && e.data.tipo === 'ava-form-listo') { listo = true; vista(); }
    });
    var tVista;
    function vista() {
      clearTimeout(tVista);
      tVista = setTimeout(function () {
        if (!listo || !frame.contentWindow) return;
        frame.contentWindow.postMessage({ tipo: 'ava-form', def: { id: f.id, slug: f.slug, titulo: inp.titulo.value || 'Formulario', descripcion: inp.descripcion.value, mensaje_final: inp.mensaje_final.value, campos: campos } }, location.origin);
      }, 250);
    }
    function cambio() { sucio = true; guardarBtn.classList.add('sucio'); estadoTxt.textContent = 'Cambios sin guardar'; vista(); }

    var guardarBtn = el('button', { class: 'btn btn-dark btn-sm', type: 'button', onclick: guardar }, [A.icon('i-check'), el('span', { text: 'Guardar' })]);
    var estadoTxt = el('span', { class: 'muted fm-estado', text: 'Todo guardado' });
    cont.appendChild(el('a', { class: 'back', href: '#/formularios' }, [A.icon('i-chevron-left', 'icon-sm'), 'Formularios']));
    cont.appendChild(A.cabecera('Editar formulario', f.titulo, '', [estadoTxt,
      el('a', { class: 'btn btn-ghost btn-sm', href: '#/respuestas/' + f.id }, [A.icon('i-inbox'), el('span', { text: 'Respuestas' })]), guardarBtn]));

    // Ajustes del formulario
    var inp = {
      titulo: el('input', { class: 'input sm', maxlength: 120, value: f.titulo }),
      slug: el('input', { class: 'input sm', maxlength: 60, value: f.slug }),
      descripcion: el('textarea', { class: 'input', maxlength: 1500, rows: 3, placeholder: 'Texto de bienvenida que verá el cliente arriba del formulario' }),
      servicio: el('select', { class: 'input sm' }, [el('option', { value: '', text: 'No abrir caso' })].concat(Object.keys(A.SERVICIOS).filter(function (k) { return !A.SERVICIOS[k].oculto; }).map(function (k) { return el('option', { value: k, text: A.SERVICIOS[k].label }); }))),
      mensaje_final: el('textarea', { class: 'input', maxlength: 600, rows: 2, placeholder: 'Gracias por confiar en AVA Multiservices. Te contactaremos muy pronto.' }),
      activo: el('input', { type: 'checkbox' })
    };
    inp.descripcion.value = f.descripcion || ''; inp.mensaje_final.value = f.mensaje_final || ''; inp.servicio.value = f.servicio || ''; inp.activo.checked = !!f.activo;
    Object.keys(inp).forEach(function (k) { inp[k].addEventListener('input', cambio); inp[k].addEventListener('change', cambio); });
    inp.slug.addEventListener('input', function () { this.value = this.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-{2,}/g, '-'); urlTxt.textContent = 'avamultiservices.com/f/?s=' + this.value; });
    var urlTxt = el('code', { text: 'avamultiservices.com/f/?s=' + f.slug });
    var ajustes = el('div', { class: 'card fm-ajustes' }, [
      el('div', { class: 'card-h' }, [el('h3', { class: 't', text: 'Ajustes' }), el('label', { class: 'switch-l' }, [el('span', { text: 'Activo' }), el('span', { class: 'switch' }, [inp.activo, el('span')])])]),
      el('div', { class: 'grid2' }, [
        el('div', { class: 'field full' }, [el('label', { text: 'Título' }), inp.titulo]),
        el('div', { class: 'field full' }, [el('label', { text: 'Descripción' }), inp.descripcion]),
        el('div', { class: 'field' }, [el('label', { text: 'Enlace' }), inp.slug]),
        el('div', { class: 'field' }, [el('label', { text: 'Al convertir en cliente, abrir caso de' }), inp.servicio]),
        el('div', { class: 'field full' }, [el('label', { text: 'Mensaje al terminar' }), inp.mensaje_final])
      ]),
      el('div', { class: 'fm-link', style: 'margin-top:12px' }, [urlTxt,
        el('button', { class: 'mini-btn', type: 'button', text: 'Copiar enlace', onclick: function () { copiar(SITIO + '/f/?s=' + inp.slug.value); } }),
        el('button', { class: 'mini-btn', type: 'button', text: 'Compartir por WhatsApp', onclick: function () { compartir({ slug: inp.slug.value }); } })])
    ]);

    var listaCampos = el('div', { class: 'fm-campos' });
    var paleta = el('div', { class: 'fm-paleta' }, Object.keys(TIPOS).map(function (t) {
      return el('button', { type: 'button', class: 'fm-tipo', title: TIPOS[t][2], onclick: function () { agregar(t); } }, [A.icon(TIPOS[t][1], 'icon-sm'), el('span', { text: TIPOS[t][0] })]);
    }));
    var izq = el('div', { class: 'fm-izq' }, [ajustes,
      el('div', { class: 'card', style: 'margin-top:16px' }, [el('div', { class: 'card-h' }, [el('h3', { class: 't', text: 'Preguntas' }), el('span', { class: 'muted', id: 'fm-n' })]), listaCampos,
        el('div', { class: 'fm-agregar' }, [el('b', { text: 'Agregar' }), paleta])])]);
    var der = el('div', { class: 'fm-der' }, [el('div', { class: 'fm-cel' }, [el('div', { class: 'fm-cel-h' }, [el('i'), el('i'), el('i'), el('span', { text: 'Vista previa en vivo' })]), frame])]);
    cont.appendChild(el('div', { class: 'fm-editor' }, [izq, der]));

    function agregar(t) {
      var c = { id: nid(), tipo: t, etiqueta: TIPOS[t][0] === 'Sección' ? 'Nueva sección' : '', requerido: false };
      if (CON_OPCIONES[t]) c.opciones = ['Opción 1', 'Opción 2'];
      if (t === 'acepto') c.etiqueta = 'Acepto los términos y autorizo a AVA Multiservices…';
      campos.push(c); abierto = c.id; pintar(); cambio();
      setTimeout(function () { var n = listaCampos.querySelector('[data-id="' + c.id + '"] .fm-et'); if (n) { n.scrollIntoView({ behavior: 'smooth', block: 'center' }); n.focus(); } }, 50);
    }
    function mover(i, d) { var j = i + d; if (j < 0 || j >= campos.length) return; var x = campos[i]; campos[i] = campos[j]; campos[j] = x; pintar(); cambio(); }

    function pintar() {
      listaCampos.innerHTML = '';
      document.getElementById('fm-n').textContent = campos.filter(function (c) { return c.tipo !== 'seccion'; }).length + ' preguntas';
      if (!campos.length) listaCampos.appendChild(el('div', { class: 'muted', style: 'padding:14px 0', text: 'Todavía no hay preguntas. Agrega la primera abajo.' }));
      campos.forEach(function (c, i) {
        var T = TIPOS[c.tipo] || TIPOS.texto, abiertoYa = abierto === c.id;
        var et = el('input', { class: 'fm-et', value: c.etiqueta || '', maxlength: 300, placeholder: c.tipo === 'seccion' ? 'Título de la sección' : 'Escribe la pregunta', 'aria-label': 'Pregunta', oninput: function () { c.etiqueta = this.value; cambio(); }, onfocus: function () { if (abierto !== c.id) { abierto = c.id; marcar(); } } });
        var cuerpo = el('div', { class: 'fm-cuerpo' });
        if (c.tipo !== 'acepto') cuerpo.appendChild(el('div', { class: 'field' }, [el('label', { text: c.tipo === 'seccion' ? 'Texto debajo del título' : 'Ayuda (opcional)' }), el('input', { class: 'input sm', maxlength: 300, value: c.ayuda || '', placeholder: c.tipo === 'seccion' ? 'Por ejemplo: para poder contactarte' : 'Texto pequeño debajo de la pregunta', oninput: function () { c.ayuda = this.value || undefined; cambio(); } })]));
        if (CON_OPCIONES[c.tipo]) {
          var op = el('textarea', { class: 'input', rows: 4, oninput: function () { c.opciones = this.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 40); cambio(); } });
          op.value = (c.opciones || []).join('\n');
          cuerpo.appendChild(el('div', { class: 'field' }, [el('label', { text: 'Opciones (una por línea)' }), op]));
        }
        var fila = el('div', { class: 'fm-fila' });
        if (c.tipo !== 'seccion') {
          var req = el('input', { type: 'checkbox', checked: c.requerido || null, onchange: function () { c.requerido = this.checked; cambio(); pintarCabeza(); } });
          fila.appendChild(el('label', { class: 'switch-l' }, [el('span', { class: 'switch' }, [req, el('span')]), el('span', { text: 'Obligatoria' })]));
        }
        if (c.tipo === 'texto' || c.tipo === 'telefono' || c.tipo === 'email') {
          var mapa = el('select', { class: 'input sm', onchange: function () { c.mapa = this.value || undefined; cambio(); pintarCabeza(); } }, MAPAS.map(function (m) { return el('option', { value: m[0], text: m[1] }); }));
          mapa.value = c.mapa || '';
          fila.appendChild(el('label', { class: 'fm-mapa' }, [el('span', { text: 'Usar como dato del cliente' }), mapa]));
        }
        if (c.tipo === 'sensible') fila.appendChild(el('span', { class: 'fm-nota' }, [A.icon('i-lock', 'icon-sm'), 'Solo lo ve quien tenga el permiso «Datos sensibles» y queda registrado.']));
        if (fila.childNodes.length) cuerpo.appendChild(fila);
        var cabeza = el('div', { class: 'fm-cab' });
        function pintarCabeza() {
          cabeza.innerHTML = '';
          cabeza.appendChild(el('span', { class: 'fm-tag' }, [A.icon(T[1], 'icon-sm'), T[0]]));
          if (c.requerido) cabeza.appendChild(el('span', { class: 'fm-req', text: 'Obligatoria' }));
          if (c.mapa) cabeza.appendChild(el('span', { class: 'fm-map', text: (MAPAS.filter(function (m) { return m[0] === c.mapa; })[0] || [])[1] }));
          cabeza.appendChild(el('span', { style: 'flex:1' }));
          cabeza.appendChild(el('button', { type: 'button', class: 'fm-b', title: 'Subir', 'aria-label': 'Subir', disabled: i === 0 || null, onclick: function () { mover(i, -1); } }, [A.icon('i-up', 'icon-sm')]));
          cabeza.appendChild(el('button', { type: 'button', class: 'fm-b', title: 'Bajar', 'aria-label': 'Bajar', disabled: i === campos.length - 1 || null, onclick: function () { mover(i, 1); } }, [A.icon('i-down', 'icon-sm')]));
          cabeza.appendChild(el('button', { type: 'button', class: 'fm-b', title: 'Duplicar', 'aria-label': 'Duplicar', onclick: function () { var x = JSON.parse(JSON.stringify(c)); x.id = nid(); delete x.mapa; campos.splice(i + 1, 0, x); abierto = x.id; pintar(); cambio(); } }, [A.icon('i-copy', 'icon-sm')]));
          cabeza.appendChild(el('button', { type: 'button', class: 'fm-b del', title: 'Quitar', 'aria-label': 'Quitar', onclick: function () { if (!confirm('¿Quitar «' + (c.etiqueta || T[0]) + '»?')) return; campos.splice(i, 1); pintar(); cambio(); } }, [A.icon('i-trash', 'icon-sm')]));
        }
        pintarCabeza();
        listaCampos.appendChild(el('div', { class: 'fm-campo' + (c.tipo === 'seccion' ? ' sec' : '') + (abiertoYa ? ' on' : ''), 'data-id': c.id, onclick: function (e) { if (abierto !== c.id && !e.target.closest('.fm-b')) { abierto = c.id; marcar(); } } }, [cabeza, et, cuerpo]));
      });
    }
    function marcar() { listaCampos.querySelectorAll('.fm-campo').forEach(function (n) { n.classList.toggle('on', n.dataset.id === abierto); }); }
    pintar();

    async function guardar() {
      var d = { titulo: inp.titulo.value.trim(), slug: inp.slug.value.replace(/^-+|-+$/g, ''), descripcion: inp.descripcion.value.trim() || null, servicio: inp.servicio.value || null, mensaje_final: inp.mensaje_final.value.trim() || null, activo: inp.activo.checked, campos: campos };
      if (d.titulo.length < 2) { A.toast('Escribe un título.', 'error'); inp.titulo.focus(); return; }
      if (!/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(d.slug)) { A.toast('El enlace solo puede tener letras sin acentos, números y guiones (mínimo 3).', 'error'); inp.slug.focus(); return; }
      var sinTexto = campos.filter(function (c) { return !String(c.etiqueta || '').trim(); })[0];
      if (sinTexto) { A.toast('Hay una pregunta sin texto.', 'error'); abierto = sinTexto.id; pintar(); return; }
      var sinOp = campos.filter(function (c) { return CON_OPCIONES[c.tipo] && !(c.opciones || []).length; })[0];
      if (sinOp) { A.toast('«' + sinOp.etiqueta + '» necesita al menos una opción.', 'error'); abierto = sinOp.id; pintar(); return; }
      if (d.activo && !campos.some(function (c) { return c.mapa === 'nombre'; })) { if (!confirm('Ninguna pregunta está marcada como «Nombre del cliente». Las respuestas llegarán sin nombre. ¿Guardar de todas formas?')) return; }
      guardarBtn.disabled = true;
      var u = await sb.from('formularios').update(d).eq('id', f.id);
      guardarBtn.disabled = false;
      if (u.error) { A.toast(/duplicate|unique/i.test(u.error.message) ? 'Ese enlace ya lo usa otro formulario. Elige otro.' : 'No se pudo guardar.', 'error'); return; }
      Object.assign(f, d); sucio = false; guardarBtn.classList.remove('sucio'); estadoTxt.textContent = d.activo ? 'Guardado · activo' : 'Guardado · apagado';
      cont.querySelector('.ph h1').firstChild.textContent = d.titulo;
      A.toast(d.activo ? 'Guardado. El enlace ya recibe respuestas.' : 'Guardado. Actívalo cuando esté listo para compartir.');
    }
    window.addEventListener('beforeunload', function avisar(e) { if (!frame.isConnected) { window.removeEventListener('beforeunload', avisar); return; } if (sucio) { e.preventDefault(); e.returnValue = ''; } });
    window.addEventListener('hashchange', function salir() { window.removeEventListener('hashchange', salir); if (sucio && frame.isConnected === false) A.toast('Saliste sin guardar los cambios del formulario.', 'error'); });
  }

  /* ---------- Respuestas ---------- */
  A.vista('respuestas', {
    permiso: 'solicitudes',
    render: async function (cont, partes) {
      var st = { form: partes[0] || '', estado: '', q: '' };
      cont.appendChild(A.cabecera('Formularios del sitio', 'Solicitudes', 'recibidas', [
        el('a', { class: 'btn btn-ghost btn-sm', href: '#/formularios' }, [A.icon('i-clipboard'), el('span', { text: 'Mis formularios' })]),
        el('button', { class: 'btn btn-dark btn-sm', type: 'button', onclick: exportar }, [A.icon('i-download'), el('span', { text: 'Exportar CSV' })])
      ]));
      cont.appendChild(A.pestanasEntrada('respuestas'));
      A.contarSolicitudes();
      var stats = el('div', { class: 'stats' });
      var sel = el('select', { class: 'input sm', 'aria-label': 'Formulario', style: 'flex:0 0 260px', onchange: function () { st.form = this.value; history.replaceState(null, '', '#/respuestas' + (st.form ? '/' + st.form : '')); pintar(); } }, [el('option', { value: '', text: 'Todos los formularios' })]);
      var q = el('input', { class: 'input sm', type: 'search', placeholder: 'Buscar por nombre, teléfono o correo', oninput: function () { st.q = this.value.toLowerCase(); pintar(); } });
      var list = el('div', { class: 'list' });
      cont.appendChild(stats);
      cont.appendChild(el('div', { class: 'tools' }, [q, sel]));
      cont.appendChild(list);
      list.appendChild(el('div', { class: 'empty', text: 'Cargando…' }));
      var forms = {}, filas = [];
      async function cargar() {
        var r = await Promise.all([sb.from('formularios').select('id,titulo,slug,campos,servicio').order('titulo'), sb.from('formulario_respuestas').select(COLS_R).order('created_at', { ascending: false }).limit(2000)]);
        if (r[0].error || r[1].error) { list.innerHTML = ''; list.appendChild(el('div', { class: 'empty', text: 'No se pudieron cargar las respuestas.' })); return; }
        forms = {}; (r[0].data || []).forEach(function (f) { forms[f.id] = f; });
        sel.innerHTML = ''; sel.appendChild(el('option', { value: '', text: 'Todos los formularios' }));
        r[0].data.forEach(function (f) { sel.appendChild(el('option', { value: f.id, text: f.titulo })); });
        sel.value = st.form;
        filas = r[1].data || [];
        pintar();
      }
      function vis() {
        return filas.filter(function (x) {
          if (st.form && x.formulario_id !== st.form) return false;
          if (st.estado && x.estado !== st.estado) return false;
          return !st.q || [A.nombreDe(x), x.telefono, x.email].join(' ').toLowerCase().indexOf(st.q) !== -1;
        });
      }
      function pintar() {
        var base = filas.filter(function (x) { return !st.form || x.formulario_id === st.form; });
        stats.innerHTML = '';
        [['', base.length, 'Total'], ['nuevo', base.filter(function (x) { return x.estado === 'nuevo'; }).length, 'Nuevas'], ['en_proceso', base.filter(function (x) { return x.estado === 'en_proceso'; }).length, 'En proceso'], ['completado', base.filter(function (x) { return x.estado === 'completado'; }).length, 'Completadas']].forEach(function (s) {
          stats.appendChild(el('button', { class: 'stat' + (st.estado === s[0] ? ' on' : ''), type: 'button', onclick: function () { st.estado = s[0]; pintar(); } }, [el('div', { class: 'k', text: s[1] }), el('div', { class: 'l', text: s[2] })]));
        });
        list.innerHTML = '';
        list.appendChild(el('div', { class: 'row head' }, [el('span', { text: 'Persona' }), el('span', { class: 'hide-m', text: 'Formulario' }), el('span', { class: 'hide-m', text: 'Contacto' }), el('span', { class: 'hide-m', text: 'Recibida' }), el('span', { text: 'Estado' })]));
        var v = vis();
        if (!v.length) { list.appendChild(el('div', { class: 'empty' }, filas.length ? ['No hay respuestas con esos filtros.'] : [el('b', { text: 'Aún no hay respuestas' }), 'Comparte el enlace de un formulario y las respuestas llegarán aquí.'])); return; }
        v.forEach(function (x) {
          var f = forms[x.formulario_id] || {};
          list.appendChild(el('button', { class: 'row' + (x.estado === 'nuevo' ? ' nueva' : ''), type: 'button', onclick: function () { abrir(x, f, cargar); } }, [
            el('span', { class: 'who-cell' }, [el('span', { class: 'avatar', text: A.iniciales(A.nombreDe(x) || '?') }), el('div', null, [el('div', { class: 'name', text: A.nombreDe(x) || 'Sin nombre' }), el('div', { class: 'muted', text: x.telefono || x.email || '' })])]),
            el('span', { class: 'muted hide-m', text: f.titulo || '—' }),
            el('span', { class: 'muted hide-m', text: x.email || '—' }),
            el('span', { class: 'muted hide-m', text: A.hace(x.created_at) }),
            el('span', null, [el('span', { class: 'pill ' + x.estado, text: ESTADOS[x.estado] })])
          ]));
        });
      }
      function exportar() {
        var v = vis();
        var f = st.form && forms[st.form];
        var cols = [['Recibida', function (x) { return A.fecha(x.created_at); }], ['Formulario', function (x) { return (forms[x.formulario_id] || {}).titulo; }], ['Nombre', function (x) { return A.nombreDe(x); }], ['Teléfono', 'telefono'], ['Correo', 'email'], ['Estado', function (x) { return ESTADOS[x.estado]; }]];
        if (f) (f.campos || []).forEach(function (c) { if (c.tipo === 'seccion' || c.tipo === 'archivo' || c.tipo === 'firma' || c.tipo === 'sensible' || c.mapa) return; cols.push([c.etiqueta, function (x) { return texto(x.datos[c.id]); }]); });
        A.csv('respuestas' + (f ? '-' + f.slug : ''), cols, v);
      }
      cargar();
    }
  });

  function texto(v) { if (v == null || v === '') return ''; if (Array.isArray(v)) return v.join(', '); if (v === true) return 'Sí'; if (v === false) return 'No'; return String(v); }

  async function abrir(x, f, recargar) {
    var aviso = el('div', { class: 'msg', hidden: true });
    var cuerpo = [aviso];
    var resp = el('div', { class: 'd-sec' }, [el('h3', { text: 'Respuestas' })]);
    var dl = el('div', { class: 'fm-resp' });
    var porCampo = {};
    (x.archivos || []).forEach(function (a) { (porCampo[a.campo] = porCampo[a.campo] || []).push(a); });
    (f.campos || []).forEach(function (c) {
      if (c.tipo === 'seccion') { dl.appendChild(el('div', { class: 'fm-r-sec', text: c.etiqueta })); return; }
      var valor;
      if (c.tipo === 'archivo' || c.tipo === 'firma') {
        var l = porCampo[c.id] || [];
        valor = l.length ? el('div', { class: 'fm-r-arch' }, l.map(function (a) { return el('button', { type: 'button', class: 'mini-btn', text: (c.tipo === 'firma' ? 'Ver firma' : a.nombre), onclick: function () { verArchivo(a.path); } }); })) : el('span', { class: 'muted', text: '—' });
      } else if (c.tipo === 'sensible') {
        valor = sensible(x, c.id);
      } else valor = el('span', { text: texto(x.datos[c.id]) || '—' });
      dl.appendChild(el('div', { class: 'fm-r' }, [el('span', { class: 'muted', text: c.etiqueta }), valor]));
    });
    resp.appendChild(dl);
    cuerpo.push(resp);

    var est = el('select', { class: 'input sm' }, Object.keys(ESTADOS).map(function (k) { return el('option', { value: k, text: ESTADOS[k] }); }));
    est.value = x.estado;
    var notas = el('textarea', { class: 'input', rows: 3, maxlength: 2000, placeholder: 'Notas internas' }); notas.value = x.notas || '';
    cuerpo.push(el('div', { class: 'd-sec' }, [el('h3', { text: 'Seguimiento' }), el('div', { class: 'field' }, [el('label', { text: 'Estado' }), est]), el('div', { class: 'field', style: 'margin-top:10px' }, [el('label', { text: 'Notas' }), notas]),
      el('button', { class: 'btn btn-ghost btn-sm', type: 'button', style: 'margin-top:10px', onclick: async function () {
        var u = await sb.from('formulario_respuestas').update({ estado: est.value, notas: notas.value.trim() || null }).eq('id', x.id);
        if (u.error) { A.msg(aviso, 'No se pudo guardar.'); return; }
        x.estado = est.value; x.notas = notas.value.trim() || null; A.toast('Guardado.'); A.contarSolicitudes(); recargar();
      } }, [el('span', { text: 'Guardar' })])]));

    var pie = [];
    if (x.cliente_id) pie.push(el('button', { class: 'btn btn-dark', type: 'button', onclick: function () { A.ir('clientes/' + x.cliente_id); } }, [A.icon('i-users'), el('span', { text: 'Ver ficha del cliente' })]));
    else if (A.puede('clientes')) pie.push(el('button', { class: 'btn btn-dark', type: 'button', onclick: function () { aCliente(x, f, recargar); } }, [A.icon('i-user-plus'), el('span', { text: 'Convertir en cliente' })]));
    if (x.telefono) pie.push(el('a', { class: 'btn btn-ghost', href: A.wa(x.telefono, 'Hola ' + (x.nombre || '') + ', te escribe AVA Multiservices. Recibimos tu formulario «' + (f.titulo || '') + '».'), target: '_blank', rel: 'noopener' }, [A.icon('i-whatsapp'), el('span', { text: 'WhatsApp' })]));
    pie.push(el('button', { class: 'link-btn danger', type: 'button', text: 'Eliminar respuesta y archivos', onclick: async function () {
      if (!confirm(x.cliente_id ? '¿Eliminar esta respuesta? Las copias de sus archivos se quedan en la ficha del cliente.' : '¿Eliminar esta respuesta y sus archivos? Esta acción no se puede deshacer.')) return;
      var paths = (x.archivos || []).map(function (a) { return a.path; }).filter(Boolean);
      if (paths.length) await sb.storage.from(BUCKET).remove(paths);
      var d = await sb.from('formulario_respuestas').delete().eq('id', x.id);
      if (d.error) { A.msg(aviso, 'No se pudo eliminar.'); return; }
      A.toast('Respuesta eliminada.'); A.cerrarDrawer(); A.contarSolicitudes(); recargar();
    } }));
    A.drawer({ titulo: A.nombreDe(x) || 'Sin nombre', meta: (f.titulo || 'Formulario') + ' · ' + A.fecha(x.created_at, true), cuerpo: cuerpo, pie: pie });
    if (x.estado === 'nuevo') {
      // Al abrirla deja de contar como nueva
      await sb.from('formulario_respuestas').update({ estado: 'en_proceso' }).eq('id', x.id);
      x.estado = 'en_proceso'; est.value = 'en_proceso'; A.contarSolicitudes();
    }
  }

  async function verArchivo(path) {
    var win = window.open('', '_blank');
    var r = await sb.storage.from(BUCKET).createSignedUrl(path, 120);
    if (r.error) { if (win) win.close(); A.toast('No se pudo abrir el archivo.', 'error'); return; }
    if (win) win.location = r.data.signedUrl; else location.href = r.data.signedUrl;
  }

  function sensible(x, campo) {
    if (!A.puede('sensibles')) return el('span', { class: 'muted', text: 'Requiere permiso' });
    var span = el('span', { text: '•••-••-••••' });
    var btn = el('button', { type: 'button', text: 'Mostrar' });
    btn.addEventListener('click', async function () {
      if (span.dataset.v) { span.textContent = '•••-••-••••'; delete span.dataset.v; btn.textContent = 'Mostrar'; return; }
      btn.disabled = true;
      var r = await sb.rpc('ver_respuesta_sensible', { p_id: x.id });
      btn.disabled = false;
      if (r.error) { A.toast('No se pudo mostrar el dato.', 'error'); return; }
      var v = (r.data || {})[campo];
      span.textContent = v ? String(v).replace(/^(\d{3})(\d{2})(\d{4})$/, '$1-$2-$3') : '—'; span.dataset.v = '1'; btn.textContent = 'Ocultar';
    });
    return el('span', { class: 'secret' }, [span, btn]);
  }

  async function aCliente(x, f, recargar) {
    var d = await A.buscarDuplicado(x.email, x.telefono);
    if (d && confirm('Ya existe un cliente parecido: ' + A.nombreDe(d) + '. ¿Ligar esta respuesta a su ficha en lugar de crear uno nuevo?')) {
      await ligar(x, f, d.id, null); A.toast('Respuesta ligada a ' + A.nombreDe(d) + '.'); recargar(); A.ir('clientes/' + d.id); return;
    }
    var servicios = Object.keys(A.SERVICIOS).filter(function (k) { return !A.SERVICIOS[k].oculto; });
    A.modal({
      titulo: 'Convertir en cliente', ok: 'Crear cliente',
      campos: [
        { k: 'nombre', label: 'Nombre', required: true, max: 120, value: x.nombre },
        { k: 'apellidos', label: 'Apellidos', max: 120, value: x.apellidos },
        { k: 'telefono', label: 'Teléfono', type: 'tel', max: 40, value: x.telefono },
        { k: 'email', label: 'Correo', type: 'email', max: 200, value: x.email },
        { k: 'servicio', label: 'Abrir un caso de', type: 'select', full: true, value: f.servicio || '', options: [['', 'No abrir caso']].concat(servicios.map(function (k) { return [k, A.SERVICIOS[k].label]; })) }
      ],
      extra: el('p', { class: 'muted', style: 'margin-top:10px;font-size:12.5px', text: 'Las respuestas quedan en las notas del cliente y los archivos pasan a sus documentos.' }),
      guardar: async function (v, aviso) {
        var n = await A.nuevoClienteBD({ nombre: v.nombre, apellidos: v.apellidos, telefono: v.telefono, email: v.email, origen: 'formulario', notas: resumen(x, f) }).select('id').single();
        if (n.error) { A.msg(aviso, 'No se pudo crear el cliente.'); return false; }
        var casoId = null;
        if (v.servicio && A.puede('casos')) {
          var k = await sb.from('casos').insert({ cliente_id: n.data.id, servicio: v.servicio, etapa: A.SERVICIOS[v.servicio].etapas[0], titulo: f.titulo, responsable: A.yo().user_id }).select('id').single();
          if (!k.error) casoId = k.data.id;
        }
        await ligar(x, f, n.data.id, casoId);
        A.toast('Cliente creado' + (casoId ? ' con su caso' : '') + '.'); recargar(); A.ir('clientes/' + n.data.id);
      }
    });
  }

  function resumen(x, f) {
    var l = ['Respuestas de «' + (f.titulo || 'Formulario') + '» (' + A.fecha(x.created_at) + '):'];
    (f.campos || []).forEach(function (c) {
      if (c.tipo === 'seccion' || c.tipo === 'archivo' || c.tipo === 'firma' || c.tipo === 'sensible' || c.mapa) return;
      var v = texto(x.datos[c.id]); if (v) l.push('• ' + c.etiqueta + ': ' + v);
    });
    return l.join('\n').slice(0, 4000);
  }

  // Liga la respuesta al cliente y copia sus archivos a la carpeta del cliente (Documentos de su ficha)
  async function ligar(x, f, clienteId, casoId) {
    var fallos = 0;
    for (var i = 0; i < (x.archivos || []).length; i++) {
      var a = x.archivos[i];
      var c = (f.campos || []).filter(function (y) { return y.id === a.campo; })[0];
      var limpio = String(a.nombre || 'archivo').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '-').slice(-80);
      var destino = 'clientes/' + clienteId + '/formularios/' + Date.now() + '-' + i + '-' + limpio;
      var cp = await sb.storage.from(BUCKET).copy(a.path, destino);
      if (cp.error) { fallos++; continue; }
      var nombre = (c && c.tipo === 'firma' ? 'Firma · ' : '') + (c ? c.etiqueta.slice(0, 70) + ' · ' : '') + a.nombre;
      var ins = await sb.from('documentos').insert({ cliente_id: clienteId, caso_id: casoId, nombre: nombre.slice(0, 200), path: destino, tipo: a.tipo, tamano: a.tam, subido_por: A.yo().user_id });
      if (ins.error) { fallos++; await sb.storage.from(BUCKET).remove([destino]); }
    }
    await sb.from('formulario_respuestas').update({ cliente_id: clienteId, caso_id: casoId, estado: 'en_proceso' }).eq('id', x.id);
    if (fallos) A.toast(fallos === 1 ? 'Un archivo no se pudo pasar a la ficha. Ábrelo desde la respuesta.' : fallos + ' archivos no se pudieron pasar a la ficha. Ábrelos desde la respuesta.', 'error');
    A.contarSolicitudes();
  }
})();
