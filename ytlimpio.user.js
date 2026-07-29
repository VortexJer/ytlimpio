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
    let guardado = window.ytInitialPlayerResponse;
    Object.defineProperty(window, 'ytInitialPlayerResponse', {
      configurable: true,
      get() { return guardado; },
      set(v) { podar(v); guardado = v; },
    });
    if (guardado) podar(guardado);
  } catch (_) {}

  // Los siguientes llegan por fetch. En móvil el endpoint es el mismo que en
  // escritorio: /youtubei/v1/player y /youtubei/v1/get_watch (navegación SPA).
  // Solo las respuestas del reproductor. /next (comentarios y relacionados) se
  // deja en paz: no trae anuncios de vídeo, pesa mucho y reescribirla es
  // pedir problemas.
  const ENDPOINT =
    /\/youtubei\/v1\/(player(\?|$)|get_watch(\?|$)|reel\/reel_watch_sequence(\?|$)|reel\/reel_item_watch(\?|$))/;
  const fetchNativo = window.fetch;

  window.fetch = function fetch(entrada) {
    const p = fetchNativo.apply(this, arguments);
    let url = '';
    try {
      url = typeof entrada === 'string' ? entrada
          : (entrada instanceof Request ? entrada.url : String(entrada || ''));
    } catch (_) { return p; }
    if (!ENDPOINT.test(url)) return p;

    return p.then((resp) => {
      if (!resp || !resp.ok) return resp;
      return resp.clone().text().then((texto) => {
        try {
          const datos = JSON.parse(texto);
          if (!podar(datos)) return resp;
          // Cabeceras NUEVAS, no las del original: las suyas dicen que el
          // cuerpo viene comprimido y con cierta longitud, y este cuerpo ya
          // está descomprimido y mide otra cosa. Copiarlas tal cual es
          // sembrar respuestas ilegibles.
          const cabeceras = new Headers();
          cabeceras.set('content-type',
            resp.headers.get('content-type') || 'application/json; charset=utf-8');
          return new Response(JSON.stringify(datos), {
            status: resp.status, statusText: resp.statusText, headers: cabeceras,
          });
        } catch (_) { return resp; }
      }).catch(() => resp);
    });
  };

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
