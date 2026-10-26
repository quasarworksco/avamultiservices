/* AVA Multiservices — Formulario de Inicio (reparación de crédito)
   Los datos y documentos se guardan en Supabase (base de datos y almacenamiento privados).
   La llave pública solo permite crear solicitudes y subir archivos; leerlos requiere iniciar sesión en /admin/. */
(function () {
  'use strict';

  var CONFIG = {
    supabaseUrl: 'https://szmkcwtkorsndvmxywai.supabase.co',
    supabaseKey: 'sb_publishable_Ri5Pcd0a9dphA8W5qJ2YvQ_veqm7I26',
    bucket: 'documentos',
    carpeta: 'inicio',
    maxBytes: 10 * 1024 * 1024,
    // Aviso por correo sin datos sensibles (FormSubmit)
    avisoEmail: 'c4c439435576226a465fb1f7b87b6b02', // código de FormSubmit para info@avamultiservices.com (oculta el correo)
    panelUrl: 'https://avamultiservices.com/admin/'
  };

  var form = document.getElementById('form-inicio');
  if (!form) return;

  var solicitudId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : uuidFallback();
  var sendBtn = document.getElementById('f-send');
  var statusEl = form.querySelector('.f-status');
  var pending = 0;
  var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function uuidFallback() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }
  function headers(extra) {
    var h = { apikey: CONFIG.supabaseKey, Authorization: 'Bearer ' + CONFIG.supabaseKey };
    for (var k in extra) h[k] = extra[k];
    return h;
  }
  function showStatus(msg, kind) { statusEl.textContent = msg; statusEl.className = 'f-status show ' + kind; }
  function clearStatus() { statusEl.className = 'f-status'; }
  function val(id) { return (form.querySelector(id).value || '').trim(); }

  /* ---------- Navegación por secciones ---------- */
  var stepLinks = document.querySelectorAll('.f-steps a');
  if ('IntersectionObserver' in window) {
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        stepLinks.forEach(function (a) {
          var on = a.getAttribute('href') === '#' + en.target.id;
          a.classList.toggle('active', on);
          if (on && a.parentNode.scrollWidth > a.parentNode.clientWidth) {
            a.parentNode.scrollTo({ left: a.offsetLeft - 20, behavior: 'smooth' });
          }
        });
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    document.querySelectorAll('.f-sec').forEach(function (s) { obs.observe(s); });
  }

  function refreshDone() {
    var done = {
      s1: !!(val('#f-email') && val('#f-tel') && val('#f-empleador')),
      s2: !!(val('#f-dir') || val('#f-ciudad')),
      s3: !!val('#f-monitor'),
      s4: form.querySelectorAll('.drop.uploaded').length > 0,
      s5: form.querySelector('#c-credito').checked
    };
    stepLinks.forEach(function (a) { a.classList.toggle('done', !!done[a.getAttribute('href').slice(1)]); });
  }
  form.addEventListener('input', refreshDone);
  form.addEventListener('change', refreshDone);

  /* ---------- SSN: formato y visibilidad ---------- */
  var ssn = document.getElementById('f-ssn');
  ssn.addEventListener('input', function () {
    var d = ssn.value.replace(/\D/g, '').slice(0, 9);
    var out = d.slice(0, 3);
    if (d.length > 3) out += '-' + d.slice(3, 5);
    if (d.length > 5) out += '-' + d.slice(5);
    ssn.value = out;
  });
  document.querySelector('.ssn-toggle').addEventListener('click', function () {
    ssn.type = ssn.type === 'password' ? 'text' : 'password';
  });

  /* ---------- Documentos: subida al almacenamiento privado ---------- */
  function extension(file) {
    var m = /\.([a-z0-9]{2,5})$/i.exec(file.name);
    if (m) return m[1].toLowerCase();
    return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'application/pdf': 'pdf' })[file.type] || 'bin';
  }
  function contentType(file) {
    if (file.type) return file.type;
    var ext = extension(file);
    return ext === 'heic' || ext === 'heif' ? 'image/' + ext : ext === 'pdf' ? 'application/pdf' : 'image/jpeg';
  }

  function resetDrop(drop) {
    drop.nextElementSibling.value = '';
    drop.classList.remove('has-file', 'uploaded', 'error', 'uploading');
    drop.querySelector('input[type=file]').value = '';
    drop.querySelector('.d-ico').innerHTML = '<svg class="icon icon-lg"><use href="#i-upload"/></svg>';
    drop.querySelector('.d-t').textContent = drop.dataset.title;
    drop.querySelector('.d-s').textContent = drop.dataset.sub;
    drop.querySelector('.d-bar').style.width = '0';
    refreshDone();
  }

  function uploadFile(drop, file) {
    var hidden = drop.nextElementSibling;
    var bar = drop.querySelector('.d-bar');
    var sub = drop.querySelector('.d-s');
    var path = CONFIG.carpeta + '/' + solicitudId + '/' + drop.dataset.key + '-' + Date.now() + '.' + extension(file);

    var xhr = new XMLHttpRequest();
    xhr.open('POST', CONFIG.supabaseUrl + '/storage/v1/object/' + CONFIG.bucket + '/' + path);
    var h = headers({ 'Content-Type': contentType(file), 'x-upsert': 'false' });
    for (var k in h) xhr.setRequestHeader(k, h[k]);
    xhr.upload.addEventListener('progress', function (e) {
      if (e.lengthComputable) {
        var p = Math.round((e.loaded / e.total) * 100);
        bar.style.width = p + '%';
        sub.textContent = 'Subiendo… ' + p + '%';
      }
    });
    function fail(msg) {
      pending--;
      drop.classList.remove('uploading');
      drop.classList.add('error');
      sub.textContent = msg;
      bar.style.width = '0';
      refreshDone();
    }
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        pending--;
        drop.classList.remove('uploading');
        hidden.value = path;
        drop.classList.add('uploaded');
        sub.textContent = 'Subido correctamente';
        bar.style.width = '100%';
        refreshDone();
      } else {
        fail('No se pudo subir. Quita el archivo e inténtalo de nuevo.');
      }
    };
    xhr.onerror = function () { fail('Error de conexión. Quita el archivo e inténtalo de nuevo.'); };
    pending++;
    drop.classList.add('uploading');
    xhr.send(file);
  }

  document.querySelectorAll('.drop').forEach(function (drop) {
    var input = drop.querySelector('input[type=file]');
    drop.dataset.title = drop.querySelector('.d-t').textContent;
    drop.dataset.sub = drop.querySelector('.d-s').textContent;

    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function () { drop.classList.add('drag'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function () { drop.classList.remove('drag'); }); });

    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var okType = /^image\//.test(file.type) || file.type === 'application/pdf' || /\.(heic|heif|pdf|jpe?g|png|webp)$/i.test(file.name);
      if (!okType) { showStatus('Solo se aceptan imágenes o PDF.', 'error'); input.value = ''; return; }
      if (file.size > CONFIG.maxBytes) { showStatus('El archivo "' + file.name + '" supera los 10 MB.', 'error'); input.value = ''; return; }
      clearStatus();

      drop.classList.add('has-file');
      drop.querySelector('.d-t').textContent = file.name;
      var ico = drop.querySelector('.d-ico');
      if (/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
        var img = document.createElement('img');
        img.alt = '';
        img.src = URL.createObjectURL(file);
        ico.innerHTML = '';
        ico.appendChild(img);
      } else {
        ico.innerHTML = '<svg class="icon icon-lg"><use href="#i-file"/></svg>';
      }
      uploadFile(drop, file);
    });

    drop.querySelector('.d-remove').addEventListener('click', function (e) {
      e.preventDefault();
      if (drop.classList.contains('uploading')) return;
      resetDrop(drop);
    });
  });

  /* ---------- Validación ---------- */
  function setInvalid(el, bad) {
    var f = el.closest('.field');
    if (f) f.classList.toggle('invalid', bad);
  }
  form.querySelectorAll('.input, input[type=checkbox]').forEach(function (el) {
    el.addEventListener('input', function () { setInvalid(el, false); });
    el.addEventListener('change', function () { setInvalid(el, false); });
  });

  function validate() {
    var first = null;
    var ssnDigits = ssn.value.replace(/\D/g, '');
    var checks = [
      [form.querySelector('#f-email'), emailRe.test(val('#f-email'))],
      [form.querySelector('#f-tel'), val('#f-tel').replace(/\D/g, '').length >= 10],
      [ssn, ssnDigits.length === 0 || ssnDigits.length === 9],
      [form.querySelector('#f-empleador'), val('#f-empleador').length >= 2],
      [form.querySelector('#c-credito'), form.querySelector('#c-credito').checked]
    ];
    checks.forEach(function (c) {
      setInvalid(c[0], !c[1]);
      if (!c[1] && !first) first = c[0];
    });
    if (first) {
      first.closest('.field').scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(function () { first.focus({ preventScroll: true }); }, 400);
    }
    return !first;
  }

  /* ---------- Envío ---------- */
  function datos() {
    var documentos = {};
    form.querySelectorAll('.drop').forEach(function (d) {
      var path = d.nextElementSibling.value;
      if (path) documentos[d.dataset.key] = path;
    });
    var opt = function (v) { return v || null; };
    return {
      id: solicitudId,
      formulario: 'inicio',
      objetivos: Array.prototype.map.call(form.querySelectorAll('input[name="Objetivo"]:checked'), function (c) { return c.value; }),
      nombre: opt(val('#f-nombre')),
      apellidos: opt(val('#f-apellidos')),
      email: val('#f-email').toLowerCase(),
      telefono: val('#f-tel'),
      fecha_nacimiento: opt(val('#f-nac')),
      ssn: opt(ssn.value.trim()),
      empleador: val('#f-empleador'),
      direccion: opt(val('#f-dir')),
      direccion_postal: opt(val('#f-dirpostal')),
      pais: opt(val('#f-pais')),
      region: opt(val('#f-estado')),
      ciudad: opt(val('#f-ciudad')),
      codigo_postal: opt(val('#f-zip')),
      monitor_credito: opt(val('#f-monitor')),
      documentos: documentos,
      autoriza_credito: form.querySelector('#c-credito').checked,
      acepta_marketing: form.querySelector('#c-marketing').checked
    };
  }

  function avisar(d) {
    // Solo datos de contacto: nada sensible viaja por correo
    var nombre = [d.nombre, d.apellidos].filter(Boolean).join(' ') || 'Sin nombre';
    var body = {
      _subject: 'Nuevo formulario de inicio: ' + nombre,
      _template: 'table',
      _captcha: 'false',
      Cliente: nombre,
      Teléfono: d.telefono,
      Email: d.email,
      Objetivos: d.objetivos.join(', ') || 'No indicó',
      Documentos: Object.keys(d.documentos).length + ' de 3',
      'Ver en el panel': CONFIG.panelUrl + '#' + d.id
    };
    return fetch('https://formsubmit.co/ajax/' + CONFIG.avisoEmail, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    }).catch(function () { /* el aviso es opcional: la solicitud ya quedó guardada */ });
  }

  var submitting = false;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (submitting) return;
    if (form.querySelector('[name="_honey"]').value) return;
    if (!validate()) { showStatus('Revisa los campos marcados en rojo.', 'error'); return; }
    if (form.querySelector('.drop.error')) { showStatus('Uno de los documentos no se pudo subir. Quítalo y súbelo de nuevo.', 'error'); return; }

    submitting = true;
    sendBtn.classList.add('loading');
    sendBtn.disabled = true;

    var waitUploads = function (done) {
      if (pending > 0) { showStatus('Terminando de subir tus documentos…', 'info'); setTimeout(function () { waitUploads(done); }, 400); return; }
      done();
    };

    waitUploads(function () {
      showStatus('Enviando tu información de forma segura…', 'info');
      var d = datos();
      fetch(CONFIG.supabaseUrl + '/rest/v1/solicitudes', {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify(d)
      }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return Promise.race([avisar(d), new Promise(function (r) { setTimeout(r, 4000); })]);
      }).then(function () {
        window.location.href = '/gracias.html';
      }).catch(function () {
        submitting = false;
        sendBtn.classList.remove('loading');
        sendBtn.disabled = false;
        showStatus('No pudimos enviar tu información. Revisa tu conexión e inténtalo de nuevo, o escríbenos por WhatsApp al (786) 816-2430.', 'error');
      });
    });
  });
})();
