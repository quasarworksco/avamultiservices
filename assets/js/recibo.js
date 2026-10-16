/* AVA Multiservices — Recibo de pago con enlace privado y descarga en PDF */
(function () {
  'use strict';
  var API = 'https://szmkcwtkorsndvmxywai.supabase.co/rest/v1/rpc/';
  var KEY = 'sb_publishable_Ri5Pcd0a9dphA8W5qJ2YvQ_veqm7I26';
  var METODOS = { efectivo: 'Efectivo', zelle: 'Zelle', tarjeta: 'Tarjeta', cashapp: 'Cash App', transferencia: 'Transferencia', cheque: 'Cheque', otro: 'Otro' };
  var $ = function (id) { return document.getElementById(id); };
  var token = new URLSearchParams(location.search).get('t') || '';
  var dinero = function (n) { return Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' }); };
  var fecha = function (v) { return new Date(v + 'T12:00:00').toLocaleDateString('es-US', { day: 'numeric', month: 'long', year: 'numeric' }); };

  function noValido() { $('cargando').textContent = 'Este recibo no existe o el enlace está incompleto. Pide uno nuevo a AVA Multiservices.'; }
  if (!/^[0-9a-f-]{36}$/i.test(token)) { noValido(); return; }

  fetch(API + 'ver_recibo', { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_token: token }) })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d || !d.numero) { noValido(); return; }
      var saldo = d.precio != null ? Math.max(0, Number(d.precio) - Number(d.pagado || 0)) : null;
      document.title = 'Recibo #' + d.numero + ' · AVA Multiservices';
      $('num').textContent = '#' + d.numero;
      $('fecha').textContent = fecha(d.fecha);
      $('monto').textContent = dinero(d.monto);
      $('cliente').textContent = d.cliente;
      $('servicio').textContent = d.servicio || '';
      $('r-serv').hidden = !d.servicio;
      $('metodo').textContent = METODOS[d.metodo] || d.metodo;
      $('nota').textContent = d.nota || '';
      $('r-nota').hidden = !d.nota;
      $('saldo').textContent = saldo != null ? dinero(saldo) : '';
      $('r-saldo').hidden = saldo == null;
      $('tel').textContent = d.telefono ? ' · ' + d.telefono : '';
      $('cargando').hidden = true; $('recibo').hidden = false; $('acciones').hidden = false;
      $('pdf').onclick = function () { pdf(d, saldo); };
    })
    .catch(noValido);

  // El logo SVG se convierte a imagen para ponerlo en el PDF
  function logoPNG() {
    return new Promise(function (ok) {
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas'); c.width = 340; c.height = 160;
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        try { ok(c.toDataURL('image/png')); } catch (_) { ok(null); }
      };
      img.onerror = function () { ok(null); };
      img.src = '../assets/img/logo.svg';
    });
  }

  async function pdf(d, saldo) {
    if (!window.jspdf) { window.print(); return; }
    var doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'letter' });
    var W = doc.internal.pageSize.getWidth(), x = 64, y = 70, der = W - 64;
    var tinta = [42, 42, 42], gris = [120, 116, 110], acento = [106, 88, 72], linea = [228, 224, 218];
    var logo = await logoPNG();
    if (logo) doc.addImage(logo, 'PNG', x, y - 20, 102, 48);
    else { doc.setFont('times', 'bold'); doc.setFontSize(26); doc.setTextColor.apply(doc, tinta); doc.text('AVA', x, y + 14); }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor.apply(doc, gris);
    doc.text('RECIBO DE PAGO', der, y - 6, { align: 'right' });
    doc.setFont('times', 'normal'); doc.setFontSize(24); doc.setTextColor.apply(doc, tinta);
    doc.text('#' + d.numero, der, y + 18, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor.apply(doc, gris);
    doc.text(fecha(d.fecha), der, y + 34, { align: 'right' });
    y += 60;
    doc.setDrawColor.apply(doc, linea); doc.line(x, y, der, y);
    y += 46;
    doc.setFontSize(9); doc.setTextColor.apply(doc, acento); doc.text('MONTO RECIBIDO', W / 2, y, { align: 'center' });
    y += 44;
    doc.setFont('times', 'normal'); doc.setFontSize(46); doc.setTextColor.apply(doc, tinta); doc.text(dinero(d.monto), W / 2, y, { align: 'center' });
    y += 22;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor.apply(doc, acento); doc.text('PAGADO', W / 2, y, { align: 'center' });
    y += 34;
    var filas = [['Cliente', d.cliente], ['Servicio', d.servicio], ['Método de pago', METODOS[d.metodo] || d.metodo], ['Concepto', d.nota]].filter(function (f) { return f[1]; });
    if (saldo != null) filas.push(['Saldo pendiente de este servicio', dinero(saldo)]);
    filas.forEach(function (f) {
      doc.setDrawColor.apply(doc, linea); doc.line(x, y, der, y);
      y += 22;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor.apply(doc, gris); doc.text(f[0], x, y);
      doc.setFont('helvetica', 'bold'); doc.setTextColor.apply(doc, tinta);
      var val = doc.splitTextToSize(String(f[1]), 280);
      doc.text(val, der, y, { align: 'right' });
      y += 14 * (val.length - 1) + 14;
    });
    doc.setDrawColor.apply(doc, linea); doc.line(x, y, der, y);
    y += 40;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor.apply(doc, gris);
    doc.text('AVA Multiservices · Dallas, Texas' + (d.telefono ? ' · ' + d.telefono : ''), W / 2, y, { align: 'center' });
    doc.text('Gracias por tu confianza.', W / 2, y + 15, { align: 'center' });
    doc.save('Recibo-AVA-' + d.numero + '.pdf');
  }
})();
