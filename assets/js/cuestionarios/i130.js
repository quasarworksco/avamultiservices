/* AVA Multiservices — Preguntas del cuestionario I-130 (petición familiar por matrimonio, I-130 + I-130A).
   La usan la página del cliente (/cuestionario/) y el panel del CRM para mostrar las respuestas.
   Campo: { k, t, tipo, req, ayuda, op, si: { k, v | ne | mayor }, full, ph }
   tipo: texto, parrafo, fecha, mes, numero, tel, email, lista, opciones, multiple, si_no, sensible, direccion, grupo, nota */
(function () {
  'use strict';
  var PAISES = 'Escribe el país';

  function nombre(p, extra) {
    return [
      { k: p + 'apellidos', t: 'Apellidos', tipo: 'texto', req: true },
      { k: p + 'nombre', t: 'Nombre', tipo: 'texto', req: true },
      { k: p + 'segundo', t: 'Segundo nombre', tipo: 'texto', ayuda: 'Si no tiene, déjalo en blanco.' },
      { k: p + 'otros_nombres', t: 'Otros nombres que haya usado', tipo: 'texto', full: true, ayuda: 'Apellido de soltera, otro apellido, nombres anteriores. Si no hay, déjalo en blanco.' }
    ].concat(extra || []);
  }
  function nacimiento(p, sexoFijo) {
    return [
      { k: p + 'nac_fecha', t: 'Fecha de nacimiento', tipo: 'fecha', req: true },
      sexoFijo ? null : { k: p + 'sexo', t: 'Sexo', tipo: 'opciones', op: ['Masculino', 'Femenino'] },
      { k: p + 'nac_ciudad', t: 'Ciudad de nacimiento', tipo: 'texto' },
      { k: p + 'nac_pais', t: 'País de nacimiento', tipo: 'texto', ph: PAISES }
    ].filter(Boolean);
  }
  function numeros(p) {
    return [
      { k: p + 'ssn', t: 'Número de Seguro Social', tipo: 'sensible', mascara: 'ssn', ayuda: 'Si no tiene, déjalo en blanco.' },
      { k: p + 'a', t: 'Número A (si tiene)', tipo: 'sensible', mascara: 'a', ayuda: 'Empieza con A y tiene 8 o 9 números. Sale en tarjetas y cartas de inmigración.' },
      { k: p + 'uscis', t: 'Número de cuenta en línea de USCIS (si tiene)', tipo: 'sensible', mascara: 'uscis', ayuda: '12 números. Solo si alguna vez creó una cuenta en my.uscis.gov.' }
    ];
  }
  function contacto(p) {
    return [
      { k: p + 'tel', t: 'Teléfono de casa', tipo: 'tel' },
      { k: p + 'cel', t: 'Celular', tipo: 'tel', req: true },
      { k: p + 'email', t: 'Correo electrónico', tipo: 'email', full: true }
    ];
  }
  function direcciones(p, quien) {
    return { k: p + 'direcciones', t: 'Direcciones de los últimos 5 años', tipo: 'grupo', item: 'Dirección', agregar: 'Agregar otra dirección', min: 1, max: 15,
      ayuda: 'Empieza por donde ' + quien + ' vive ahora y sigue hacia atrás hasta completar 5 años, incluidas las de otros países.',
      campos: [{ k: 'dir', t: 'Dirección', tipo: 'direccion' }, { k: 'desde', t: 'Desde', tipo: 'mes' }, { k: 'hasta', t: 'Hasta', tipo: 'mes', ayuda: 'Si es la actual, déjalo en blanco.' }] };
  }
  function empleos(p, quien) {
    return { k: p + 'empleos', t: 'Empleos de los últimos 5 años', tipo: 'grupo', item: 'Empleo', agregar: 'Agregar otro empleo', min: 1, max: 15,
      ayuda: 'Empieza por el actual. Incluye trabajos por cuenta propia. Si ' + quien + ' no trabajó en algún tiempo, escribe «Desempleado(a)» o «Ama de casa» como empleador.',
      campos: [{ k: 'empleador', t: 'Empleador o negocio', tipo: 'texto' }, { k: 'puesto', t: 'Puesto u ocupación', tipo: 'texto' }, { k: 'dir', t: 'Dirección del trabajo', tipo: 'direccion' },
        { k: 'desde', t: 'Desde', tipo: 'mes' }, { k: 'hasta', t: 'Hasta', tipo: 'mes', ayuda: 'Si es el actual, déjalo en blanco.' }] };
  }
  function padre(p, quien, sexo) {
    var x = p + (sexo === 'Masculino' ? 'padre_' : 'madre_');
    return [
      { k: x + 'nombre', t: 'Nombre completo de ' + quien, tipo: 'texto', full: true, ayuda: sexo === 'Femenino' ? 'Con su apellido de soltera.' : null },
      { k: x + 'nac_fecha', t: 'Fecha de nacimiento', tipo: 'fecha' },
      { k: x + 'nac_ciudad', t: 'Ciudad de nacimiento', tipo: 'texto' },
      { k: x + 'nac_pais', t: 'País de nacimiento', tipo: 'texto', ph: PAISES },
      { k: x + 'vive', t: '¿Está con vida?', tipo: 'opciones', op: ['Sí', 'Falleció'] },
      { k: x + 'vive_ciudad', t: 'Ciudad donde vive', tipo: 'texto', si: { k: x + 'vive', ne: 'Falleció' } },
      { k: x + 'vive_pais', t: 'País donde vive', tipo: 'texto', ph: PAISES, si: { k: x + 'vive', ne: 'Falleció' } }
    ];
  }
  function matrimonios(p, quien) {
    return [
      { k: p + 'veces_casado', t: '¿Cuántas veces ' + quien + ' ha estado casado(a)?', tipo: 'numero', req: true, ayuda: 'Cuenta también el matrimonio actual. Si es su primer matrimonio, escribe 1.' },
      { k: p + 'matrimonios', t: 'Matrimonios anteriores', tipo: 'grupo', item: 'Matrimonio anterior', agregar: 'Agregar otro matrimonio anterior', min: 1, max: 6, si: { k: p + 'veces_casado', mayor: 1 },
        campos: [{ k: 'nombre', t: 'Nombre completo del excónyuge', tipo: 'texto', full: true }, { k: 'fecha_boda', t: 'Fecha en que se casaron', tipo: 'fecha' },
          { k: 'fecha_fin', t: 'Fecha en que terminó', tipo: 'fecha' }, { k: 'como', t: '¿Cómo terminó?', tipo: 'opciones', op: ['Divorcio', 'Fallecimiento', 'Anulación'] }] }
    ];
  }

  var esposo = [].concat(
    [{ tipo: 'titulo', t: 'Nombre' }], nombre('p_'),
    [{ tipo: 'titulo', t: 'Nacimiento' }], nacimiento('p_'),
    [{ tipo: 'titulo', t: 'Ciudadanía y números' }],
    [{ k: 'p_ciudadania', t: '¿Cómo obtuvo la ciudadanía de EE. UU.?', tipo: 'opciones', req: true, full: true, op: ['Nació en EE. UU.', 'Se naturalizó', 'Por sus padres'] },
      { k: 'p_cert_num', t: 'Número del certificado', tipo: 'texto', si: { k: 'p_ciudadania', v: ['Se naturalizó', 'Por sus padres'] }, ayuda: 'Certificado de naturalización o de ciudadanía.' },
      { k: 'p_cert_lugar', t: 'Lugar donde lo recibió', tipo: 'texto', si: { k: 'p_ciudadania', v: ['Se naturalizó', 'Por sus padres'] }, ph: 'Ciudad y estado' },
      { k: 'p_cert_fecha', t: 'Fecha del certificado', tipo: 'fecha', si: { k: 'p_ciudadania', v: ['Se naturalizó', 'Por sus padres'] } }],
    numeros('p_'),
    [{ tipo: 'titulo', t: 'Contacto' }], contacto('p_'),
    [{ tipo: 'titulo', t: 'Dirección' },
      { k: 'p_dir_postal', t: 'Dirección postal (donde recibe cartas)', tipo: 'direccion', req: true },
      { k: 'p_dir_igual', t: '¿Vive en esa misma dirección?', tipo: 'si_no', full: true },
      { k: 'p_dir_fisica', t: 'Dirección donde vive', tipo: 'direccion', si: { k: 'p_dir_igual', v: 'No' } },
      direcciones('p_', 'el esposo'),
      { tipo: 'titulo', t: 'Trabajo' }, empleos('p_', 'el esposo'),
      { tipo: 'titulo', t: 'Padres del esposo' }],
    padre('p_', 'su padre', 'Masculino'), padre('p_', 'su madre', 'Femenino'),
    [{ tipo: 'titulo', t: 'Matrimonios' }], matrimonios('p_', 'el esposo'),
    [{ tipo: 'titulo', t: 'Rasgos físicos', ayuda: 'USCIS los pide para la biometría (huellas y foto).' },
      { k: 'p_etnia', t: 'Etnia', tipo: 'opciones', op: ['Hispano o latino', 'No hispano ni latino'], full: true },
      { k: 'p_raza', t: 'Raza (puede marcar varias)', tipo: 'multiple', op: ['Blanca', 'Negra o afroamericana', 'Asiática', 'Indígena americana o nativa de Alaska', 'Nativa de Hawái u otras islas del Pacífico'], full: true },
      { k: 'p_estatura_pies', t: 'Estatura: pies', tipo: 'numero', ph: '5' },
      { k: 'p_estatura_pulg', t: 'Estatura: pulgadas', tipo: 'numero', ph: '8' },
      { k: 'p_peso', t: 'Peso en libras', tipo: 'numero', ph: '170' },
      { k: 'p_ojos', t: 'Color de ojos', tipo: 'lista', op: ['Negro', 'Café', 'Azul', 'Verde', 'Gris', 'Avellana', 'Otro'] },
      { k: 'p_cabello', t: 'Color de cabello', tipo: 'lista', op: ['Negro', 'Castaño', 'Rubio', 'Rojo', 'Canoso (gris)', 'Blanco', 'Sin cabello', 'Otro'] },
      { tipo: 'titulo', t: 'Otras peticiones' },
      { k: 'p_pidio_antes', t: '¿Alguna vez ha pedido a otra persona con una I-130?', tipo: 'si_no', full: true },
      { k: 'p_peticiones', t: 'Peticiones anteriores', tipo: 'grupo', item: 'Petición', agregar: 'Agregar otra petición', min: 1, max: 6, si: { k: 'p_pidio_antes', v: 'Sí' },
        campos: [{ k: 'nombre', t: 'Nombre de la persona', tipo: 'texto', full: true }, { k: 'lugar', t: 'Ciudad y estado donde la presentó', tipo: 'texto' }, { k: 'fecha', t: 'Fecha', tipo: 'fecha' },
          { k: 'resultado', t: 'Resultado', tipo: 'opciones', op: ['Aprobada', 'Negada', 'Retirada', 'En trámite', 'No sé'] }] },
      { k: 'p_pide_otros', t: '¿Está pidiendo ahora a otros familiares?', tipo: 'si_no', full: true },
      { k: 'p_otros', t: 'Otros familiares que está pidiendo', tipo: 'grupo', item: 'Familiar', agregar: 'Agregar otro familiar', min: 1, max: 10, si: { k: 'p_pide_otros', v: 'Sí' },
        campos: [{ k: 'nombre', t: 'Nombre completo', tipo: 'texto' }, { k: 'parentesco', t: 'Parentesco', tipo: 'texto', ph: 'Hijo, madre…' }] }]
  );

  var esposa = [].concat(
    [{ tipo: 'titulo', t: 'Nombre' }], nombre('b_'),
    [{ tipo: 'titulo', t: 'Nacimiento' }], nacimiento('b_'),
    [{ tipo: 'titulo', t: 'Números (si tiene)' }], numeros('b_'),
    [{ tipo: 'titulo', t: 'Contacto' }], contacto('b_'),
    [{ tipo: 'titulo', t: 'Dirección' },
      { k: 'b_dir', t: 'Dirección actual', tipo: 'direccion', req: true },
      { k: 'b_otra_dir', t: '¿Va a vivir en otra dirección cuando le aprueben?', tipo: 'si_no', full: true },
      { k: 'b_dir_futura', t: 'Dirección donde va a vivir', tipo: 'direccion', si: { k: 'b_otra_dir', v: 'Sí' } },
      direcciones('b_', 'la esposa'),
      { k: 'b_ultima_fuera', t: 'Última dirección fuera de EE. UU. donde vivió más de un año', tipo: 'direccion', ayuda: 'Por ejemplo, la casa donde vivía en su país antes de venir.' },
      { k: 'b_ultima_fuera_desde', t: 'Desde', tipo: 'mes' },
      { k: 'b_ultima_fuera_hasta', t: 'Hasta', tipo: 'mes' },
      { tipo: 'titulo', t: 'Trabajo' }, empleos('b_', 'la esposa'),
      { k: 'b_ultimo_fuera', t: 'Último empleo fuera de EE. UU.', tipo: 'grupo', item: 'Empleo fuera de EE. UU.', agregar: '', min: 1, max: 1, ayuda: 'Si nunca trabajó fuera de EE. UU., déjalo en blanco.',
        campos: [{ k: 'empleador', t: 'Empleador o negocio', tipo: 'texto' }, { k: 'puesto', t: 'Puesto u ocupación', tipo: 'texto' }, { k: 'dir', t: 'Dirección del trabajo', tipo: 'direccion' },
          { k: 'desde', t: 'Desde', tipo: 'mes' }, { k: 'hasta', t: 'Hasta', tipo: 'mes' }] },
      { tipo: 'titulo', t: 'Padres de la esposa' }],
    padre('b_', 'su padre', 'Masculino'), padre('b_', 'su madre', 'Femenino'),
    [{ tipo: 'titulo', t: 'Matrimonios' }], matrimonios('b_', 'la esposa'),
    [{ tipo: 'titulo', t: 'Hijos de la esposa' },
      { k: 'b_tiene_hijos', t: '¿Tiene hijos? (de esta u otra relación)', tipo: 'si_no', full: true },
      { k: 'b_hijos', t: 'Hijos', tipo: 'grupo', item: 'Hijo o hija', agregar: 'Agregar otro hijo', min: 1, max: 12, si: { k: 'b_tiene_hijos', v: 'Sí' },
        campos: [{ k: 'nombre', t: 'Nombre completo', tipo: 'texto', full: true }, { k: 'nac_fecha', t: 'Fecha de nacimiento', tipo: 'fecha' }, { k: 'nac_pais', t: 'País de nacimiento', tipo: 'texto' },
          { k: 'vive', t: '¿Dónde vive?', tipo: 'texto', ph: 'Ciudad y país' }] },
      { tipo: 'titulo', t: 'Otras peticiones' },
      { k: 'b_otra_peticion', t: '¿Alguien más ha presentado alguna vez una petición por ella?', tipo: 'opciones', op: ['Sí', 'No', 'No sé'], full: true },
      { k: 'b_otra_peticion_det', t: '¿Quién la pidió, cuándo y qué pasó?', tipo: 'parrafo', si: { k: 'b_otra_peticion', v: 'Sí' } }]
  );

  var matrimonio = [
    { tipo: 'titulo', t: 'La boda' },
    { k: 'm_casados', t: '¿Ya se casaron?', tipo: 'si_no', req: true, full: true },
    { k: 'm_fecha', t: 'Fecha del matrimonio', tipo: 'fecha', si: { k: 'm_casados', v: 'Sí' } },
    { k: 'm_lugar', t: 'Lugar del matrimonio', tipo: 'texto', ph: 'Ciudad, estado y país', si: { k: 'm_casados', v: 'Sí' } },
    { k: 'm_fecha_planeada', t: 'Fecha planeada de la boda', tipo: 'fecha', si: { k: 'm_casados', v: 'No' } },
    { tipo: 'titulo', t: 'Dónde viven' },
    { k: 'm_juntos', t: '¿Viven juntos?', tipo: 'si_no', full: true },
    { k: 'm_dir_juntos', t: 'Última dirección donde vivieron juntos', tipo: 'direccion', ayuda: 'Si viven juntos ahora, es la dirección actual.' },
    { k: 'm_juntos_desde', t: 'Viven (o vivieron) juntos desde', tipo: 'mes' },
    { k: 'm_juntos_hasta', t: 'Hasta', tipo: 'mes', si: { k: 'm_juntos', v: 'No' } },
    { k: 'm_casa', t: '¿Quiénes viven en la casa?', tipo: 'grupo', item: 'Persona', agregar: 'Agregar otra persona', min: 1, max: 12, ayuda: 'Sin contarlos a ustedes dos.',
      campos: [{ k: 'nombre', t: 'Nombre', tipo: 'texto' }, { k: 'parentesco', t: 'Parentesco', tipo: 'texto', ph: 'Hijo, suegra, amigo…' }] },
    { tipo: 'titulo', t: 'Su historia' },
    { k: 'm_conocieron', t: '¿Cómo, cuándo y dónde se conocieron?', tipo: 'parrafo', full: true, ayuda: 'Cuéntalo con tus palabras, con fechas aproximadas.' },
    { k: 'm_relacion', t: '¿Cuándo empezaron la relación?', tipo: 'mes' },
    { k: 'm_compromiso', t: '¿Cuándo se comprometieron?', tipo: 'mes' },
    { k: 'm_hijos_comun', t: '¿Tienen hijos en común?', tipo: 'si_no', full: true },
    { k: 'm_hijos', t: 'Hijos en común', tipo: 'grupo', item: 'Hijo o hija', agregar: 'Agregar otro hijo', min: 1, max: 10, si: { k: 'm_hijos_comun', v: 'Sí' },
      campos: [{ k: 'nombre', t: 'Nombre completo', tipo: 'texto', full: true }, { k: 'nac_fecha', t: 'Fecha de nacimiento', tipo: 'fecha' }, { k: 'nac_lugar', t: 'Lugar de nacimiento', tipo: 'texto' }] }
  ];

  var entrada = [
    { tipo: 'nota', t: 'Si ya nos diste el pasaporte y el I-94, puedes dejar en blanco lo que no sepas: nosotros lo llenamos.' },
    { tipo: 'titulo', t: 'Entrada a EE. UU.' },
    { k: 'e_en_eeuu', t: '¿La esposa está en EE. UU.?', tipo: 'si_no', req: true, full: true },
    { k: 'e_como', t: '¿Cómo entró la última vez?', tipo: 'opciones', full: true, op: ['Cita CBP One', 'Con visa', 'Parole', 'Sin pasar por inspección', 'Otra'], si: { k: 'e_en_eeuu', v: 'Sí' } },
    { k: 'e_como_otra', t: 'Explica cómo entró', tipo: 'texto', full: true, si: { k: 'e_como', v: ['Otra', 'Con visa'] }, ayuda: 'Si fue con visa, escribe el tipo (turista B2, estudiante F1…).' },
    { k: 'e_llegada', t: 'Fecha de llegada', tipo: 'fecha', si: { k: 'e_en_eeuu', v: 'Sí' } },
    { k: 'e_lugar', t: 'Lugar por donde entró', tipo: 'texto', ph: 'Ciudad o puerto de entrada', si: { k: 'e_en_eeuu', v: 'Sí' } },
    { k: 'e_i94', t: 'Número del I-94', tipo: 'sensible', mascara: 'i94', si: { k: 'e_en_eeuu', v: 'Sí' }, ayuda: '11 caracteres. Sale en i94.cbp.dhs.gov.' },
    { k: 'e_i94_vence', t: 'Fecha en que vence la estadía', tipo: 'fecha', si: { k: 'e_en_eeuu', v: 'Sí' }, ayuda: 'Sale en el I-94. Si dice «D/S», déjalo en blanco.' },
    { tipo: 'titulo', t: 'Pasaporte' },
    { k: 'e_pasaporte', t: 'Número de pasaporte', tipo: 'sensible', mascara: 'pasaporte' },
    { k: 'e_pasaporte_pais', t: 'País que lo emitió', tipo: 'texto' },
    { k: 'e_pasaporte_vence', t: 'Fecha de vencimiento', tipo: 'fecha' },
    { tipo: 'titulo', t: 'Corte y otros trámites' },
    { k: 'e_corte', t: '¿Ha estado alguna vez en corte de inmigración?', tipo: 'si_no', full: true },
    { k: 'e_corte_tipo', t: 'Tipo de proceso', tipo: 'opciones', full: true, op: ['Remoción (deportación)', 'Exclusión', 'Rescisión', 'Otro / no sé'], si: { k: 'e_corte', v: 'Sí' } },
    { k: 'e_corte_ciudad', t: 'Ciudad de la corte', tipo: 'texto', si: { k: 'e_corte', v: 'Sí' } },
    { k: 'e_corte_estado', t: 'Estado de la corte', tipo: 'texto', si: { k: 'e_corte', v: 'Sí' } },
    { k: 'e_corte_inicio', t: 'Fecha en que empezó el proceso', tipo: 'fecha', si: { k: 'e_corte', v: 'Sí' } },
    { k: 'e_audiencia', t: 'Fecha de la próxima audiencia', tipo: 'fecha', si: { k: 'e_corte', v: 'Sí' } },
    { k: 'e_abogado', t: 'Abogado de la corte (nombre y teléfono)', tipo: 'texto', full: true, si: { k: 'e_corte', v: 'Sí' }, ayuda: 'Si no tiene abogado, déjalo en blanco.' },
    { k: 'e_asilo', t: '¿Pidió asilo?', tipo: 'si_no', full: true },
    { k: 'e_asilo_det', t: '¿Cuándo y dónde lo pidió? ¿Cómo va?', tipo: 'parrafo', si: { k: 'e_asilo', v: 'Sí' } },
    { k: 'e_tramites', t: '¿Tiene otros trámites con USCIS?', tipo: 'multiple', full: true, op: ['Permiso de trabajo', 'TPS', 'Parole', 'DACA', 'Otro'] },
    { k: 'e_tramites_det', t: 'Detalles de los trámites', tipo: 'parrafo', ayuda: 'Números de recibo, fechas, en qué van.', si: { k: 'e_tramites', lleno: true } }
  ];

  // Documentos: el cliente elige «Subir ahora» o «Lo envío después»
  var documentos = [
    { grupo: 'Del esposo', corto: 'Esposo', docs: [
      { k: 'd_p_ciudadania', t: 'Prueba de ciudadanía', ayuda: 'Pasaporte de EE. UU., acta de nacimiento de EE. UU. o certificado de naturalización.' },
      { k: 'd_p_id', t: 'Licencia o ID' },
      { k: 'd_p_foto', t: 'Foto tipo pasaporte', ayuda: 'Fondo blanco, de frente, reciente.' },
      { k: 'd_p_divorcios', t: 'Divorcios de matrimonios anteriores', si: { k: 'p_veces_casado', mayor: 1 } }] },
    { grupo: 'De la esposa', corto: 'Esposa', docs: [
      { k: 'd_b_pasaporte', t: 'Pasaporte', ayuda: 'La página de la foto y las de los sellos de entrada.' },
      { k: 'd_b_i94', t: 'I-94', si: { k: 'e_en_eeuu', v: 'Sí' } },
      { k: 'd_b_foto', t: 'Foto tipo pasaporte', ayuda: 'Fondo blanco, de frente, reciente.' },
      { k: 'd_b_corte', t: 'Cartas de corte (NTA) y de USCIS o ICE', ayuda: 'Si no tiene ninguna, marca «Lo envío después» o déjalo.', si: { o: [{ k: 'e_corte', v: 'Sí' }, { k: 'e_asilo', v: 'Sí' }, { k: 'e_tramites', lleno: true }] } },
      { k: 'd_b_divorcios', t: 'Divorcios de matrimonios anteriores', si: { k: 'b_veces_casado', mayor: 1 } }] },
    { grupo: 'Del matrimonio (pruebas de que es real)', corto: 'Matrimonio', docs: [
      { k: 'd_m_certificado', t: 'Certificado de matrimonio', si: { k: 'm_casados', v: 'Sí' } },
      { k: 'd_m_renta', t: 'Contrato de renta o escritura a nombre de los dos' },
      { k: 'd_m_banco', t: 'Cuenta bancaria conjunta', ayuda: 'Estados de cuenta donde salgan los dos nombres.' },
      { k: 'd_m_seguros', t: 'Seguros donde aparezcan los dos', ayuda: 'Salud, carro, vida…' },
      { k: 'd_m_facturas', t: 'Facturas a nombre de los dos o en la misma dirección', ayuda: 'Luz, agua, internet, teléfono.' },
      { k: 'd_m_fotos', t: 'Fotos juntos desde que se conocieron', ayuda: 'De distintas fechas, con familia y amigos.' },
      { k: 'd_m_mensajes', t: 'Mensajes o registros de llamadas' },
      { k: 'd_m_hijos', t: 'Actas de nacimiento de hijos en común', si: { k: 'm_hijos_comun', v: 'Sí' } },
      { k: 'd_m_cartas', t: 'Cartas de familiares o amigos que conocen la relación' },
      { k: 'd_m_otras', t: 'Otras pruebas' }] }
  ];

  var ACEPTO = [
    'Declaramos que toda la información que dimos es verdadera y completa.',
    'Autorizamos a AVA Multiservices a usar esta información y documentos para preparar nuestros formularios.',
    'Entendemos que AVA Multiservices es una empresa de preparación de documentos y no un despacho de abogados: no da asesoría legal.'
  ];

  window.AVA_CUESTIONARIOS = window.AVA_CUESTIONARIOS || {};
  window.AVA_CUESTIONARIOS.i130 = {
    titulo: 'Petición familiar por matrimonio',
    subtitulo: 'Formularios I-130 e I-130A',
    pasos: [
      { k: 'esposo', t: 'Esposo', st: 'Datos del esposo, el ciudadano que pide.', campos: esposo },
      { k: 'esposa', t: 'Esposa', st: 'Datos de la esposa, la persona a quien se pide.', campos: esposa },
      { k: 'matrimonio', t: 'Matrimonio', st: 'Sobre la boda y la relación.', campos: matrimonio },
      { k: 'entrada', t: 'Inmigración', st: 'Entrada a EE. UU. y casos de inmigración de la esposa.', campos: entrada },
      { k: 'documentos', t: 'Documentos', st: 'Sube cada documento ahora o márcalo para enviarlo después.', documentos: documentos },
      { k: 'revisar', t: 'Revisar y enviar', st: 'Revisa tus respuestas, acepta y firma con tu nombre.', revisar: true }
    ],
    acepto: ACEPTO,
    nombre: function (d) {
      var a = [d.p_nombre, d.p_apellidos].filter(Boolean).join(' '), b = [d.b_nombre, d.b_apellidos].filter(Boolean).join(' ');
      return [a, b].filter(Boolean).join(' y ');
    }
  };

  /* ---------- Utilidades compartidas (página y panel) ---------- */
  function vacio(v) {
    if (v == null || v === '' || v === false) return true;
    if (Array.isArray(v)) return !v.length || v.every(vacio);
    if (typeof v === 'object') return Object.keys(v).every(function (k) { return vacio(v[k]); });
    return false;
  }
  // ¿Se cumple la condición «si» con estos datos?
  function cumple(si, d) {
    if (!si) return true;
    if (si.o) return si.o.some(function (x) { return cumple(x, d); });
    var v = d[si.k];
    if (si.lleno) return !vacio(v);
    if (si.mayor != null) return (parseInt(v, 10) || 0) > si.mayor;
    if (si.ne != null) return v !== si.ne;
    return Array.isArray(si.v) ? si.v.indexOf(v) !== -1 : v === si.v;
  }
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function fecha(v) {
    var m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(v || '');
    if (!m) return v;
    return (m[3] ? +m[3] + ' ' : '') + MESES[+m[2] - 1] + ' ' + m[1];
  }
  function direccion(v) {
    if (!v || typeof v !== 'object') return v || '';
    return [[v.calle, v.apto].filter(Boolean).join(', '), v.ciudad, [v.estado, v.zip].filter(Boolean).join(' '), v.pais].filter(Boolean).join(', ');
  }
  function valorTexto(c, v) {
    if (vacio(v)) return '';
    if (c.tipo === 'fecha' || c.tipo === 'mes') return fecha(v);
    if (c.tipo === 'direccion') return direccion(v);
    if (Array.isArray(v)) return v.join(', ');
    return String(v);
  }
  window.AVA_CUESTIONARIOS.util = { vacio: vacio, cumple: cumple, fecha: fecha, direccion: direccion, valorTexto: valorTexto };
})();
