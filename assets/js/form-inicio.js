/* AVA Multiservices — Formulario de Inicio (reparación de crédito) */
(function () {
  'use strict';

  // Cloudinary: subida sin firma con el preset de la cuenta
  var CLOUDINARY = {
    cloudName: 'bzrjdfnu',
    uploadPreset: 'avamultiservices',
    folder: 'formularios/inicio',
    maxBytes: 10 * 1024 * 1024
  };

  var form = document.getElementById('form-inicio');
  if (!form) return;

  var sendBtn = document.getElementById('f-send');
  var statusEl = form.querySelector('.f-status');
  var pending = 0;
  var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  // Redirección a la página de gracias del mismo dominio
  var nextField = document.getElementById('form-next');
  if (nextField && /^https?:$/.test(location.protocol)) nextField.value = location.origin + '/gracias.html';

  function showStatus(msg, kind) {
    statusEl.textContent = msg;
    statusEl.className = 'f-status show ' + kind;
  }
  function clearStatus() { statusEl.className = 'f-status'; }

  /* ---------- Navegación por secciones ---------- */
  var stepLinks = document.querySelectorAll('.f-steps a');
  if ('IntersectionObserver' in window) {
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        stepLinks.forEach(function (a) {
          var on = a.getAttribute('href') === '#' + en.target.id;
          a.classList.toggle('active', on);
          if (on) a.scrollIntoView({ block: 'nearest', inline: 'center' });
        });
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    document.querySelectorAll('.f-sec').forEach(function (s) { obs.observe(s); });
  }

  function refreshDone() {
    var done = {
      s1: !!(form.querySelector('#f-email').value && form.querySelector('#f-tel').value && form.querySelector('#f-empleador').value),
      s2: !!(form.querySelector('#f-dir').value || form.querySelector('#f-ciudad').value),
      s3: !!form.querySelector('#f-monitor').value,
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

  /* ---------- Subida de documentos a Cloudinary ---------- */
  function resetDrop(drop) {
    var hidden = drop.nextElementSibling;
    hidden.value = '';
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
    var nombre = (form.querySelector('#f-nombre').value + ' ' + form.querySelector('#f-apellidos').value).trim();

    var data = new FormData();
    data.append('file', file);
    data.append('upload_preset', CLOUDINARY.uploadPreset);
    data.append('folder', CLOUDINARY.folder);
    data.append('tags', 'formulario-inicio,' + drop.dataset.key);
    data.append('context', 'documento=' + drop.dataset.label + (nombre ? '|cliente=' + nombre.replace(/[|=]/g, ' ') : ''));

    var xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://api.cloudinary.com/v1_1/' + CLOUDINARY.cloudName + '/auto/upload');
    xhr.upload.addEventListener('progress', function (e) {
      if (e.lengthComputable) {
        var p = Math.round((e.loaded / e.total) * 100);
        bar.style.width = p + '%';
        sub.textContent = 'Subiendo… ' + p + '%';
      }
    });
    xhr.onload = function () {
      pending--;
      drop.classList.remove('uploading');
      var res = null;
      try { res = JSON.parse(xhr.responseText); } catch (e) { /* respuesta inválida */ }
      if (xhr.status >= 200 && xhr.status < 300 && res && res.secure_url) {
        hidden.value = res.secure_url;
        drop.classList.add('uploaded');
        sub.textContent = 'Subido correctamente';
        bar.style.width = '100%';
      } else {
        drop.classList.add('error');
        sub.textContent = 'No se pudo subir. Quita el archivo e inténtalo de nuevo.';
        bar.style.width = '0';
      }
      refreshDone();
    };
    xhr.onerror = function () {
      pending--;
      drop.classList.remove('uploading');
      drop.classList.add('error');
      sub.textContent = 'Error de conexión. Quita el archivo e inténtalo de nuevo.';
      bar.style.width = '0';
    };
    pending++;
    drop.classList.add('uploading');
    xhr.send(data);
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
      var okType = /^image\//.test(file.type) || file.type === 'application/pdf' || /\.(heic|heif|pdf)$/i.test(file.name);
      if (!okType) { showStatus('Solo se aceptan imágenes o PDF.', 'error'); input.value = ''; return; }
      if (file.size > CLOUDINARY.maxBytes) { showStatus('El archivo "' + file.name + '" supera los 10 MB.', 'error'); input.value = ''; return; }
      clearStatus();

      drop.classList.add('has-file');
      drop.querySelector('.d-t').textContent = file.name;
      var ico = drop.querySelector('.d-ico');
      if (/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
        var url = URL.createObjectURL(file);
        ico.innerHTML = '<img alt="" src="' + url + '">';
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

  /* ---------- Validación y envío ---------- */
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
    var email = form.querySelector('#f-email');
    var tel = form.querySelector('#f-tel');
    var emp = form.querySelector('#f-empleador');
    var cred = form.querySelector('#c-credito');
    var ssnDigits = ssn.value.replace(/\D/g, '');
    var checks = [
      [email, emailRe.test(email.value.trim())],
      [tel, tel.value.replace(/\D/g, '').length >= 10],
      [ssn, ssnDigits.length === 0 || ssnDigits.length === 9],
      [emp, emp.value.trim().length >= 2],
      [cred, cred.checked]
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

    var finish = function () {
      if (pending > 0) { showStatus('Terminando de subir tus documentos…', 'info'); setTimeout(finish, 400); return; }
      // Las opciones múltiples se envían como un solo campo
      var objetivos = Array.prototype.map.call(form.querySelectorAll('input[name="Objetivo"]:checked'), function (c) { return c.value; });
      var h = document.createElement('input');
      h.type = 'hidden'; h.name = '¿Para qué quiere mejorar su crédito?'; h.value = objetivos.join(', ') || 'No indicó';
      form.appendChild(h);
      form.querySelectorAll('input[name="Objetivo"]').forEach(function (c) { c.disabled = true; });
      // Los campos de archivo no se envían: solo los enlaces de Cloudinary
      form.querySelectorAll('input[type=file]').forEach(function (f) { f.disabled = true; });
      form.querySelectorAll('.drop + input[type=hidden]').forEach(function (h) { if (!h.value) h.value = 'No adjuntó'; });
      showStatus('Enviando tu información…', 'info');
      HTMLFormElement.prototype.submit.call(form);
    };
    finish();
  });

  window.addEventListener('pageshow', function () {
    submitting = false;
    sendBtn.classList.remove('loading');
    sendBtn.disabled = false;
    form.querySelectorAll('input[name="Objetivo"], input[type=file]').forEach(function (c) { c.disabled = false; });
  });
})();
