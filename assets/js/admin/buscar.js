/* Panel CRM — Búsqueda rápida (Ctrl/⌘ + K): clientes, casos, solicitudes y recibos.
   Cada usuario solo ve lo que sus permisos le dejan ver (lo controla la base de datos). */
(function () {
  'use strict';
  var A = window.AVA, el = A.el, sb = A.sb;
  var abierta = null;

  function limpiar(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function patron(t) { return '%' + t.replace(/[%_,()]/g, ' ').trim() + '%'; }

  A.buscar = function () {
    if (abierta) { abierta.querySelector('input').focus(); return; }
    var input = el('input', { type: 'search', placeholder: 'Buscar cliente, teléfono, correo, caso o recibo #…', 'aria-label': 'Buscar', autocomplete: 'off' });
    var res = el('div', { class: 'qs-res', role: 'listbox' }, [el('div', { class: 'qs-vacio', text: 'Escribe al menos 2 letras o números.' })]);
    var bg = el('div', { class: 'qs', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Búsqueda rápida' }, [el('div', { class: 'qs-card' }, [
      el('div', { class: 'qs-in' }, [A.icon('i-lupa'), input, el('button', { class: 'x', type: 'button', 'aria-label': 'Cerrar', onclick: cerrar }, [A.icon('i-x', 'icon-sm')])]), res
    ])]);
    document.body.appendChild(bg);
    abierta = bg;
    input.focus();
    var items = [], sel = 0, timer = null, ultima = 0;

    function cerrar() { bg.remove(); abierta = null; document.removeEventListener('keydown', teclas, true); }
    function ir(it) { cerrar(); it.ir(); }
    function marcar() { items.forEach(function (it, i) { it.nodo.classList.toggle('on', i === sel); }); if (items[sel]) items[sel].nodo.scrollIntoView({ block: 'nearest' }); }
    function teclas(e) {
      if (e.key === 'Escape') { e.preventDefault(); cerrar(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); marcar(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); marcar(); }
      else if (e.key === 'Enter' && items[sel]) { e.preventDefault(); ir(items[sel]); }
    }
    document.addEventListener('keydown', teclas, true);
    bg.addEventListener('mousedown', function (e) { if (e.target === bg) cerrar(); });
    input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(buscar, 220); });

    async function buscar() {
      var q = input.value.trim(), n = ++ultima;
      if (q.length < 2) { res.innerHTML = ''; res.appendChild(el('div', { class: 'qs-vacio', text: 'Escribe al menos 2 letras o números.' })); items = []; return; }
      var palabras = limpiar(q).split(/\s+/).filter(Boolean);
      var dig = q.replace(/\D/g, '');
      var esRecibo = /^#?\d{3,7}$/.test(q);
      var p1 = patron(q.split(/\s+/)[0]);
      var consultas = [];
      // Clientes: por nombre, apellido, correo o teléfono
      var clientes = [];
      if (A.puede('clientes|taxes|casos|cobros')) {
        var f = ['nombre.ilike.' + p1, 'apellidos.ilike.' + p1, 'email.ilike.' + p1];
        if (dig.length >= 3) f.push('tel_digitos.like.*' + dig + '*');
        var rc = await sb.from('clientes').select('id,nombre,apellidos,telefono,email').or(f.join(',')).limit(30);
        if (n !== ultima) return;
        clientes = (rc.data || []).filter(function (c) {
          var t = limpiar([c.nombre, c.apellidos, c.email, c.telefono].join(' '));
          return (dig.length >= 3 && (c.telefono || '').replace(/\D/g, '').indexOf(dig) >= 0) || palabras.every(function (w) { return t.indexOf(w) >= 0; });
        });
      }
      consultas.push(Promise.resolve(clientes.slice(0, 6).map(function (c) {
        return { g: 'Clientes', t: A.nombreDe(c), s: [c.telefono, c.email].filter(Boolean).join(' · '), av: A.iniciales(A.nombreDe(c)), ir: function () { A.ir('clientes/' + c.id); } };
      })));
      // Casos: por título o de los clientes encontrados
      if (A.puede('casos|taxes')) {
        var ids = clientes.slice(0, 20).map(function (c) { return c.id; });
        consultas.push(sb.from('casos').select('id,servicio,titulo,etapa,estado,cliente_id, clientes(id,nombre,apellidos)').or('titulo.ilike.' + p1 + (ids.length ? ',cliente_id.in.(' + ids.join(',') + ')' : '')).neq('estado', 'cancelado').order('updated_at', { ascending: false }).limit(30).then(function (r) {
          return (r.data || []).filter(function (k) {
            if (ids.indexOf(k.cliente_id) >= 0 || (k.clientes && ids.indexOf(k.clientes.id) >= 0)) return true;
            var t = limpiar([k.titulo, k.clientes && k.clientes.nombre, k.clientes && k.clientes.apellidos].join(' '));
            return palabras.every(function (w) { return t.indexOf(w) >= 0; });
          }).slice(0, 6).map(function (k) {
            return { g: 'Casos', t: (k.titulo || A.SERVICIOS[k.servicio].label) + ' · ' + A.nombreDe(k.clientes || {}), s: A.SERVICIOS[k.servicio].corto + ' · ' + k.etapa + (k.estado === 'completado' ? ' · completado' : ''), av: A.SERVICIOS[k.servicio].corto.slice(0, 2), ir: function () { A.verCaso(k.id); } };
          });
        }));
      }
      // Solicitudes y mensajes de contacto
      if (A.puede('solicitudes')) {
        var fs = ['nombre.ilike.' + p1, 'apellidos.ilike.' + p1, 'email.ilike.' + p1];
        if (dig.length >= 3) fs.push('telefono.ilike.%' + dig.slice(-4) + '%');
        var fm = ['nombre.ilike.' + p1, 'email.ilike.' + p1];
        if (dig.length >= 3) fm.push('telefono.ilike.%' + dig.slice(-4) + '%');
        consultas.push(Promise.all([
          sb.from('solicitudes').select('id,nombre,apellidos,telefono,estado').or(fs.join(',')).limit(10),
          sb.from('mensajes_web').select('id,nombre,telefono,estado,origen').or(fm.join(',')).limit(10)
        ]).then(function (r) {
          var a = (r[0].data || []).map(function (x) { return { g: 'Solicitudes', t: A.nombreDe(x), s: 'Formulario de inicio · ' + (x.telefono || ''), av: A.iniciales(A.nombreDe(x)), ir: function () { A.ir('solicitudes'); } }; });
          var b = (r[1].data || []).map(function (x) { return { g: 'Solicitudes', t: x.nombre, s: (x.origen === 'meta_ads' ? 'Lead de Meta Ads' : 'Mensaje de contacto') + ' · ' + (x.telefono || ''), av: A.iniciales(x.nombre), ir: function () { A.ir('mensajes'); } }; });
          return a.concat(b).slice(0, 5);
        }));
      } else consultas.push(Promise.resolve([]));
      // Recibos por número
      if (esRecibo && A.puede('cobros')) {
        consultas.push(sb.from('pagos').select('id,numero,monto,fecha,token, clientes(id,nombre,apellidos,telefono)').eq('numero', Number(q.replace('#', ''))).limit(1).then(function (r) {
          return (r.data || []).map(function (p) { return { g: 'Recibos', t: 'Recibo #' + p.numero + ' · ' + A.dinero(p.monto), s: A.nombreDe(p.clientes || {}) + ' · ' + A.fecha(p.fecha), av: '#', ir: function () { window.open(A.urlRecibo(p), '_blank', 'noopener'); } }; });
        }));
      }
      var grupos = await Promise.all(consultas.map(function (c) { return c.catch(function () { return []; }); }));
      if (n !== ultima) return;
      items = [].concat.apply([], grupos);
      sel = 0;
      res.innerHTML = '';
      if (!items.length) { res.appendChild(el('div', { class: 'qs-vacio', text: 'Sin resultados para «' + q + '».' })); return; }
      var g = null;
      items.forEach(function (it, i) {
        if (it.g !== g) { g = it.g; res.appendChild(el('div', { class: 'qs-g', text: g })); }
        it.nodo = el('button', { class: 'qs-i', type: 'button', role: 'option', onclick: function () { ir(it); }, onmousemove: function () { if (sel !== i) { sel = i; marcar(); } } }, [
          el('span', { class: 'avatar', text: it.av }), el('span', null, [el('b', { text: it.t }), it.s ? el('span', { class: 'muted', text: it.s }) : null])
        ]);
        res.appendChild(it.nodo);
      });
      marcar();
    }
  };

  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K') && A.yo()) { e.preventDefault(); A.buscar(); }
  });
  document.addEventListener('click', function (e) { if (e.target.closest('[data-buscar]')) A.buscar(); });
})();
