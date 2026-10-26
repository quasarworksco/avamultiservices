/* AVA Multiservices — Factura por pagar con enlace privado: muestra el cobro y cómo pagarlo */
(function () {
  'use strict';
  var API = 'https://szmkcwtkorsndvmxywai.supabase.co/rest/v1/rpc/';
  var KEY = 'sb_publishable_Ri5Pcd0a9dphA8W5qJ2YvQ_veqm7I26';
  var $ = function (id) { return document.getElementById(id); };
  var token = new URLSearchParams(location.search).get('t') || '';
  var dinero = function (n) { return Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' }); };
  var fecha = function (v) { return new Date(String(v).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-US', { day: 'numeric', month: 'long', year: 'numeric' }); };
  var hoy = new Date(); hoy = new Date(hoy.getTime() - hoy.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  function noValida() { $('cargando').textContent = 'Esta factura no existe, fue cancelada o el enlace está incompleto. Escríbenos a AVA Multiservices.'; }
  if (!/^[0-9a-f-]{36}$/i.test(token)) { noValida(); return; }

  function nodo(tag, cls, texto) { var n = document.createElement(tag); if (cls) n.className = cls; if (texto != null) n.textContent = texto; return n; }
  function dato(valor) {
    var d = nodo('div', 'fc-dato'); d.appendChild(nodo('span', null, valor));
    var b = nodo('button', null, 'Copiar'); b.type = 'button';
    b.onclick = function () { navigator.clipboard.writeText(valor).then(function () { b.textContent = 'Copiado ✓'; setTimeout(function () { b.textContent = 'Copiar'; }, 1800); }); };
    d.appendChild(b); return d;
  }
  function opcion(titulo, texto, extra) {
    var o = nodo('div', 'fc-op'); o.appendChild(nodo('b', null, titulo));
    if (texto) o.appendChild(nodo('p', null, texto));
    (extra || []).forEach(function (x) { if (x) o.appendChild(x); });
    return o;
  }

  fetch(API + 'ver_factura', { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_token: token }) })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d || !d.numero) { noValida(); return; }
      var pagada = d.estado === 'pagada', vencida = !pagada && d.vence && d.vence < hoy;
      document.title = 'Factura #' + d.numero + ' · AVA Multiservices';
      $('num').textContent = '#' + d.numero;
      $('fecha').textContent = 'Emitida el ' + fecha(d.fecha);
      $('vence').textContent = d.vence && !pagada ? 'Pagar antes del ' + fecha(d.vence) : '';
      $('cliente').textContent = d.cliente;
      $('concepto').textContent = d.concepto;
      if (d.servicio && d.servicio !== d.concepto) { $('servicio').textContent = d.servicio; $('servicio').hidden = false; }
      if (d.detalle) { $('detalle').textContent = d.detalle; $('detalle').hidden = false; }
      $('monto').textContent = dinero(d.monto);
      $('total').textContent = dinero(d.monto);
      $('total-t').textContent = pagada ? 'Total pagado' : 'Total a pagar';
      $('estado').textContent = pagada ? '✓ Pagada' + (d.pagada_at ? ' el ' + fecha(d.pagada_at) : '') : vencida ? 'Vencida · pendiente de pago' : 'Pendiente de pago';
      $('estado').className = 'fc-est ' + (pagada ? 'ok' : vencida ? 'ven' : 'pen');
      $('tel').textContent = d.telefono ? ' · ' + d.telefono : '';
      var tel = String(d.telefono || '').replace(/\D/g, '');
      if (tel.length === 10) tel = '1' + tel;

      if (!pagada) {
        var ref = 'Factura #' + d.numero;
        $('ref').textContent = ref;
        var ops = $('opciones');
        (d.metodos || []).forEach(function (k) {
          if (k === 'zelle' && d.zelle) ops.appendChild(opcion('Zelle', 'Envía ' + dinero(d.monto) + ' por Zelle desde la app de tu banco a AVA Multiservices:', [dato(d.zelle)]));
          if (k === 'cashapp' && d.cashapp) {
            var tag = d.cashapp.charAt(0) === '$' ? d.cashapp : '$' + d.cashapp;
            var a = nodo('a', 'btn btn-ghost', 'Abrir Cash App'); a.href = 'https://cash.app/' + encodeURIComponent(tag) + '/' + Number(d.monto).toFixed(2); a.target = '_blank'; a.rel = 'noopener';
            ops.appendChild(opcion('Cash App', 'Envía ' + dinero(d.monto) + ' a:', [dato(tag), a]));
          }
          if (k === 'tarjeta' && d.tarjeta) {
            var t = nodo('a', 'btn btn-primary'); t.appendChild(nodo('span', 'btn-label', 'Pagar ' + dinero(d.monto) + ' con tarjeta')); t.href = d.tarjeta; t.target = '_blank'; t.rel = 'noopener';
            ops.appendChild(opcion('Tarjeta de crédito o débito', 'Pago seguro con Square. Se registra solo.', [t]));
          }
          if (k === 'efectivo') ops.appendChild(opcion('Efectivo', 'Puedes pagar en efectivo en nuestra oficina.'));
          if (k === 'transferencia') ops.appendChild(opcion('Transferencia bancaria', 'Escríbenos y te enviamos los datos de la cuenta.'));
          if (k === 'cheque') ops.appendChild(opcion('Cheque', 'A nombre de AVA Multiservices.'));
        });
        $('pagar').hidden = !ops.children.length;
        if (tel) {
          $('aviso').href = 'https://wa.me/' + tel + '?text=' + encodeURIComponent('Hola, ya pagué la factura #' + d.numero + ' por ' + dinero(d.monto) + ' (' + d.concepto + ').');
          $('aviso').hidden = false;
        }
      } else if (d.pago_token) {
        $('recibo').href = '../recibo/?t=' + d.pago_token; $('recibo').hidden = false;
      }
      $('cargando').hidden = true; $('factura').hidden = false; $('acciones').hidden = false;
    })
    .catch(noValida);
})();
