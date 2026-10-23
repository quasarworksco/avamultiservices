/* AVA Multiservices — Formato sencillo para contratos y textos largos.
   # Título de sección · ## Subtítulo · - viñeta · > recuadro destacado · **negrita** · *cursiva* · línea en blanco = párrafo nuevo.
   Siempre escapa el HTML: el texto lo escribe el equipo, pero se muestra en páginas públicas. */
(function () {
  'use strict';
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function linea(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>'); }
  function formato(texto) {
    var out = [], lista = null, parrafo = [], n = 0;
    function cerrar() {
      if (parrafo.length) { out.push('<p>' + parrafo.map(linea).join('<br>') + '</p>'); parrafo = []; }
      if (lista) { out.push('<ul>' + lista.join('') + '</ul>'); lista = null; }
    }
    String(texto || '').replace(/\r/g, '').split('\n').forEach(function (l) {
      var t = l.trim();
      if (!t) { cerrar(); return; }
      var m;
      if ((m = /^##\s+(.*)$/.exec(t))) { cerrar(); out.push('<h4 class="fx-sub">' + linea(m[1]) + '</h4>'); return; }
      if ((m = /^#\s+(.*)$/.exec(t))) { cerrar(); n++; out.push('<h3 class="fx-sec">' + linea(m[1]) + '</h3>'); return; }
      if ((m = /^>\s?(.*)$/.exec(t))) { cerrar(); out.push('<div class="fx-box">' + linea(m[1]) + '</div>'); return; }
      if ((m = /^[-•]\s+(.*)$/.exec(t))) { if (parrafo.length) { out.push('<p>' + parrafo.map(linea).join('<br>') + '</p>'); parrafo = []; } (lista = lista || []).push('<li>' + linea(m[1]) + '</li>'); return; }
      if (lista) { out.push('<ul>' + lista.join('') + '</ul>'); lista = null; }
      parrafo.push(t);
    });
    cerrar();
    return out.join('');
  }
  // ¿El texto usa el formato? (los contratos viejos son texto plano)
  formato.usa = function (t) { return /(^|\n)\s*(#{1,2}\s|[-•]\s|>\s?)|\*\*/.test(String(t || '')); };
  window.AVA_FORMATO = formato;
})();
