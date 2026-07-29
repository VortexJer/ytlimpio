// Comprueba la regla que evita repetir el desastre de la pantalla en negro:
// al buscar la tarjeta que envuelve un Short, JAMÁS se puede subir hasta un
// contenedor que también tenga vídeos normales dentro.
//
//   node test_shorts.js
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, 'ytlimpio.user.js'), 'utf8');

let fallos = 0;
function comprobar(desc, ok) {
  console.log((ok ? 'OK   ' : 'FALLO') + '  ' + desc);
  if (!ok) fallos++;
}

// ── Mini-DOM ────────────────────────────────────────────────────────────────
function nodo(tag, props) {
  const el = Object.assign({
    tagName: tag.toUpperCase(), href: '', hijos: [], parentElement: null,
    dataset: {}, oculto: false,
    style: { setProperty(k, v) { if (k === 'display' && v === 'none') el.oculto = true; } },
  }, props || {});
  for (const h of el.hijos) h.parentElement = el;
  el.querySelectorAll = (sel) => descendientes(el).filter(n => casa(n, sel));
  el.closest = (sel) => {
    let n = el.parentElement;
    while (n) { if (casa(n, sel)) return n; n = n.parentElement; }
    return null;
  };
  return el;
}

function descendientes(raiz) {
  const out = [];
  (function rec(n) { for (const h of n.hijos) { out.push(h); rec(h); } })(raiz);
  return out;
}

function casa(n, sel) {
  // Sólo los tipos de selector que usa la función.
  if (sel.includes('/shorts/')) return n.tagName === 'A' && n.href.includes('/shorts/');
  if (sel.includes('/watch?v=')) return n.tagName === 'A' && n.href.includes('/watch?v=');
  if (sel.includes('href="/shorts"')) return n.tagName === 'A' && n.href === '/shorts';
  return sel.split(',').some(s => {
    s = s.trim().replace(/\[.*/, '');
    return s && n.tagName === s.toUpperCase();
  });
}

function montar(raiz) {
  global.document = {
    body: nodo('BODY'), documentElement: raiz,
    querySelectorAll: (sel) => descendientes(raiz).filter(n => casa(n, sel)),
  };
  const desde = src.indexOf('function quitarShorts');
  const hasta = src.indexOf('// Un Short abierto directamente');
  return new Function('document', 'QUITAR_SHORTS',
    src.slice(desde, hasta) + '; return quitarShorts;')(global.document, true);
}

const enlaceShort = (id) => nodo('A', { href: '/shorts/' + id });
const enlaceVideo = (id) => nodo('A', { href: '/watch?v=' + id });

// ── 1. Tarjeta suelta de Short, con el contenedor todavia vacio ─────────────
// Este es el caso peligroso: la seccion aun no ha cargado sus videos, asi que
// nada "avisa" de que no hay que subir. El tope de 3 niveles es lo unico que
// impide ocultar la lista entera.
{
  const enlace = enlaceShort('aaa');
  const tarjeta = nodo('YTM-SHORTS-LOCKUP', { hijos: [enlace] });
  const capa = nodo('DIV', { hijos: [tarjeta] });
  const otraCapa = nodo('DIV', { hijos: [capa] });
  const listaEntera = nodo('YTM-SECTION-LIST', { hijos: [otraCapa] });
  const raiz = nodo('HTML', { hijos: [listaEntera] });
  montar(raiz)();
  comprobar('el Short se oculta', tarjeta.oculto || capa.oculto || otraCapa.oculto);
  comprobar('NUNCA se sube hasta la lista de secciones (pantalla en negro)',
    listaEntera.oculto === false);
}

// ── 2. Estanteria de Shorts: sus tarjetas se van ────────────────────────────
{
  const tarjetas = ['a', 'b', 'c'].map(id => nodo('DIV', { hijos: [enlaceShort(id)] }));
  const estanteria = nodo('YTM-REEL-SHELF', { hijos: tarjetas });
  const seccion = nodo('SECTION', { hijos: [estanteria, nodo('DIV', { hijos: [enlaceVideo('v1')] })] });
  const raiz = nodo('HTML', { hijos: [seccion] });
  montar(raiz)();
  // Aqui la subida SI llega a la estanteria (nadie la detiene hasta la seccion,
  // que ya tiene un video normal), y ocultarla entera es justo lo que se
  // quiere: si no, quedaria el hueco vacio con su titulo "Shorts".
  comprobar('la estanteria de Shorts se oculta entera', estanteria.oculto === true);
  comprobar('la seccion que la contiene NO se toca', seccion.oculto === false);
}

// ── 3. LA TRAMPA: sección mixta (fue la pantalla en negro) ──────────────────
{
  const short = nodo('DIV', { hijos: [enlaceShort('x')] });
  const video1 = nodo('DIV', { hijos: [enlaceVideo('v1')] });
  const video2 = nodo('DIV', { hijos: [enlaceVideo('v2')] });
  const seccion = nodo('YTM-ITEM-SECTION', { hijos: [video1, short, video2] });
  const raiz = nodo('HTML', { hijos: [seccion] });
  montar(raiz)();
  comprobar('en una seccion mixta se oculta SOLO el Short', short.oculto === true);
  comprobar('la seccion del inicio sobrevive (el fallo de la pantalla negra)',
    seccion.oculto === false);
  comprobar('los videos normales siguen visibles',
    video1.oculto === false && video2.oculto === false);
}

// ── 4. Short anidado hondo dentro de una sección mixta ──────────────────────
{
  const enlace = enlaceShort('y');
  const capa3 = nodo('DIV', { hijos: [enlace] });
  const capa2 = nodo('DIV', { hijos: [capa3] });
  const capa1 = nodo('DIV', { hijos: [capa2] });
  const seccion = nodo('SECTION', { hijos: [capa1, nodo('DIV', { hijos: [enlaceVideo('v9')] })] });
  const raiz = nodo('HTML', { hijos: [seccion] });
  montar(raiz)();
  comprobar('un Short anidado sube hasta su tarjeta, no mas', capa1.oculto === true);
  comprobar('y la seccion mixta aguanta', seccion.oculto === false);
}

// ── 5. El botón de Shorts de la barra de abajo ──────────────────────────────
{
  const enlace = nodo('A', { href: '/shorts' });
  const boton = nodo('YTM-PIVOT-BAR-ITEM-RENDERER', { hijos: [enlace] });
  const barra = nodo('YTM-PIVOT-BAR', { hijos: [boton, nodo('YTM-PIVOT-BAR-ITEM-RENDERER', {}) ] });
  const raiz = nodo('HTML', { hijos: [barra] });
  montar(raiz)();
  comprobar('el boton de Shorts de la barra se oculta', boton.oculto === true);
  comprobar('la barra de navegacion NO se oculta', barra.oculto === false);
}

// ── 6. Sin Shorts, no se toca nada ──────────────────────────────────────────
{
  const video = nodo('DIV', { hijos: [enlaceVideo('v1')] });
  const seccion = nodo('SECTION', { hijos: [video] });
  const raiz = nodo('HTML', { hijos: [seccion] });
  montar(raiz)();
  comprobar('una pagina sin Shorts queda intacta',
    !video.oculto && !seccion.oculto);
}

console.log(fallos === 0 ? '\nTodo correcto' : `\n${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
