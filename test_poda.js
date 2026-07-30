// Comprueba la poda de anuncios del reproductor, que es lo que rompía el play.
// Carga el script ENTERO sobre un YouTube de mentira: si algo peta al arrancar,
// esto lo caza tambien.
//
//   node test_poda.js
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'ytlimpio.user.js'), 'utf8');

let fallos = 0;
function comprobar(desc, ok) {
  console.log((ok ? 'OK   ' : 'FALLO') + '  ' + desc);
  if (!ok) fallos++;
}

// ── YouTube de mentira ──────────────────────────────────────────────────────
const nada = () => {};
const elementoFalso = () => ({
  id: '', textContent: '', style: { cssText: '', setProperty: nada, removeProperty: nada },
  dataset: {}, classList: { contains: () => false },
  appendChild: nada, remove: nada, closest: () => null,
  querySelectorAll: () => [], offsetWidth: 0, offsetHeight: 0,
});

const raiz = elementoFalso();
const documento = {
  readyState: 'complete', documentElement: raiz, head: raiz, body: elementoFalso(),
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  createElement: elementoFalso, addEventListener: nada,
};

const ventana = {
  top: null, addEventListener: nada,
  setInterval: nada, setTimeout: nada, requestAnimationFrame: nada,
  location: { pathname: '/watch', href: 'https://m.youtube.com/watch?v=abc', replace: nada },
  JSON, Response, Headers, Request, Date, RegExp, performance,
};
ventana.top = ventana;   // sin esto el aviso de estado se cree un iframe

// El script hace `window.fetch`, `document.…`, `location.…`, `setInterval(…)`
// sueltos: se le pasan todos como parámetros, que es como si fueran globales.
const cargar = new Function(
  'window', 'document', 'location', 'setInterval', 'setTimeout',
  'requestAnimationFrame', 'JSON', 'Response',
  src + '\n; return { JSON: JSON, Response: Response };');

const entorno = cargar(ventana, documento, ventana.location, nada, nada, nada,
  Object.create(JSON), Response);

comprobar('el script arranca entero sin reventar', !!entorno);

// ── 1. Respuesta del reproductor: fuera anuncios, intacto lo demás ──────────
{
  const original = {
    responseContext: { visitorData: 'Cgt4eHg%3D' },
    playabilityStatus: { status: 'OK' },
    streamingData: {
      expiresInSeconds: '21540',
      formats: [{ itag: 18, url: 'https://rr3---sn-x.googlevideo.com/videoplayback?abc' }],
      adaptiveFormats: [{ itag: 137, url: 'https://rr3---sn-x.googlevideo.com/vp?def' }],
    },
    adPlacements: [{ adPlacementRenderer: { config: {} } }],
    adSlots: [{ adSlotRenderer: {} }],
    playerAds: [{ playerLegacyDesktopWatchAdsRenderer: {} }],
    videoDetails: { videoId: 'abc', title: 'Un vídeo', lengthSeconds: '212' },
  };
  const texto = JSON.stringify(original);
  const datos = entorno.JSON.parse(texto);

  comprobar('adPlacements fuera', !('adPlacements' in datos));
  comprobar('adSlots fuera', !('adSlots' in datos));
  comprobar('playerAds fuera', !('playerAds' in datos));

  comprobar('streamingData INTACTO (esto era el play que fallaba)',
    JSON.stringify(datos.streamingData) === JSON.stringify(original.streamingData));
  comprobar('la URL del vídeo sigue ahí y sin tocar',
    datos.streamingData.formats[0].url ===
    'https://rr3---sn-x.googlevideo.com/videoplayback?abc');
  comprobar('playabilityStatus sigue en OK', datos.playabilityStatus.status === 'OK');
  comprobar('videoDetails intacto', datos.videoDetails.title === 'Un vídeo');
}

// ── 2. Anuncio metido en lo hondo del JSON ─────────────────────────────────
{
  const datos = entorno.JSON.parse(JSON.stringify({
    contents: { twoColumn: { results: { seccion: { adSlots: [1, 2], items: [{ id: 7 }] } } } },
  }));
  comprobar('un adSlots anidado también se poda',
    !('adSlots' in datos.contents.twoColumn.results.seccion));
  comprobar('y lo que había al lado sobrevive',
    datos.contents.twoColumn.results.seccion.items[0].id === 7);
}

// ── 3. JSON sin anuncios: ni se toca ───────────────────────────────────────
{
  const original = { a: 1, b: { c: [1, 2, 3] }, d: 'hola' };
  const texto = JSON.stringify(original);
  const datos = entorno.JSON.parse(texto);
  comprobar('un JSON sin anuncios sale idéntico',
    JSON.stringify(datos) === texto);
}

// ── 4. JSON.parse sigue comportándose como JSON.parse ──────────────────────
{
  comprobar('sigue interpretando tipos sueltos',
    entorno.JSON.parse('123') === 123 && entorno.JSON.parse('null') === null &&
    entorno.JSON.parse('"x"') === 'x' && entorno.JSON.parse('true') === true);

  let lanzo = false;
  try { entorno.JSON.parse('{esto no es json}'); } catch (_) { lanzo = true; }
  comprobar('un JSON roto sigue dando error (no se lo traga)', lanzo);

  comprobar('el segundo parámetro (reviver) sigue funcionando',
    entorno.JSON.parse('{"n":2}', (k, v) => (typeof v === 'number' ? v * 5 : v)).n === 10);
}

// ── 5. response.json(), el otro camino ─────────────────────────────────────
{
  const cuerpo = JSON.stringify({ adPlacements: [1], videoDetails: { videoId: 'zzz' } });
  new entorno.Response(cuerpo, { headers: { 'content-type': 'application/json' } })
    .json()
    .then((datos) => {
      comprobar('response.json() también poda', !('adPlacements' in datos));
      comprobar('y deja el resto del cuerpo', datos.videoDetails.videoId === 'zzz');
      fin();
    })
    .catch((e) => { comprobar('response.json() no revienta: ' + e, false); fin(); });
}

function fin() {
  console.log(fallos === 0 ? '\nTodo correcto' : `\n${fallos} fallo(s)`);
  process.exit(fallos === 0 ? 0 : 1);
}
