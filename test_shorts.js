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
  props = props || {};
  const attrs = Object.assign({}, props.attrs);
  if (props.href !== undefined) attrs.href = props.href;

  const el = Object.assign({
    tagName: tag.toUpperCase(), hijos: [], parentElement: null,
    dataset: {}, oculto: false,
    style: { setProperty(k, v) { if (k === 'display' && v === 'none') el.oculto = true; } },
  }, props);
  el.getAttribute = (n) => (n in attrs ? String(attrs[n]) : null);
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

// Buscador de selectores de verdad (lo justo: etiqueta + [attr], [attr="v"],
// [attr*="v"], [attr^="v"], [attr$="v"], con la "i" de mayúsculas/minúsculas).
// El de antes miraba trozos de texto del selector y daba por buenas cosas que
// en un navegador no habrían casado.
const TROZO = /^([a-z0-9-]*)((?:\[[^\]]*\])*)$/i;
const ATRIBUTO = /\[([a-z0-9-]+)(?:([*^$]?=)"([^"]*)")?(\s+i)?\]/gi;

function casaSimple(n, sel) {
  const m = TROZO.exec(sel.trim());
  if (!m) return false;
  const [, etiqueta, attrs] = m;
  if (etiqueta && n.tagName !== etiqueta.toUpperCase()) return false;

  ATRIBUTO.lastIndex = 0;
  let a;
  while ((a = ATRIBUTO.exec(attrs || '')) !== null) {
    const [, nombre, op, valorCrudo, insensible] = a;
    let v = n.getAttribute(nombre);
    if (v === null) return false;
    if (!op) continue;                       // basta con que exista
    let esperado = valorCrudo;
    if (insensible) { v = v.toLowerCase(); esperado = esperado.toLowerCase(); }
    if (op === '=' && v !== esperado) return false;
    if (op === '*=' && !v.includes(esperado)) return false;
    if (op === '^=' && !v.startsWith(esperado)) return false;
    if (op === '$=' && !v.endsWith(esperado)) return false;
  }
  return true;
}

function casa(n, sel) {
  return sel.split(',').some(s => s.trim() && casaSimple(n, s));
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

// ── 5. El botón de Shorts de la barra de abajo, en sus cuatro formas ────────
// Es el que seguia viendose. No hay una sola forma: segun la version, YouTube
// pone el enlace relativo, entero, con parametros detras, o ni siquiera pone
// enlace y deja solo su identificador interno (FEshorts).
{
  const casos = [
    // LAS DOS PRIMERAS SON LAS DE VERDAD, copiadas del DOM de m.youtube.com:
    // el boton no es un enlace, es un div con clase y texto. Todo lo demas que
    // yo probaba antes no existia en la pagina.
    ['REAL: <div role=tab class="pivot-bar-item-tab pivot-shorts">Shorts',
      nodo('DIV', {
        attrs: { role: 'tab', class: 'pivot-bar-item-tab pivot-shorts' },
        className: 'pivot-bar-item-tab pivot-shorts', textContent: 'Shorts',
      })],
    ['REAL: la variante de resultados (clase "shorts" a secas)',
      nodo('DIV', {
        attrs: { role: 'tab', class: 'pivot-bar-item-tab shorts pivot-bar-fallback-item' },
        className: 'pivot-bar-item-tab shorts pivot-bar-fallback-item', textContent: 'Shorts',
      })],
    ['enlace relativo (/shorts)', nodo('A', { href: '/shorts' })],
    ['enlace entero (https://m.youtube.com/shorts)',
      nodo('A', { href: 'https://m.youtube.com/shorts' })],
    ['enlace con parametros (/shorts?bp=…)', nodo('A', { href: '/shorts?bp=8gYCGgA%3D' })],
    ['boton sin enlace, solo con FEshorts',
      nodo('BUTTON', { attrs: { 'tab-identifier': 'FEshorts' } })],
    ['boton etiquetado como Shorts',
      nodo('BUTTON', { attrs: { 'aria-label': 'Shorts' } })],
  ];

  for (const [desc, dentro] of casos) {
    const boton = nodo('YTM-PIVOT-BAR-ITEM-RENDERER', { hijos: [dentro] });
    const inicio = nodo('YTM-PIVOT-BAR-ITEM-RENDERER',
      { hijos: [nodo('A', { href: '/', attrs: { 'aria-label': 'Inicio' } })] });
    const barra = nodo('YTM-PIVOT-BAR', { hijos: [inicio, boton] });
    montar(nodo('HTML', { hijos: [barra] }))();
    comprobar('se va el boton de Shorts: ' + desc, boton.oculto === true);
    comprobar('  …y el resto de la barra sigue: ' + desc,
      barra.oculto === false && inicio.oculto === false);
  }
}

// ── 5b. Señuelos: llevan la palabra pero NO son Shorts ──────────────────────
{
  const trampa1 = nodo('A', { href: '/watch?v=abc&list=shorts' });
  const trampa2 = nodo('A', { href: '/results?search_query=shorts' });
  const trampa3 = nodo('A', { href: '/c/ShortsCentral' });
  const fila = nodo('DIV', { hijos: [trampa1, trampa2, trampa3] });
  montar(nodo('HTML', { hijos: [fila] }))();
  comprobar('un video con "shorts" en un parametro NO se oculta', !trampa1.oculto);
  comprobar('una busqueda de la palabra "shorts" NO se oculta', !trampa2.oculto);
  comprobar('un canal llamado ShortsCentral NO se oculta', !trampa3.oculto);
  comprobar('y la fila que los contiene tampoco', !fila.oculto);
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
