// ==UserScript==
// @name         YouTube limpio (ShieldX)
// @namespace    shieldx
// @version      1.0
// @description  YouTube sin anuncios y sin Shorts. Mismo motor que ShieldX.
// @match        *://*.youtube.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

// Este fichero vale igual como userscript de Safari (iOS) que como user script
// inyectado desde una app con WKWebView: es JavaScript puro, sin APIs de
// extensión. Corre en el contexto de la página, en document-start, que es lo
// único que hace falta para llegar antes que el reproductor.
'use strict';

(function YouTubeLimpio() {
  if (window.__ytLimpio) return;
  window.__ytLimpio = true;

  const QUITAR_SHORTS = true;

  // Interruptor de la poda de anuncios. Si algún día un vídeo no arranca,
  // pon esto en false: el script deja los datos del reproductor SIN TOCAR y
  // solo esconde cosas por CSS. Si con false el vídeo va, el culpable es la
  // poda; si sigue sin ir, el problema no es de este script.
  const PODAR_ANUNCIOS = true;

  // Aviso de "esto está funcionando": sale abajo unos segundos al abrir
  // YouTube y se va solo. Cuando te canses, ponlo en false.
  const MOSTRAR_ESTADO = true;

  let podados = 0;   // cuántas claves de anuncio se han quitado

  // ── 1. Poda de los datos del reproductor ──────────────────────────────────
  // Las claves de anuncio se borran del JSON antes de que lo consuma el
  // reproductor. Nunca se bloquea la petición: eso deja el player colgado.
  const AD_KEYS = ['adPlacements', 'adSlots', 'playerAds', 'adBreakHeartbeatParams'];

  function podar(nodo, prof) {
    prof = prof || 0;
    if (!nodo || typeof nodo !== 'object' || prof > 12) return false;
    let cambiado = false;
    try {
      if (!Array.isArray(nodo)) {
        for (const k of AD_KEYS) {
          if (k in nodo) { delete nodo[k]; cambiado = true; podados++; }
        }
      }
      for (const k in nodo) {
        const v = nodo[k];
        if (v && typeof v === 'object' && podar(v, prof + 1)) cambiado = true;
      }
    } catch (_) {}
    return cambiado;
  }

  // El primer vídeo llega en una variable global que asigna un script inline.
  try {
    if (!PODAR_ANUNCIOS) throw 0;
    let guardado = window.ytInitialPlayerResponse;
    Object.defineProperty(window, 'ytInitialPlayerResponse', {
      configurable: true,
      get() { return guardado; },
      set(v) { podar(v); guardado = v; },
    });
    if (guardado) podar(guardado);
  } catch (_) {}

  // Los siguientes llegan por la red. AQUÍ ESTABA EL FALLO: yo interceptaba
  // fetch, leía la respuesta del reproductor y devolvía OTRA fabricada a mano.
  // Una respuesta fabricada nunca es igual que la de verdad —le falta la URL de
  // origen, el tipo, el estado de redirección— y el reproductor acaba fallando:
  // primero pantalla en negro, luego "se ha producido un error".
  //
  // Así que la respuesta ya no se toca. Se espera a que YouTube la convierta en
  // datos y se le quitan los anuncios AL OBJETO, en el sitio, un instante antes
  // de que los use. No se reconstruye nada, no hay cabeceras que cuadrar y no
  // hay ninguna petición bloqueada.
  // Filtro barato: si el texto ni siquiera menciona un anuncio, no se recorre
  // el objeto. Evita pasear por todo lo que YouTube interpreta, que es mucho.
  const INTERESA = new RegExp(AD_KEYS.join('|'));

  if (PODAR_ANUNCIOS) {
    const parseNativo = JSON.parse;
    JSON.parse = function parse(texto) {
      const datos = parseNativo.apply(this, arguments);
      try {
        if (typeof texto === 'string' && INTERESA.test(texto)) podar(datos);
      } catch (_) {}
      return datos;
    };

    // Y por si lo lee con response.json() en vez de con JSON.parse.
    try {
      const jsonNativo = Response.prototype.json;
      Response.prototype.json = function json() {
        return jsonNativo.apply(this, arguments).then((datos) => {
          try { podar(datos); } catch (_) {}
          return datos;
        });
      };
    } catch (_) {}
  }

  // ── 2. Shorts fuera ───────────────────────────────────────────────────────
  // En la web móvil los elementos van con prefijo ytm-; en la de escritorio,
  // ytd-. Se cubren los dos porque YouTube sirve una u otra según el ancho.
  // Selectores sencillos, los que entiende cualquier navegador.
  const SHORTS_SIMPLE = [
    'ytm-reel-shelf-renderer', 'ytd-reel-shelf-renderer',
    'ytd-rich-shelf-renderer[is-shorts]',
    'ytm-shorts-lockup-view-model', 'ytm-shorts-lockup-view-model-v2',
    'ytd-mini-guide-entry-renderer[aria-label="Shorts"]',
    'ytm-pivot-bar-item-renderer[tab-identifier="FEshorts"]',
  ];

  // Los que usan :has(). Van en SU PROPIA regla a propósito: en CSS, si un
  // selector de una lista separada por comas no se entiende, el navegador tira
  // la regla ENTERA. Mezclarlos habría dejado sin efecto también a los de
  // arriba en cualquier navegador que no soporte :has().
  //
  // Aquí SOLO van contenedores de UNA tarjeta. Tenía puesto
  // ytm-item-section-renderer, que en la web móvil envuelve secciones enteras
  // del inicio: bastaba un Short dentro para que se llevara por delante media
  // portada — la pantalla en negro.
  const SHORTS_HAS = [
    'ytd-video-renderer:has(a[href^="/shorts/"])',
    'ytd-rich-item-renderer:has(a[href^="/shorts/"])',
    'ytm-video-with-context-renderer:has(a[href^="/shorts/"])',
    'ytm-rich-item-renderer:has(a[href^="/shorts/"])',
    'ytd-guide-entry-renderer:has(a[title="Shorts"])',
    'ytm-pivot-bar-item-renderer:has([aria-label="Shorts"])',
    'ytm-pivot-bar-item-renderer:has([tab-identifier="FEshorts"])',
    'ytm-pivot-bar-item-renderer:has(a[href$="/shorts"])',
    // Las de verdad, vistas en la web de móvil: el botón es un div con clase.
    'ytm-pivot-bar-item-renderer:has(.pivot-shorts)',
    'ytm-pivot-bar-item-renderer:has(.pivot-bar-item-tab.shorts)',
  ];

  const CSS = `
    ${QUITAR_SHORTS ? SHORTS_SIMPLE.join(',') + '{display:none !important}' : ''}
    ${QUITAR_SHORTS ? SHORTS_HAS.join(',') + '{display:none !important}' : ''}
    ytm-companion-ad-renderer, ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer,
    ytd-promoted-video-renderer, ytd-display-ad-renderer, ytm-promoted-video-renderer,
    ytd-banner-promo-renderer, ytd-statement-banner-renderer,
    #player-ads, #masthead-ad, .ytp-ad-overlay-container, .ytp-ad-text-overlay,
    .video-ads { display: none !important; }
  `;

  function ponerCSS() {
    if (document.getElementById('ytlimpio-css')) return;
    const hoja = document.createElement('style');
    hoja.id = 'ytlimpio-css';
    hoja.textContent = CSS;
    (document.head || document.documentElement).appendChild(hoja);
  }
  ponerCSS();

  // Los nombres de los elementos de YouTube cambian cada dos por tres y no son
  // los mismos en la web móvil que en la de escritorio, así que fiarse de ellos
  // es perder. Lo que no cambia es que un Short es un enlace a /shorts/algo.
  //
  // Se parte de cada enlace y se sube buscando la tarjeta que lo envuelve, con
  // una regla que evita el desastre de antes: en cuanto un ancestro contiene
  // también vídeos normales, se para. Así es imposible llevarse por delante
  // una sección entera del inicio.
  function quitarShorts() {
    if (!QUITAR_SHORTS) return;

    let enlaces;
    try { enlaces = document.querySelectorAll('a[href*="/shorts/"]'); }
    catch (_) { return; }

    for (const enlace of enlaces) {
      if (enlace.dataset.ytl === '1') continue;
      enlace.dataset.ytl = '1';

      // Dos frenos, y los dos hacen falta:
      //  - Parar si el ancestro tiene vídeos normales dentro (mezclaría cosas).
      //  - No subir más de 3 niveles pase lo que pase. Sin este tope, en una
      //    sección que aún no ha cargado sus vídeos no habría nada que
      //    detuviera la subida y volveríamos a ocultar media portada. Las
      //    estanterías enteras de Shorts las cubre el CSS, que va por nombre.
      let nodo = enlace, elegido = enlace;
      for (let i = 0; i < 3 && nodo.parentElement; i++) {
        const padre = nodo.parentElement;
        if (padre === document.body || padre === document.documentElement) break;

        let normales = 0;
        try { normales = padre.querySelectorAll('a[href*="/watch?v="]').length; }
        catch (_) {}
        if (normales > 0) break;

        nodo = padre;
        elegido = padre;
      }

      try { elegido.style.setProperty('display', 'none', 'important'); } catch (_) {}
    }

    // El botón de Shorts: el de la barra de abajo (móvil), el del menú lateral
    // y el de las pestañas. Antes buscaba un enlace a "/shorts" exacto y por
    // eso seguía ahí: la dirección puede venir entera (https://…/shorts), con
    // parámetros detrás, o no haber enlace ninguno y ser un botón que solo
    // lleva el identificador interno de YouTube. Se miran las tres cosas.
    let candidatos;
    try {
      candidatos = document.querySelectorAll(
        'a[href*="shorts" i], [tab-identifier], [data-mobile-tab-identifier], ' +
        '[aria-label="Shorts"], [title="Shorts"], [role="tab"], ' +
        'ytm-pivot-bar-item-renderer, ytd-guide-entry-renderer, ' +
        'ytd-mini-guide-entry-renderer');
    } catch (_) { return; }

    for (const c of candidatos) {
      if (c.dataset.ytl === '1') continue;
      if (!esDeShorts(c)) continue;
      c.dataset.ytl = '1';
      // La caja entera, no solo lo que se ha reconocido: si se esconde nada
      // más el interior, el hueco se queda ocupando su sitio en la barra.
      const caja = c.closest(
        'ytm-pivot-bar-item-renderer, ytd-guide-entry-renderer, ' +
        'ytd-mini-guide-entry-renderer, li') || c;
      try { caja.style.setProperty('display', 'none', 'important'); } catch (_) {}
    }
  }

  // ¿Esto lleva a los Shorts? Se mira la RUTA de la dirección, no la dirección
  // entera: así un vídeo normal que lleve la palabra suelta en algún parámetro
  // (…/watch?v=x&list=shorts) no se lo lleva por delante.
  const RUTA_SHORTS = /^(?:https?:\/\/[^/]*)?\/shorts(?:[/?#]|$)/i;

  // La clase del botón de la barra de abajo. Hay dos variantes según la página
  // ("pivot-shorts" en el inicio, "shorts" a secas en los resultados de
  // búsqueda), así que se acepta la palabra suelta o con prefijo.
  const CLASE_SHORTS = /(^|\s)[a-z-]*shorts(\s|$)/i;

  function esDeShorts(el) {
    try {
      if (!el.getAttribute) return false;

      const href = el.getAttribute('href');
      if (href && RUTA_SHORTS.test(href)) return true;

      for (const a of ['tab-identifier', 'data-mobile-tab-identifier']) {
        const v = el.getAttribute(a);
        if (v && /shorts/i.test(v)) return true;   // FEshorts
      }

      const etiqueta = el.getAttribute('aria-label') || el.getAttribute('title') || '';
      if (/^\s*shorts\s*$/i.test(etiqueta)) return true;

      // El botón de la barra de abajo del móvil no es un enlace ni tiene
      // etiqueta: es <div role="tab" class="pivot-bar-item-tab pivot-shorts">
      // con la palabra dentro. Por eso no caía con nada de lo de arriba.
      const clase = typeof el.className === 'string' ? el.className : '';
      if (CLASE_SHORTS.test(clase)) return true;

      // Último recurso: un elemento de navegación cuyo texto ENTERO es
      // "Shorts". Se exige texto exacto para no llevarse por delante un vídeo
      // que hable de shorts en su título.
      const texto = (el.textContent || '').trim();
      if (texto.length <= 8 && /^shorts$/i.test(texto)) return true;
    } catch (_) {}
    return false;
  }

  // Un Short abierto directamente se convierte en un vídeo normal: mismo
  // contenido, con controles de verdad y sin el carrusel infinito.
  function shortAVideo() {
    if (!QUITAR_SHORTS) return;
    const m = location.pathname.match(/^\/shorts\/([\w-]{5,})/);
    if (!m) return;
    location.replace('/watch?v=' + m[1]);
  }
  shortAVideo();

  // ── 3. Si aun así entra un anuncio en el reproductor ──────────────────────
  let mudoAntes = false, velocidadAntes = 1, estabaEnAnuncio = false;

  const BOTON_SALTAR = [
    '#ytp-skip-ad button', '.ytp-skip-ad-button', '.ytp-ad-skip-button',
    'button.ytp-ad-skip-button-modern', '[class*="ytp-ad-skip"]',
    '.ytm-button-skip-ad', // móvil
  ].join(',');

  function hayAnuncio() {
    const p = document.getElementById('movie_player');
    return !!p && (p.classList.contains('ad-showing') ||
                   p.classList.contains('ad-interrupting'));
  }

  function saltarAnuncio() {
    const enAnuncio = hayAnuncio();
    const video = document.querySelector('video');
    if (!video) return;

    if (enAnuncio) {
      if (!estabaEnAnuncio) {
        mudoAntes = video.muted;
        const v = video.playbackRate || 1;
        velocidadAntes = v > 2 ? 1 : v;   // nunca capturar nuestro propio 16x
        estabaEnAnuncio = true;
      }
      const boton = document.querySelector(BOTON_SALTAR);
      if (boton && (boton.offsetWidth || boton.offsetHeight)) { boton.click(); return; }
      video.muted = true;
      if (video.playbackRate !== 16) video.playbackRate = 16;
      return;
    }

    if (estabaEnAnuncio) {
      estabaEnAnuncio = false;
      video.muted = mudoAntes;
      video.playbackRate = velocidadAntes || 1;
      if (video.paused && video.readyState >= 2) video.play().catch(() => {});
    }
  }

  // ── 4. El aviso de "usas un bloqueador" ───────────────────────────────────
  let avisoQuitadoEn = 0, ultimoGesto = 0;
  for (const t of ['pointerdown', 'keydown', 'touchstart']) {
    window.addEventListener(t, (e) => { if (e.isTrusted) ultimoGesto = Date.now(); }, true);
  }

  function quitarAviso() {
    const aviso = document.querySelector(
      'ytd-enforcement-message-view-model, yt-playability-error-supported-renderers');
    if (aviso) {
      const dialogo = aviso.closest('tp-yt-paper-dialog, ytd-popup-container') || aviso;
      try { dialogo.remove(); } catch (_) {}
      for (const b of document.querySelectorAll('tp-yt-iron-overlay-backdrop')) {
        try { b.remove(); } catch (_) {}
      }
      try {
        document.documentElement.style.removeProperty('overflow');
        if (document.body) document.body.style.removeProperty('overflow');
      } catch (_) {}
      avisoQuitadoEn = Date.now();
    }

    // YouTube deja el vídeo pausado: se insiste unos segundos, y se para en
    // cuanto el usuario toca algo (si la pausa la da él, manda él).
    if (!avisoQuitadoEn) return;
    if (Date.now() - avisoQuitadoEn > 10000 || ultimoGesto >= avisoQuitadoEn) {
      avisoQuitadoEn = 0;
      return;
    }
    const video = document.querySelector('video');
    if (video && video.paused && video.readyState >= 2 && !hayAnuncio()) {
      video.play().catch(() => {});
    }
  }

  // ── 5. "¿Está funcionando?" ───────────────────────────────────────────────
  // Un cartel discreto abajo, unos segundos, con lo que ha hecho. Es la forma
  // de saber que el script corre de verdad y no que YouTube ese día no tenía
  // anuncios que poner.
  function avisoDeEstado() {
    if (!MOSTRAR_ESTADO) return;
    if (window.top !== window) return;         // solo en la página principal
    if (document.getElementById('ytlimpio-aviso')) return;

    const caja = document.createElement('div');
    caja.id = 'ytlimpio-aviso';
    caja.textContent = 'YT LIMPIO ACTIVO · anuncios podados: ' + podados +
                       (QUITAR_SHORTS ? ' · shorts fuera' : '');
    caja.style.cssText =
      'position:fixed;left:50%;bottom:26px;transform:translateX(-50%);' +
      'z-index:2147483647;pointer-events:none;background:#080B0F;color:#00FF88;' +
      'border:1px solid rgba(0,255,136,.35);border-radius:6px;padding:8px 14px;' +
      'font:600 12px/1.4 -apple-system,Consolas,monospace;letter-spacing:.06em;' +
      'opacity:0;transition:opacity .35s ease';
    document.documentElement.appendChild(caja);

    requestAnimationFrame(() => { caja.style.opacity = '1'; });
    setTimeout(() => { caja.style.opacity = '0'; }, 4000);
    setTimeout(() => { try { caja.remove(); } catch (_) {} }, 4600);
  }

  // Se espera un poco: así el recuento incluye ya la respuesta del reproductor.
  if (document.readyState === 'complete') {
    setTimeout(avisoDeEstado, 1800);
  } else {
    window.addEventListener('load', () => setTimeout(avisoDeEstado, 1800));
  }

  // ── 6. Bucle y navegación ─────────────────────────────────────────────────
  function tick() {
    ponerCSS();       // YouTube reescribe la cabecera al navegar
    quitarShorts();
    saltarAnuncio();
    quitarAviso();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setInterval(tick, 200));
  } else {
    setInterval(tick, 200);
  }

  // YouTube navega sin recargar: hay que vigilar los cambios de URL.
  let ultimaUrl = location.href;
  setInterval(() => {
    if (location.href === ultimaUrl) return;
    ultimaUrl = location.href;
    estabaEnAnuncio = false;
    shortAVideo();
  }, 400);
})();
