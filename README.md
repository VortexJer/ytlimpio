# YT Limpio

YouTube en el iPhone **sin anuncios y sin Shorts**, con icono propio y a pantalla
completa. Por dentro es una app mínima: un `WKWebView` cargando la web de
YouTube con un script inyectado antes de que arranque el reproductor — el mismo
truco que usa una extensión de navegador, que en iOS no se puede usar de otra
forma.

No hace falta Mac: la app la compila GitHub en la nube.

## Qué hace

- **Anuncios de vídeo**: las claves de anuncio (`adPlacements`, `adSlots`,
  `playerAds`) se borran de los datos del reproductor antes de que los lea,
  tanto en el primer vídeo como en los siguientes. Nunca se bloquea la petición:
  eso deja el reproductor colgado.
- **Shorts**: fuera las estanterías del inicio y de la búsqueda, y fuera el
  botón de la barra inferior. Si abres un enlace de un Short, se convierte en un
  vídeo normal, con sus controles y sin carrusel infinito.
- **Anuncios que se cuelan** (los cosidos al vídeo): se pulsa «Saltar» en cuanto
  aparece y, mientras tanto, se silencia y se acelera.
- **El aviso de «usas un bloqueador»**: se retira y se reanuda el vídeo. No se
  pulsa ninguno de sus botones — ni «permitir anuncios» ni «probar Premium»:
  eso lo decides tú.
- **Rastreadores** de terceros, por reglas de red (`bloqueo.json`).

## Cómo instalarlo

### 1. Bajar la app ya compilada

En este repositorio, pestaña **Actions** → la última ejecución en verde →
abajo del todo, **Artifacts** → `YTLimpio-ipa`. Se descarga un ZIP; ábrelo y
saca el `YTLimpio.ipa`.

### 2. Meterlo en el iPhone desde Windows

1. Instala **[Sideloadly](https://sideloadly.io)** (gratis) y, si no lo tienes,
   **Apple Devices** o iTunes, que es de donde salen los drivers del teléfono.
2. Conecta el iPhone por cable y acepta **Confiar** en el teléfono.
3. Abre Sideloadly, arrastra el `YTLimpio.ipa`, escribe tu **Apple ID** y dale
   a *Start*. Te pedirá la contraseña; si tienes verificación en dos pasos,
   genera una [contraseña específica de app](https://account.apple.com) en tu
   cuenta de Apple y usa esa.
4. En el iPhone: **Ajustes → General → VPN y gestión de dispositivos** → toca tu
   Apple ID y dale a **Confiar**.
5. Ya tienes el icono en la pantalla de inicio.

### 3. Lo que hay que saber

Con una cuenta de Apple gratuita, una app instalada así **caduca a los 7 días**
y hay que repetir el paso 2 (son dos minutos). Si te cansa, **AltStore** hace lo
mismo y la renueva sola por wifi mientras el PC esté encendido. También hay un
límite de 3 apps instaladas de esta forma a la vez.

## Si quieres cambiar algo

- **Volver a ver los Shorts**: en `ytlimpio.user.js`, pon `QUITAR_SHORTS = false`.
- **Que abra la web de escritorio**: cambia `m.youtube.com` por `www.youtube.com`
  en `App/YouTubeViewController.swift`.
- **Cambiar el nombre o el icono**: `CFBundleDisplayName` en `App/Info.plist` y
  el PNG de `App/Assets.xcassets/AppIcon.appiconset/`.

Cualquier cambio que subas dispara una compilación nueva: vuelve al paso 1.

## El mismo script, en Safari

`ytlimpio.user.js` es JavaScript puro, sin nada específico de la app. Sirve tal
cual como *userscript* en Safari con la app gratuita **Userscripts** de la App
Store, por si algún día prefieres eso a instalar la app.

## Limitaciones honestas

- El audio con la pantalla apagada funciona *a veces*: Apple no da garantías
  para el audio de un WebView en segundo plano.
- No descarga vídeos y no hay integración con CarPlay ni con el Apple Watch.
- Va tan fluido como la web de YouTube en Safari, que es el mismo motor — pero
  no es la app nativa.
- Usar un cliente propio que quita los anuncios va contra los términos de
  YouTube. Es tu decisión y tu cuenta.
