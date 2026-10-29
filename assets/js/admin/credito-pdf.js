/* Panel CRM — Lee el reporte 3B de SmartCredit (PDF) en el navegador y lo convierte en datos:
   puntajes, datos personales, cuentas por buró y consultas (inquiries). El PDF no sale de la computadora. */
(function (raiz) {
  'use strict';
  var BUROS = ['transunion', 'experian', 'equifax'];
  var NOMBRE_BURO = { 'TransUnion®': 'transunion', 'Experian®': 'experian', 'Equifax®': 'equifax', TransUnion: 'transunion', Experian: 'experian', Equifax: 'equifax' };
  var SECCIONES = ['Revolving Accounts', 'Installment Accounts', 'Other Accounts', 'Line of Credit Accounts', 'Collections Accounts', 'Mortgage Accounts', 'Real Estate Accounts', 'Open Accounts', 'Auto Accounts'];
  var CAMPOS = {
    'Account Number': 'numero', 'High Balance': 'saldo_maximo', 'Last Verified': 'verificada', 'Date of Last Activity': 'ultima_actividad',
    'Date Reported': 'reportada', 'Date Opened': 'abierta', 'Balance Owed': 'saldo', 'Closed Date': 'cerrada', 'Account Rating': 'calificacion',
    'Account Description': 'descripcion', 'Dispute Status': 'estado_disputa', 'Creditor Type': 'tipo_acreedor', 'Account Status': 'estado',
    'Payment Status': 'estado_pago', 'Creditor Remarks': 'comentarios', 'Payment Amount': 'pago', 'Last Payment': 'ultimo_pago', 'Term Length': 'plazo',
    'Past Due Amount': 'vencido', 'Account Type': 'tipo', 'Payment Frequency': 'frecuencia', 'Credit Limit': 'limite', 'Original Creditor': 'acreedor_original'
  };
  var PERSONAL = { 'Credit Report Date': 'fecha', Name: 'nombre', 'Also Known As': 'aka', 'Date of Birth': 'nacimiento', 'Current Address': 'direccion', 'Previous Addresses': 'direcciones_previas', Employer: 'empleador', 'Consumer Statement': 'declaracion' };
  var RESUMEN = { 'Total Accounts': 'total', 'Open Accounts': 'abiertas', 'Closed Accounts': 'cerradas', Delinquent: 'morosas', Derogatory: 'negativas', Balances: 'saldos', Payments: 'pagos', 'Public Records': 'registros_publicos', 'Inquiries (2 Years)': 'consultas' };
  var MULTILINEA = { direccion: ', ', direcciones_previas: ', ', comentarios: ' ', acreedor_original: ' ', tipo: ' ', nombre: ' ', aka: ' ' };

  /* Une los trozos de texto de una línea en segmentos (columnas). La ligadura «ff» llega como «!» */
  function segmentos(items) {
    var segs = [], act = null;
    items.forEach(function (it) {
      var s = it.s, lig = s === '!' && it.lig;
      if (lig) s = 'ff';
      var fin = act ? act.fin : -1e9, hueco = it.x - fin;
      if (act && hueco < 8) {
        act.t += (hueco < 1.5 || lig || act.ligPrev) ? s : ' ' + s;
        act.fin = it.x + it.w; act.ligPrev = lig;
      } else {
        act = { x: it.x, t: s, fin: it.x + it.w, ligPrev: lig };
        segs.push(act);
      }
    });
    return segs.map(function (g) { return { x: g.x, t: g.t.replace(/\s+/g, ' ').trim() }; }).filter(function (g) { return g.t; });
  }

  /* Agrupa los textos de cada página en líneas (de arriba hacia abajo) */
  function lineas(paginas) {
    var out = [];
    paginas.forEach(function (items, p) {
      var filas = [];
      items.forEach(function (it) {
        var f = null;
        for (var i = 0; i < filas.length; i++) if (Math.abs(filas[i].y - it.y) <= 2) { f = filas[i]; break; }
        if (!f) { f = { y: it.y, items: [] }; filas.push(f); }
        f.items.push(it);
      });
      filas.sort(function (a, b) { return b.y - a.y; }).forEach(function (f) {
        f.items.sort(function (a, b) { return a.x - b.x; });
        var segs = segmentos(f.items);
        if (segs.length) out.push({ p: p + 1, y: f.y, segs: segs, texto: segs.map(function (s) { return s.t; }).join(' | ') });
      });
    });
    return out;
  }

  function vacio(v) { return v == null || v === '' || /^[—–-]+$/.test(v); }
  function esCabecera(l) {
    return l.segs.length === 3 && l.segs.every(function (s) { return NOMBRE_BURO[s.t]; });
  }

  function parsear(paginas) {
    var L = lineas(paginas);
    var r = { puntajes: {}, personal: {}, resumen: {}, cuentas: [], consultas: [], contactos: [] };
    var seccion = '', cols = null, etiquetaX = 0, tabla = null, ultimo = null, modo = '', previas = [], cuenta = null, consulta = null;

    function columnas(l) {
      // Los valores empiezan unos 35 puntos a la izquierda del nombre del buró
      cols = l.segs.map(function (s) { return s.x - 35; });
      etiquetaX = cols[0] - 15;
    }
    function buroDe(x) {
      var mejor = 0;
      for (var i = 1; i < 3; i++) if (Math.abs(x - cols[i]) < Math.abs(x - cols[mejor])) mejor = i;
      return BUROS[mejor];
    }
    function filaTabla(l, mapa, destino) {
      var lab = l.segs[0].x < etiquetaX ? l.segs[0].t : null;
      var resto = lab ? l.segs.slice(1) : l.segs;
      var clave = lab ? mapa[lab] : ultimo;
      if (lab && !clave) return false;
      if (!clave) return false;
      if (lab) ultimo = clave;
      resto.forEach(function (s) {
        var b = buroDe(s.x);
        destino[b] = destino[b] || {};
        var v = s.t;
        if (vacio(v)) { if (lab) destino[b][clave] = destino[b][clave] || null; return; }
        var antes = destino[b][clave];
        destino[b][clave] = !lab && antes ? antes + (MULTILINEA[clave] || ' ') + v : (lab && antes ? antes + (MULTILINEA[clave] || ' ') + v : v);
      });
      return true;
    }
    function cerrarCuenta() {
      if (!cuenta) return;
      var c = cuenta; cuenta = null;
      c.buros = {};
      BUROS.forEach(function (b) {
        var d = c.datos[b] || {};
        var hay = Object.keys(d).some(function (k) { return !vacio(d[k]); });
        if (hay) c.buros[b] = d;
      });
      delete c.datos;
      var neg = /^negative/i.test(c.estado_linea || '');
      BUROS.forEach(function (b) {
        var d = c.buros[b]; if (!d) return;
        var mal = /derogatory/i.test(d.calificacion || '') || /collection|charge|late|repossess|foreclos|bankrupt|settle/i.test((d.estado_pago || '') + ' ' + (d.comentarios || ''));
        var at = c.atrasos && c.atrasos[b];
        if (at && (at[30] || at[60] || at[90])) mal = true;
        d.negativa = mal;
        if (mal) neg = true;
      });
      c.negativa = neg;
      c.id = (c.nombre + '|' + (c.numero || '') + '|' + c.seccion).toLowerCase();
      if (Object.keys(c.buros).length) r.cuentas.push(c);
    }

    L.forEach(function (l, i) {
      var t = l.texto, s0 = l.segs[0].t;
      // Títulos de sección
      if (l.segs.length === 1 && (s0 === 'Credit Scores' || s0 === 'Personal Information' || s0 === 'Summary' || s0 === 'Public Records' || SECCIONES.indexOf(s0) !== -1)) {
        cerrarCuenta(); seccion = s0; modo = ''; previas = []; tabla = null; return;
      }
      if (/^Inquiries\b/.test(s0) && !/\(2 Years\)/.test(s0) && l.segs.length <= 2 && (l.segs.length === 1 || /^\d+$/.test(l.segs[1].t) || /^Inquiries\s+\d+$/.test(s0))) {
        cerrarCuenta(); seccion = 'Inquiries'; modo = ''; return;
      }
      if (/^Creditor Contacts\b/.test(s0)) { cerrarCuenta(); seccion = 'Creditor Contacts'; modo = ''; return; }

      if (esCabecera(l)) {
        if (l.segs[0].x > 150) columnas(l);
        if (seccion === 'Personal Information') { tabla = r.personal; return; }
        if (seccion === 'Summary') { tabla = r.resumen; return; }
        if (SECCIONES.indexOf(seccion) !== -1) {
          if (l.segs[0].x <= 150) return; // cabecera de «Days Late»
          cerrarCuenta();
          var nom = previas[0] || { segs: [{ t: 'Cuenta' }] };
          var completo = nom.segs.map(function (s) { return s.t; }).join(' ');
          var mm = completo.match(/^(.*?)\s+(\S*\*\S*)$/);
          cuenta = { nombre: mm ? mm[1] : completo, numero: mm ? mm[2] : '', seccion: seccion, estado_linea: previas.slice(1).map(function (x) { return x.texto.replace(/ \| /g, ' '); }).join(' '), datos: {}, atrasos: null };
          previas = []; modo = 'tabla'; ultimo = null;
        }
        return;
      }

      if (seccion === 'Credit Scores') {
        var nums = l.segs.filter(function (s) { return /^\d{3}$/.test(s.t); });
        if (nums.length && cols) nums.forEach(function (s) { r.puntajes[buroDe(s.x)] = Number(s.t); });
        return;
      }
      if (seccion === 'Personal Information' && tabla) { filaTabla(l, PERSONAL, tabla); return; }
      if (seccion === 'Summary' && tabla) { filaTabla(l, RESUMEN, tabla); return; }

      if (SECCIONES.indexOf(seccion) !== -1) {
        if (/^Payment History/.test(s0)) { modo = 'historial'; return; }
        if (/^Days Late/.test(s0)) { modo = 'atrasos'; return; }
        if (modo === 'atrasos') {
          var vals = l.segs.filter(function (s) { return !/:$/.test(s.t) && !NOMBRE_BURO[s.t]; }).map(function (s) { return s.t; });
          if (vals.length === 9 && cuenta) {
            cuenta.atrasos = {};
            BUROS.forEach(function (b, k) { cuenta.atrasos[b] = { 30: Number(vals[k * 3]) || 0, 60: Number(vals[k * 3 + 1]) || 0, 90: Number(vals[k * 3 + 2]) || 0 }; });
            modo = 'espera';
          }
          return;
        }
        if (modo === 'historial') return;
        if (modo === 'tabla' && cuenta) {
          if (filaTabla(l, CAMPOS, cuenta.datos)) return;
        }
        // Lo que no es tabla ni historial: nombre de la próxima cuenta y su estado
        if (modo !== 'tabla' || !cuenta) previas.push(l);
        return;
      }

      if (seccion === 'Inquiries') {
        var fecha = /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s0);
        if (fecha) {
          var bu = l.segs.length > 1 ? NOMBRE_BURO[l.segs[l.segs.length - 1].t] : null;
          consulta = { fecha: s0, buro: bu || null, acreedor: '' };
          r.consultas.push(consulta);
          return;
        }
        if (consulta && !consulta.acreedor && l.segs.length === 1 && !/^(Match|No Match|The inquiries|Below are)/.test(s0)) { consulta.acreedor = s0; return; }
        return;
      }
      if (seccion === 'Creditor Contacts') {
        var tel = l.segs.length >= 2 && /\d{3}-\d{3}-\d{4}/.test(l.segs[l.segs.length - 1].t);
        if (tel) r.contactos.push({ nombre: l.segs[0].t, direccion: l.segs.length > 2 ? l.segs.slice(1, -1).map(function (s) { return s.t; }).join(' ') : '', telefono: l.segs[l.segs.length - 1].t });
        else if (r.contactos.length && l.segs.length === 1 && l.segs[0].x > 150) {
          var u = r.contactos[r.contactos.length - 1]; u.direccion = (u.direccion ? u.direccion + ', ' : '') + l.segs[0].t;
        }
      }
    });
    cerrarCuenta();
    var f = r.personal.transunion && r.personal.transunion.fecha || r.personal.experian && r.personal.experian.fecha || r.personal.equifax && r.personal.equifax.fecha;
    if (f && /^\d{2}\/\d{2}\/\d{4}$/.test(f)) r.fecha = f.slice(6) + '-' + f.slice(0, 2) + '-' + f.slice(3, 5);
    r.valido = Object.keys(r.puntajes).length > 0 || r.cuentas.length > 0;
    return r;
  }

  /* Lee el PDF con pdf.js y devuelve los textos con su posición */
  async function extraer(pdfjs, datos) {
    var doc = await pdfjs.getDocument({ data: datos }).promise;
    var paginas = [];
    for (var i = 1; i <= doc.numPages; i++) {
      var pg = await doc.getPage(i);
      var tc = await pg.getTextContent();
      // La fuente de símbolos de SmartCredit trae la ligadura «ff» como «!»
      var fuentes = {};
      tc.items.forEach(function (it) { if (it.str === '!') fuentes[it.fontName] = (fuentes[it.fontName] || 0) + 1; });
      paginas.push(tc.items.filter(function (it) { return it.str && it.str.trim(); }).map(function (it) {
        return { s: it.str.normalize('NFKC'), x: it.transform[4], y: it.transform[5], w: it.width, lig: it.str === '!' && fuentes[it.fontName] > 0 && tc.items.some(function (o) { return o.fontName === it.fontName && o.str !== '!' && o.str.trim(); }) === false };
      }));
    }
    return parsear(paginas);
  }

  var api = { parsear: parsear, extraer: extraer, lineas: lineas, BUROS: BUROS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.AVA_REPORTE = api;
})(this);
