/* AVA Multiservices — Plan de pagos en cuotas: lo ven el cliente en su factura y su recibo, y el equipo en el CRM.
   AVA_PLAN.nodo(plan, actual) dibuja la tabla; AVA_PLAN.resumen(plan) da total, pagado y saldo. */
(function (raiz) {
  'use strict';
  var EST = { pagada: ['ok', 'Pagado'], pendiente: ['pen', 'Pendiente'], vencida: ['ven', 'Vencido'], programada: ['pro', 'Próximo'] };
  function dinero(n) { return Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' }); }
  function fecha(v) { return v ? new Date(String(v).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-US', { day: 'numeric', month: 'long', year: 'numeric' }) : ''; }
  function cuando(c) {
    if (!c.fecha) return '';
    return (c.estado === 'pagada' ? 'Pagado el ' : c.estado === 'programada' ? 'Se cobra el ' : c.estado === 'vencida' ? 'Venció el ' : 'Vence el ') + fecha(c.fecha);
  }
  function resumen(plan) {
    var total = 0, pagado = 0;
    (plan || []).forEach(function (c) { total += Number(c.monto || 0); if (c.estado === 'pagada') pagado += Number(c.monto || 0); });
    total = Math.round(total * 100) / 100; pagado = Math.round(pagado * 100) / 100;
    var n = (plan || []).length ? Number(String(plan[0].cuota || '').split(' de ')[1]) || plan.length : 0;
    return { total: total, pagado: pagado, saldo: Math.round((total - pagado) * 100) / 100, cuotas: n };
  }
  function e(tag, cls, texto) { var n = document.createElement(tag); if (cls) n.className = cls; if (texto != null) n.textContent = texto; return n; }
  function fila(cls, a, b) { var r = e('div', 'pp-r' + (cls ? ' ' + cls : '')); r.appendChild(e('span', null, a)); r.appendChild(e('b', null, b)); return r; }

  // actual: la cuota de esta factura o recibo («2 de 3»), se resalta
  function nodo(plan, actual) {
    if (!plan || plan.length < 2 && !(plan[0] && plan[0].cuota)) return null;
    var s = resumen(plan);
    var caja = e('div', 'pp');
    caja.appendChild(e('div', 'pp-h', 'Plan de pagos · ' + s.cuotas + ' cuotas'));
    caja.appendChild(fila('', 'Total del plan', dinero(s.total)));
    caja.appendChild(fila('', 'Pagado hasta hoy', dinero(s.pagado)));
    var lista = e('div', 'pp-l');
    plan.forEach(function (c) {
      var est = EST[c.estado] || EST.pendiente;
      var r = e('div', 'pp-c' + (actual && c.cuota === actual ? ' actual' : ''));
      r.appendChild(e('span', 'pp-n', 'Pago ' + (c.cuota || '')));
      r.appendChild(e('span', 'pp-e ' + est[0], est[1]));
      r.appendChild(e('span', 'pp-f', cuando(c)));
      r.appendChild(e('b', 'pp-m', dinero(c.monto)));
      lista.appendChild(r);
    });
    caja.appendChild(lista);
    caja.appendChild(fila('pp-debe', s.saldo > 0 ? 'Saldo por pagar' : 'Plan pagado completo', dinero(s.saldo)));
    return caja;
  }
  raiz.AVA_PLAN = { nodo: nodo, resumen: resumen, cuando: cuando, estado: function (c) { return (EST[c.estado] || EST.pendiente)[1]; } };
})(this);
