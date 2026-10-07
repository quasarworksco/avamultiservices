/* AVA Multiservices — interacciones */
(function () {
  'use strict';

  var doc = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  function storageGet(key) { try { return window.localStorage.getItem(key); } catch (e) { return null; } }
  function storageSet(key, val) { try { window.localStorage.setItem(key, val); } catch (e) { /* sin almacenamiento */ } }

  /* ---------- Traducciones (ES está en el HTML; aquí solo EN) ---------- */
  var EN = {
    'skip': 'Skip to content',
    'nav.home': 'Home', 'nav.services': 'Services', 'nav.about': 'About', 'nav.process': 'Process', 'nav.faq': 'FAQ', 'nav.contact': 'Contact', 'nav.cta': 'Book an appointment',
    'cta.whatsapp': 'Message us on WhatsApp', 'cta.services': 'View services',
    'hero.eyebrow': 'Dallas, Texas · In-person and online service',
    'hero.t1': 'Your paperwork,', 'hero.t2': 'in hands', 'hero.t3': 'you can trust.',
    'hero.lead': 'Immigration documents, taxes, LLC formation, notary services and credit repair. We guide you every step of the way, in Spanish or English, with complete clarity.',
    'hero.trust1': 'Service in Spanish', 'hero.trust2': 'Personalized attention', 'hero.trust3': '5 services in one place',
    'hv.status.t': 'Immigration filing', 'hv.status.s': 'Case in preparation', 'hv.step1': 'Documents received', 'hv.step2': 'Forms reviewed', 'hv.step3': 'Ready to submit',
    'hv.tax.s': 'Return ready', 'hv.tax.f': 'Secure e-file', 'hv.llc.t': 'Your LLC business', 'hv.llc.ok': 'Done', 'hv.chip': 'Ana Vargas · Available',
    'svc.imm': 'Immigration documents', 'svc.llc': 'LLC formation', 'svc.not': 'Notary public', 'svc.cre': 'Credit repair',
    'svc.kicker': 'How can we help you?', 'svc.title1': 'Everything you need,', 'svc.title2': 'in one place',
    'svc.lead': 'Five essential services for your family and your business, with the close attention and care your paperwork deserves.',
    'svc.imm.d': 'We prepare and organize your forms precisely so your application arrives complete and error-free.',
    'svc.imm.1': 'USCIS form preparation', 'svc.imm.2': 'Work permits and renewals', 'svc.imm.3': 'Family petitions, residency and citizenship', 'svc.imm.4': 'Evidence organization and review',
    'svc.ask': 'Request information',
    'svc.tax.d': 'Personal and business tax preparation, seeking the best possible outcome within the law.',
    'svc.tax.1': 'Personal and family returns', 'svc.tax.2': 'Self-employed, 1099 and small businesses', 'svc.tax.3': 'ITIN application and renewal', 'svc.tax.4': 'Electronic filing (e-file)',
    'svc.llc.d': 'Formalize your business in Texas with a solid structure from day one.',
    'svc.llc.1': 'Registration with the State of Texas', 'svc.llc.2': 'EIN application',
    'svc.not.d': 'We notarize your documents quickly and reliably.',
    'svc.not.1': 'Power of Attorney', 'svc.not.2': 'Sworn statements (affidavits)', 'svc.not.3': 'Travel consent for minors',
    'svc.cre.d': 'Improve your credit history and open the door to new opportunities.',
    'svc.cre.1': 'Credit report analysis', 'svc.cre.2': 'Disputing errors with the bureaus', 'svc.cre.3': 'Credit-building plan',
    'svc.cta.t': 'Not sure where to start?', 'svc.cta.d': 'Tell us about your situation and we will point you to the right service. No obligation.', 'svc.cta.b': 'Talk to Ana',
    'svc.cta2.t': 'Service wherever you are', 'svc.cta2.d': 'Start your paperwork via WhatsApp, phone or email, or book an in-person appointment in Dallas.',
    'about.role': 'Founder · AVA Multiservices', 'about.float.t': 'Our promise', 'about.float.v': 'Trust and clarity',
    'about.kicker': 'Meet the person by your side', 'about.title1': 'Care and experience', 'about.title2': 'at your service',
    'about.p1': 'At <strong>AVA Multiservices</strong> we know that behind every filing there is a family, a dream or a growing business. That is why we work with the same dedication we would give our own.',
    'about.p2': 'Led by <strong>Ana Vargas</strong>, our mission is to give the Hispanic community in Dallas a trusted place to handle their documents, taxes and finances, with clear explanations, in their language and without complications.',
    'about.v1.t': 'Trust', 'about.v1.d': 'Your information is handled with full confidentiality.',
    'about.v2.t': 'Clarity', 'about.v2.d': 'We explain every step and every cost up front.',
    'about.v3.t': 'Closeness', 'about.v3.d': 'Human, personalized attention from start to finish.',
    'fact1': 'Services in one place', 'fact2': 'Service in Spanish', 'fact3': 'One-on-one guidance', 'fact4': 'From Dallas to all of Texas',
    'proc.kicker': 'How we work', 'proc.title1': 'A simple process,', 'proc.title2': 'from start to finish',
    'proc.lead': 'We know paperwork can feel overwhelming. That is why we break it into clear steps so you always know where you stand.',
    'proc.1.t': 'Contact us', 'proc.1.d': 'Message us on WhatsApp, call us or fill out the form.',
    'proc.2.t': 'We review your case', 'proc.2.d': 'We look at what you need and tell you the documents and the cost.',
    'proc.3.t': 'We prepare everything', 'proc.3.d': 'We draft and review every document with care and precision.',
    'proc.4.t': 'Delivery and follow-up', 'proc.4.d': 'We hand you your completed paperwork and keep following up.',
    'faq.kicker': 'We answer your questions', 'faq.title1': 'Frequently asked', 'faq.title2': 'questions',
    'faq.lead': 'If you do not find your answer here, message us and we will gladly help.', 'faq.help': 'Have another question?',
    'faq.q1': 'Does AVA Multiservices provide legal advice?', 'faq.a1': 'No. We prepare documents with the information you provide, but we are not attorneys and do not give legal advice. If your case requires it, we will recommend that you consult a licensed immigration attorney.',
    'faq.q2': 'What do I need to prepare my taxes?', 'faq.a2': 'A photo ID, your SSN or ITIN (and your dependents’), W-2 or 1099 forms, records of other income and deductible expenses, and last year’s return if you have it.',
    'faq.q3': 'Can you help me open an LLC in Texas?', 'faq.a3': 'Yes. We prepare and file the Certificate of Formation with the Texas Secretary of State and guide you through the EIN, the Operating Agreement and your first business steps.',
    'faq.q4': 'Do you offer remote service?', 'faq.a4': 'Yes. Many services can be started via WhatsApp, phone or email. We also see clients by appointment in Dallas, Texas.',
    'faq.q5': 'How does credit repair work?', 'faq.a5': 'We review your credit reports, identify inaccurate information, prepare disputes with the bureaus and give you a plan to build a stronger history. Results vary by case.',
    'faq.q6': 'How do I book an appointment?', 'faq.a6': 'Message us on WhatsApp at (786) 816-2430, call us or fill out the contact form and we will get back to you as soon as possible.',
    'cta.t1': 'Take the first step', 'cta.t2': 'today', 'cta.d': 'Tell us what you need and we will reply with clear information to get your paperwork started.', 'cta.call': 'Call now',
    'contact.kicker': 'We are here to help', 'contact.title1': 'Let’s talk about', 'contact.title2': 'your paperwork',
    'contact.lead': 'Choose the channel you prefer. We will get back to you as soon as possible.',
    'contact.phone': 'Phone', 'contact.email': 'Email', 'contact.loc': 'Location',
    'form.title': 'Request an appointment', 'form.sub': 'Fill out the form and we will contact you soon.',
    'form.name': 'Full name', 'form.name.ph': 'Your name', 'form.phone': 'Phone', 'form.email': 'Email', 'form.email.ph': 'you@example.com',
    'form.service': 'Service of interest', 'chip.imm': 'Immigration', 'chip.not': 'Notary', 'chip.cre': 'Credit', 'chip.other': 'Other',
    'form.msg': 'How can we help you?', 'form.msg.ph': 'Briefly tell us about your case…',
    'form.consent': 'I authorize AVA Multiservices to contact me by phone, WhatsApp or email about my request.',
    'form.secure': 'Your information is confidential.', 'form.send': 'Send request',
    'form.err.name': 'Please enter your name.', 'form.err.phone': 'Enter a valid phone number.', 'form.err.email': 'Check the email format.',
    'form.err.service': 'Select a service.', 'form.err.consent': 'We need your permission to contact you.',
    'foot.about': 'Immigration documents, taxes, LLC, notary and credit repair in Dallas, Texas. Personalized service in Spanish.',
    'foot.nav': 'Navigation', 'foot.rights': 'All rights reserved.', 'foot.credit': 'Designed by',
    'foot.disc1': '<strong>Important notice:</strong> AVA Multiservices is not a law firm. I am not an attorney licensed to practice law in Texas and may not give legal advice or accept fees for legal advice. Document preparation services are based on the information provided by the client.',
    'wa.float': 'Let’s talk',
    'ty.kicker': 'Request received', 'ty.title1': 'Thank you for', 'ty.title2': 'reaching out',
    'ty.lead': 'We received your information. Ana Vargas will contact you as soon as possible to continue with your request.',
    'ty.next': 'What happens next?', 'ty.s1': 'We review your request', 'ty.s2': 'We contact you by phone or WhatsApp', 'ty.s3': 'We schedule your appointment',
    'ty.back': 'Back to home', 'ty.wa': 'Speed things up on WhatsApp'
  };

  var nodes = { text: [], html: [], ph: [] };
  document.querySelectorAll('[data-i18n]').forEach(function (el) { nodes.text.push({ el: el, es: el.textContent }); });
  document.querySelectorAll('[data-i18n-html]').forEach(function (el) { nodes.html.push({ el: el, es: el.innerHTML }); });
  document.querySelectorAll('[data-i18n-ph]').forEach(function (el) { nodes.ph.push({ el: el, es: el.getAttribute('placeholder') }); });

  var currentLang = 'es';

  function applyLang(lang) {
    currentLang = lang === 'en' ? 'en' : 'es';
    var en = currentLang === 'en';
    nodes.text.forEach(function (n) { var k = n.el.getAttribute('data-i18n'); n.el.textContent = en && EN[k] ? EN[k] : n.es; });
    nodes.html.forEach(function (n) { var k = n.el.getAttribute('data-i18n-html'); n.el.innerHTML = en && EN[k] ? EN[k] : n.es; });
    nodes.ph.forEach(function (n) { var k = n.el.getAttribute('data-i18n-ph'); n.el.setAttribute('placeholder', en && EN[k] ? EN[k] : n.es); });
    doc.setAttribute('lang', currentLang);
    document.querySelectorAll('.lang-btn').forEach(function (b) {
      var on = b.getAttribute('data-lang') === currentLang;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var langField = document.getElementById('form-lang');
    if (langField) langField.value = en ? 'English' : 'Español';
  }

  document.querySelectorAll('.lang-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var lang = btn.getAttribute('data-lang');
      if (lang === currentLang) return;
      storageSet('ava-lang', lang);
      if (reduceMotion) { applyLang(lang); return; }
      doc.classList.add('lang-switching');
      setTimeout(function () { applyLang(lang); doc.classList.remove('lang-switching'); }, 220);
    });
  });
  var savedLang = storageGet('ava-lang');
  if (savedLang === 'en') applyLang('en');

  /* ---------- Carga ---------- */
  requestAnimationFrame(function () { requestAnimationFrame(function () { doc.classList.add('loaded'); }); });

  /* ---------- Año ---------- */
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- Nav, progreso y WhatsApp flotante ---------- */
  var nav = document.getElementById('nav');
  var progress = document.querySelector('.progress');
  var waFloat = document.querySelector('.wa-float');
  var ticking = false;
  function onScroll() {
    var y = window.scrollY;
    if (nav) nav.classList.toggle('scrolled', y > 24);
    if (waFloat) waFloat.classList.toggle('show', y > 420);
    if (progress) {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.transform = 'scaleX(' + (max > 0 ? y / max : 0) + ')';
    }
    ticking = false;
  }
  window.addEventListener('scroll', function () { if (!ticking) { requestAnimationFrame(onScroll); ticking = true; } }, { passive: true });
  onScroll();

  /* ---------- Menú móvil ---------- */
  var toggle = document.querySelector('.menu-toggle');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    });
    nav.querySelectorAll('.mobile-menu a').forEach(function (a) {
      a.addEventListener('click', function () { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('open')) { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); }
    });
  }

  /* ---------- Enlace activo ---------- */
  var links = document.querySelectorAll('.nav-links a');
  if ('IntersectionObserver' in window && links.length) {
    var map = {};
    links.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
    var secObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && map[en.target.id]) {
          links.forEach(function (l) { l.classList.remove('active'); });
          map[en.target.id].classList.add('active');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(map).forEach(function (id) { var s = document.getElementById(id); if (s) secObs.observe(s); });
  }

  /* ---------- Revelado al hacer scroll ---------- */
  var revealEls = document.querySelectorAll('.reveal, .reveal-scale');
  if ('IntersectionObserver' in window && !reduceMotion) {
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); obs.unobserve(en.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(function (el) { obs.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---------- Contadores ---------- */
  var counters = document.querySelectorAll('[data-count]');
  if ('IntersectionObserver' in window && !reduceMotion) {
    var cObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target, target = parseInt(el.getAttribute('data-count'), 10), start = null, dur = 1600;
        function step(ts) {
          if (!start) start = ts;
          var p = Math.min((ts - start) / dur, 1);
          el.textContent = Math.round(target * (1 - Math.pow(1 - p, 4)));
          if (p < 1) requestAnimationFrame(step);
        }
        el.textContent = '0';
        requestAnimationFrame(step);
        cObs.unobserve(el);
      });
    }, { threshold: 0.6 });
    counters.forEach(function (c) { cObs.observe(c); });
  }

  /* ---------- Efectos de puntero (solo escritorio) ---------- */
  if (finePointer && !reduceMotion) {
    document.querySelectorAll('.service-card').forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        card.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    });

    var hero = document.querySelector('.hero');
    var layers = document.querySelectorAll('.hero-visual [data-depth]');
    if (hero && layers.length) {
      var raf = null;
      hero.addEventListener('pointermove', function (e) {
        if (raf) return;
        raf = requestAnimationFrame(function () {
          var x = e.clientX / window.innerWidth - 0.5;
          var y = e.clientY / window.innerHeight - 0.5;
          layers.forEach(function (l) {
            var d = parseFloat(l.getAttribute('data-depth'));
            l.style.translate = (-x * d).toFixed(1) + 'px ' + (-y * d).toFixed(1) + 'px';
          });
          raf = null;
        });
      });
      hero.addEventListener('pointerleave', function () { layers.forEach(function (l) { l.style.translate = '0 0'; }); });
    }

    document.querySelectorAll('.btn-primary, .btn-white').forEach(function (btn) {
      btn.addEventListener('pointermove', function (e) {
        var r = btn.getBoundingClientRect();
        var x = (e.clientX - r.left - r.width / 2) * 0.12;
        var y = (e.clientY - r.top - r.height / 2) * 0.2;
        btn.style.translate = x.toFixed(1) + 'px ' + y.toFixed(1) + 'px';
      });
      btn.addEventListener('pointerleave', function () { btn.style.translate = ''; });
    });
  }

  /* ---------- Preseleccionar servicio desde las tarjetas ---------- */
  document.querySelectorAll('[data-service]').forEach(function (a) {
    a.addEventListener('click', function () {
      var val = a.getAttribute('data-service');
      var radio = document.querySelector('.chip-input[value="' + val + '"]');
      if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); }
    });
  });

  /* ---------- Formulario ---------- */
  var form = document.getElementById('contact-form');
  if (form) {
    var nextField = document.getElementById('form-next');
    if (nextField && /^https?:$/.test(location.protocol) && !/formsubmit/.test(location.host)) {
      nextField.value = location.origin + location.pathname.replace(/[^/]*$/, '') + 'gracias.html';
    }

    var submitBtn = document.getElementById('form-submit');
    var phoneRe = /^[+()\-.\s\d]{7,20}$/;
    var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    function fieldOf(el) { return el.closest('.field'); }
    function setInvalid(el, bad) { var f = fieldOf(el); if (f) f.classList.toggle('invalid', bad); }

    function validate() {
      var ok = true, first = null;
      var name = form.querySelector('#f-name');
      var phone = form.querySelector('#f-phone');
      var email = form.querySelector('#f-email');
      var consent = form.querySelector('#f-consent');
      var service = form.querySelector('.chip-input:checked');

      var checks = [
        [name, name.value.trim().length >= 2],
        [phone, phoneRe.test(phone.value.trim()) && phone.value.replace(/\D/g, '').length >= 7],
        [email, email.value.trim() === '' || emailRe.test(email.value.trim())],
        [form.querySelector('.chip-input'), !!service],
        [consent, consent.checked]
      ];
      checks.forEach(function (c) {
        setInvalid(c[0], !c[1]);
        if (!c[1]) { ok = false; if (!first) first = c[0]; }
      });
      if (first) first.focus({ preventScroll: false });
      return ok;
    }

    form.querySelectorAll('.input, .chip-input, #f-consent').forEach(function (el) {
      el.addEventListener('input', function () { setInvalid(el, false); });
      el.addEventListener('change', function () { setInvalid(el, false); });
    });

    form.addEventListener('submit', function (e) {
      if (!validate()) { e.preventDefault(); return; }
      if (form.querySelector('[name="_honey"]').value) { e.preventDefault(); return; }
      submitBtn.classList.add('loading');
      submitBtn.disabled = true;
      // Envío nativo a FormSubmit, que redirige a gracias.html (_next).
    });

    window.addEventListener('pageshow', function () {
      submitBtn.classList.remove('loading');
      submitBtn.disabled = false;
    });

  }
})();
