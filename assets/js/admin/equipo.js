/* Panel CRM — Equipo: usuarios, permisos, invitaciones y registro de actividad (solo administradora) */
(function () {
  'use strict';
  var A = window.AVA, el = A.el, sb = A.sb;
  var ENTIDAD = { clientes: 'la ficha de', casos: 'el caso', solicitudes: 'la solicitud de', admins: 'al usuario', admin_emails: '' };
  var POR_DEFECTO = A.ROLES.completa.p;

  var ui = {};

  A.vista('equipo', {
    permiso: 'equipo',
    render: function (cont) {
      ui.members = el('div', { class: 'members' });
      ui.act = el('div', { class: 'timeline' });
      cont.appendChild(A.cabecera('Ajustes', 'Equipo', 'y permisos', [
        el('button', { class: 'btn btn-dark btn-sm', onclick: invitar }, [A.icon('i-user-plus'), el('span', { text: 'Invitar usuario' })])
      ]));
      cont.appendChild(ui.members);
      cont.appendChild(el('div', { class: 'card', style: 'margin-top:20px' }, [el('h3', { class: 't', text: 'Actividad reciente' }), ui.act]));
      cargar();
    }
  });

  async function cargar() {
    ui.members.innerHTML = '';
    ui.members.appendChild(el('div', { class: 'empty', text: 'Cargando equipo…' }));
    var res = await Promise.all([
      sb.from('admins').select('user_id,email,nombre,rol,permisos,activo,acceso_hasta,created_at').order('created_at'),
      sb.from('admin_emails').select('email,nombre,rol,permisos,created_at'),
      sb.from('actividad').select('*').order('created_at', { ascending: false }).limit(40)
    ]);
    ui.members.innerHTML = '';
    if (res[0].error) { ui.members.appendChild(el('div', { class: 'empty', text: 'No se pudo cargar el equipo.' })); return; }
    var miembros = (res[0].data || []).filter(function (m) { return m.email !== 'prueba-panel@avamultiservices.com'; });
    var correos = miembros.map(function (m) { return m.email; });
    var pendientes = (res[1].data || []).filter(function (i) { return correos.indexOf(i.email) === -1; });
    miembros.forEach(function (m) { ui.members.appendChild(tarjeta(m)); });
    pendientes.forEach(function (i) { ui.members.appendChild(pendiente(i)); });
    if (miembros.length + pendientes.length < 2) {
      ui.members.appendChild(el('div', { class: 'member', style: 'text-align:center;border-style:dashed' }, [
        el('div', { class: 'muted', text: 'Invita a tu compañera para que trabaje contigo en el panel. Tú decides qué puede ver y hacer.' }),
        el('button', { class: 'btn btn-ghost btn-sm', style: 'margin-top:12px', onclick: invitar }, [A.icon('i-user-plus'), el('span', { text: 'Invitar usuario' })])
      ]));
    }
    actividad(res[2].data || []);
  }

  function interruptor(checked, disabled, onchange) {
    var inp = el('input', { type: 'checkbox', disabled: disabled });
    inp.checked = checked;
    if (onchange) inp.addEventListener('change', function () { onchange(inp); });
    return el('span', { class: 'switch' }, [inp, el('span')]);
  }

  function tarjeta(m) {
    var esAdmin = m.rol === 'admin';
    var yo = m.user_id === A.yo().user_id;
    var perms = el('div', { class: 'perms' });
    A.PERMISOS.forEach(function (p) {
      var on = esAdmin || (m.permisos || []).indexOf(p[0]) !== -1;
      perms.appendChild(el('label', { class: 'perm' }, [
        el('span', null, [p[1], el('small', { text: p[2] })]),
        interruptor(on, esAdmin || !m.activo, async function (inp) {
          var nuevos = (m.permisos || []).filter(function (x) { return x !== p[0]; });
          if (inp.checked) nuevos.push(p[0]);
          var r = await sb.from('admins').update({ permisos: nuevos }).eq('user_id', m.user_id);
          if (r.error) { inp.checked = !inp.checked; A.toast('No se pudo cambiar el permiso.', 'error'); return; }
          m.permisos = nuevos;
          await sb.from('admin_emails').update({ permisos: nuevos }).eq('email', m.email);
          A.toast((inp.checked ? 'Permiso activado: ' : 'Permiso desactivado: ') + p[1]);
        })
      ]));
    });
    var activo = el('label', { class: 'perm', style: 'padding:8px 12px' }, [
      el('span', { text: m.activo ? 'Acceso activo' : 'Acceso desactivado' }),
      interruptor(m.activo, yo || esAdmin, async function (inp) {
        if (!inp.checked && !confirm('¿Quitar el acceso a ' + (m.nombre || m.email) + '? No podrá entrar al panel hasta que lo actives de nuevo.')) { inp.checked = true; return; }
        var r = await sb.from('admins').update({ activo: inp.checked }).eq('user_id', m.user_id);
        if (r.error) { inp.checked = !inp.checked; A.toast('No se pudo cambiar el acceso.', 'error'); return; }
        A.limpiarEquipo();
        A.toast(inp.checked ? 'Acceso activado.' : 'Acceso desactivado.');
        cargar();
      })
    ]);
    return el('div', { class: 'member' }, [
      el('div', { class: 'member-h' }, [
        el('span', { class: 'avatar', text: A.iniciales(m.nombre || m.email) }),
        el('div', { class: 'info' }, [el('b', { text: (m.nombre || m.email) + (yo ? ' (tú)' : '') }), el('div', { text: m.email })]),
        el('span', { class: 'pill ' + (m.activo ? 'completado' : 'inactivo'), text: esAdmin ? 'Administradora' : (m.activo ? 'Equipo' : 'Sin acceso') }),
        esAdmin ? null : activo
      ]),
      esAdmin ? el('div', { class: 'muted', style: 'margin-top:12px', text: 'Acceso total: ve y gestiona todo el panel, el equipo y la actividad.' }) : extras(m),
      esAdmin ? null : perms
    ]);
  }

  /* Rol rápido y fecha de fin del acceso */
  function extras(m) {
    var rol = el('select', { class: 'input sm', 'aria-label': 'Aplicar rol' }, [el('option', { value: '', text: 'Aplicar un rol…' })].concat(Object.keys(A.ROLES).filter(function (k) { return k !== 'personal'; }).map(function (k) { return el('option', { value: k, text: A.ROLES[k].n }); })));
    rol.addEventListener('change', async function () {
      if (!rol.value) return;
      var p = A.ROLES[rol.value].p;
      var r = await sb.from('admins').update({ permisos: p }).eq('user_id', m.user_id);
      if (r.error) { A.toast('No se pudo aplicar.', 'error'); return; }
      await sb.from('admin_emails').update({ permisos: p }).eq('email', m.email);
      A.toast('Rol aplicado: ' + A.ROLES[rol.value].n); cargar();
    });
    var hasta = el('input', { class: 'input sm', type: 'date', value: m.acceso_hasta || '', 'aria-label': 'Acceso hasta' });
    hasta.addEventListener('change', async function () {
      var r = await sb.from('admins').update({ acceso_hasta: hasta.value || null }).eq('user_id', m.user_id);
      A.toast(r.error ? 'No se pudo guardar.' : (hasta.value ? 'Su acceso termina el ' + A.fecha(hasta.value) + '.' : 'Acceso sin fecha de fin.'), r.error ? 'error' : '');
    });
    var vencido = m.acceso_hasta && m.acceso_hasta < A.hoyISO();
    return el('div', { class: 'member-x' }, [
      el('label', { class: 'field' }, [el('span', { class: 'field-legend', text: 'Rol rápido' }), rol]),
      el('label', { class: 'field' }, [el('span', { class: 'field-legend', text: 'Acceso hasta (opcional)' }), hasta]),
      vencido ? el('div', { class: 'alert warn' }, [A.icon('i-alert', 'icon-sm'), 'Su acceso venció el ' + A.fecha(m.acceso_hasta) + '.']) : null
    ]);
  }

  function pendiente(i) {
    return el('div', { class: 'member' }, [
      el('div', { class: 'member-h' }, [
        el('span', { class: 'avatar', text: A.iniciales(i.nombre || i.email) }),
        el('div', { class: 'info' }, [el('b', { text: i.nombre || i.email }), el('div', { text: i.email + ' · invitada ' + A.hace(i.created_at) })]),
        el('span', { class: 'pill pendiente', text: 'Invitación pendiente' }),
        el('button', { class: 'mini-btn', type: 'button', text: 'Reenviar', onclick: async function () { await enviar(i.email); } }),
        el('button', { class: 'mini-btn danger', type: 'button', text: 'Cancelar', onclick: async function () {
          if (!confirm('¿Cancelar la invitación de ' + i.email + '?')) return;
          var r = await sb.from('admin_emails').delete().eq('email', i.email);
          if (r.error) { A.toast('No se pudo cancelar.', 'error'); return; }
          A.toast('Invitación cancelada.'); cargar();
        } })
      ]),
      el('div', { class: 'chips', style: 'margin-top:12px' }, (i.permisos || []).map(function (k) {
        var p = A.PERMISOS.filter(function (x) { return x[0] === k; })[0];
        return el('span', { class: 'chip-s', text: p ? p[1] : k });
      }))
    ]);
  }

  async function enviar(email) {
    var r = await sb.functions.invoke('invitar', { body: { email: email } });
    if (r.error) { A.toast('No se pudo enviar la invitación. Inténtalo de nuevo.', 'error'); return false; }
    A.toast(r.data && r.data.estado === 'existente' ? 'Esa cuenta ya existía: ya tiene acceso con su contraseña.' : 'Invitación enviada a ' + email + '.');
    return true;
  }

  function invitar() {
    var checks = el('div', { class: 'check-grid' });
    A.PERMISOS.forEach(function (p) {
      var inp = el('input', { type: 'checkbox', value: p[0] });
      inp.checked = POR_DEFECTO.indexOf(p[0]) !== -1;
      checks.appendChild(el('label', { class: 'check' }, [inp, el('span', null, [p[1], el('small', { class: 'muted', style: 'display:block;font-size:11.5px', text: p[2] })])]));
    });
    A.modal({
      titulo: 'Invitar usuario', ok: 'Enviar invitación',
      campos: [
        { k: 'nombre', label: 'Nombre', required: true, max: 120 },
        { k: 'email', label: 'Correo', type: 'email', required: true },
        { k: 'rol', label: 'Rol', type: 'select', value: 'completa', options: Object.keys(A.ROLES).map(function (k) { return [k, A.ROLES[k].n]; }) },
        { k: 'acceso_hasta', label: 'Acceso hasta (opcional)', type: 'date' }
      ],
      extra: el('div', { class: 'field', style: 'margin-top:16px' }, [
        el('div', { class: 'field-legend', text: 'Qué puede ver y hacer' }), checks,
        el('p', { class: 'muted', style: 'margin-top:10px', text: 'Le llegará un correo para crear su contraseña. Puedes cambiar estos permisos cuando quieras.' })
      ]),
      guardar: async function (d, aviso) {
        var email = d.email.toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { A.msg(aviso, 'Revisa el correo.'); return false; }
        var permisos = Array.prototype.map.call(checks.querySelectorAll('input:checked'), function (c) { return c.value; });
        var r = await sb.from('admin_emails').upsert({ email: email, nombre: d.nombre, rol: 'miembro', permisos: permisos, acceso_hasta: d.acceso_hasta || null });
        if (r.error) { A.msg(aviso, 'No se pudo registrar la invitación.'); return false; }
        var ok = await enviar(email);
        A.limpiarEquipo();
        cargar();
        return ok ? true : false;
      }
    });
    var sel = document.getElementById('m-rol');
    function aplicar() { var p = A.ROLES[sel.value].p; if (sel.value === 'personal') return; checks.querySelectorAll('input').forEach(function (i) { i.checked = p.indexOf(i.value) !== -1; }); }
    sel.addEventListener('change', aplicar); aplicar();
  }

  function actividad(filas) {
    ui.act.innerHTML = '';
    if (!filas.length) { ui.act.appendChild(el('div', { class: 'muted', text: 'Aquí verás quién creó, editó o eliminó cada cosa.' })); return; }
    filas.forEach(function (a) {
      var que = a.entidad === 'admin_emails' ? 'a ' + (a.resumen || '') : (ENTIDAD[a.entidad] || a.entidad) + ' ' + (a.entidad === 'casos' ? A.resumenCaso(a.resumen) : (a.resumen || ''));
      if (a.accion === 'vio datos sensibles de') que = a.resumen || '';
      ui.act.appendChild(el('div', { class: 'tl-i' }, [el('div', null, [el('b', { text: a.usuario || 'Alguien' }), ' ' + a.accion + ' ' + que, el('span', { text: A.hace(a.created_at) })])]));
    });
  }
})();
