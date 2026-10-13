/* Panel CRM — Sitio web conectado: precios, anuncio, testimonios y preguntas frecuentes de avamultiservices.com */
(function () {
  'use strict';
  var A = window.AVA, el = A.el, sb = A.sb;
  var ui = {};
  var items = [];

  A.vista('sitio', {
    permiso: 'sitio',
    render: function (cont) {
      ui.cont = el('div');
      cont.appendChild(A.cabecera('avamultiservices.com', 'Tu sitio', 'web', [
        el('a', { class: 'btn btn-ghost btn-sm', href: '../', target: '_blank', rel: 'noopener' }, [A.icon('i-external'), el('span', { text: 'Ver sitio' })])
      ]));
      cont.appendChild(el('p', { class: 'muted', style: 'margin-top:10px;max-width:680px', text: 'Lo que cambies aquí se publica en tu sitio al instante, sin depender de nadie.' }));
      cont.appendChild(ui.cont);
      cargar();
    }
  });

  async function cargar() {
    var r = await sb.from('sitio_items').select('*').order('orden').order('updated_at');
    items = r.data || [];
    pintar();
  }

  function guardarItem(it, cambios, texto) {
    return sb.from('sitio_items').update(cambios).eq('id', it.id).then(function (r) {
      if (r.error) { A.toast('No se pudo guardar.', 'error'); return false; }
      Object.assign(it, cambios);
      A.toast(texto || 'Publicado en el sitio.');
      return true;
    });
  }

  function interruptor(on, cambio) {
    var inp = el('input', { type: 'checkbox' });
    inp.checked = on;
    inp.addEventListener('change', function () { cambio(inp); });
    return el('span', { class: 'switch' }, [inp, el('span')]);
  }

  function pintar() {
    ui.cont.innerHTML = '';
    var grid = el('div', { class: 'cols', style: 'grid-template-columns:minmax(0,1.2fr) minmax(0,1fr)' });
    var izq = el('div'), der = el('div');

    // Anuncio
    var an = items.filter(function (i) { return i.tipo === 'anuncio'; })[0];
    if (an) {
      var txt = el('input', { class: 'input sm', value: an.texto || '', maxlength: 200, placeholder: '¡Temporada de taxes abierta! Agenda tu cita.', 'aria-label': 'Texto del anuncio' });
      izq.appendChild(el('div', { class: 'card' }, [
        el('div', { class: 'card-h' }, [el('h3', { class: 't', text: 'Anuncio en el sitio' }), interruptor(an.visible, function (inp) {
          guardarItem(an, { visible: inp.checked }, inp.checked ? 'Anuncio visible en el sitio.' : 'Anuncio oculto.');
        })]),
        el('p', { class: 'muted', style: 'margin-bottom:10px', text: 'Aparece como un aviso flotante en tu página, con un botón para agendar.' }),
        el('div', { class: 'inline-form' }, [txt, el('button', { class: 'btn btn-dark btn-sm', type: 'button', text: 'Guardar', onclick: function () {
          if (!txt.value.trim()) { txt.focus(); return; }
          guardarItem(an, { texto: txt.value.trim() });
        } })])
      ]));
    }

    // Servicios y precios
    var serv = el('div', { class: 'card' }, [el('h3', { class: 't', text: 'Servicios y precios' }),
      el('p', { class: 'muted', style: 'margin-bottom:12px', text: 'Escribe el precio «desde» que quieres mostrar (o déjalo vacío) y oculta un servicio si no lo estás ofreciendo.' })]);
    items.filter(function (i) { return i.tipo === 'servicio'; }).forEach(function (s) {
      var precio = el('input', { class: 'input sm', value: s.precio || '', maxlength: 60, placeholder: 'Ej.: $99', 'aria-label': 'Precio de ' + s.titulo });
      precio.addEventListener('change', function () { guardarItem(s, { precio: precio.value.trim() || null }, 'Precio de ' + s.titulo + ' actualizado.'); });
      serv.appendChild(el('div', { class: 'svc-row', 'data-svc': s.clave }, [
        el('span', { class: 'chip-s', 'data-svc': s.clave }, [el('i'), s.titulo]),
        el('label', { class: 'svc-p' }, [el('span', { class: 'muted', text: 'Desde' }), precio]),
        interruptor(s.visible, function (inp) { guardarItem(s, { visible: inp.checked }, s.titulo + (inp.checked ? ' visible.' : ' oculto del sitio.')); })
      ]));
    });
    izq.appendChild(serv);

    // Testimonios y preguntas
    der.appendChild(lista('testimonio', 'Testimonios', 'Lo que dicen tus clientes. Se muestran en una sección propia del sitio.', 'Nuevo testimonio'));
    der.appendChild(lista('faq', 'Preguntas frecuentes', 'Se agregan a las preguntas que ya están en tu sitio.', 'Nueva pregunta'));

    grid.appendChild(izq); grid.appendChild(der);
    ui.cont.appendChild(grid);
  }

  function lista(tipo, titulo, ayuda, nuevo) {
    var card = el('div', { class: 'card' }, [
      el('div', { class: 'card-h' }, [el('h3', { class: 't', text: titulo }), el('button', { class: 'mini-btn', type: 'button', text: nuevo, onclick: function () { editar(tipo, null); } })]),
      el('p', { class: 'muted', style: 'margin-bottom:10px', text: ayuda })
    ]);
    var propios = items.filter(function (i) { return i.tipo === tipo; });
    if (!propios.length) card.appendChild(el('div', { class: 'lane-empty', text: 'Aún no hay ' + titulo.toLowerCase() + '.' }));
    propios.forEach(function (i) {
      card.appendChild(el('div', { class: 'site-item' + (i.visible ? '' : ' off') }, [
        el('button', { type: 'button', class: 'site-item-b', onclick: function () { editar(tipo, i); } }, [
          el('b', { text: tipo === 'faq' ? i.titulo : '«' + (i.texto || '') + '»' }),
          el('span', { class: 'muted', text: tipo === 'faq' ? (i.texto || '') : (i.autor || 'Cliente') })
        ]),
        interruptor(i.visible, function (inp) { guardarItem(i, { visible: inp.checked }, inp.checked ? 'Visible en el sitio.' : 'Oculto del sitio.').then(pintar); })
      ]));
    });
    return card;
  }

  function editar(tipo, it) {
    var nuevo = !it;
    it = it || {};
    var campos = tipo === 'faq'
      ? [{ k: 'titulo', label: 'Pregunta', required: true, full: true, value: it.titulo, max: 200 }, { k: 'texto', label: 'Respuesta', type: 'textarea', required: true, full: true, value: it.texto, max: 2000 }]
      : [{ k: 'texto', label: 'Testimonio', type: 'textarea', required: true, full: true, value: it.texto, max: 600 }, { k: 'autor', label: 'Nombre del cliente', value: it.autor, max: 120, placeholder: 'María G.' }, { k: 'titulo', label: 'Servicio', value: it.titulo, max: 200, placeholder: 'Reparación de crédito' }];
    A.modal({
      titulo: (nuevo ? 'Nuevo ' : 'Editar ') + (tipo === 'faq' ? 'pregunta' : 'testimonio'), ok: nuevo ? 'Publicar' : 'Guardar', campos: campos,
      guardar: async function (d, aviso) {
        var q = nuevo ? sb.from('sitio_items').insert(Object.assign({ tipo: tipo, orden: items.length + 10 }, d)) : sb.from('sitio_items').update(d).eq('id', it.id);
        var r = await q;
        if (r.error) { A.msg(aviso, 'No se pudo guardar.'); return false; }
        A.toast(nuevo ? 'Publicado en el sitio.' : 'Cambios publicados.'); cargar();
      },
      borrar: nuevo ? null : async function () {
        var r = await sb.from('sitio_items').delete().eq('id', it.id);
        if (r.error) { A.toast('No se pudo eliminar.', 'error'); return false; }
        A.toast('Eliminado del sitio.'); cargar();
      }
    });
  }
})();
