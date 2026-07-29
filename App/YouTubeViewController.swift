import UIKit
import WebKit
import AVFoundation

/// La app entera: un WKWebView a pantalla completa con YouTube dentro y el
/// script de bloqueo inyectado antes de que cargue nada.
///
/// La clave de que esto funcione es `WKUserScript` con `.atDocumentStart`:
/// es el equivalente exacto de un content script de extensión, corre en el
/// contexto de la página y llega antes que el reproductor. Sin eso no habría
/// forma de podar los anuncios.
final class YouTubeViewController: UIViewController {

    private var webView: WKWebView!
    private let inicio = URL(string: "https://m.youtube.com/")!
    private let refresco = UIRefreshControl()

    // MARK: - Ciclo de vida

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        configurarAudio()
        montarWebView()
        webView.load(URLRequest(url: inicio))
    }

    /// Sin esto, el audio se corta en cuanto sales de la app o bloqueas la
    /// pantalla. Con esto aguanta en muchos casos — no en todos: Apple no da
    /// garantías para el audio de un WebView en segundo plano.
    private func configurarAudio() {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            NSLog("[YTLimpio] no se pudo preparar el audio: \(error.localizedDescription)")
        }
    }

    // MARK: - WebView

    private func montarWebView() {
        let config = WKWebViewConfiguration()

        // Vídeo en la propia página y sin exigir un toque para empezar.
        config.allowsInlineMediaPlayback = true
        config.allowsPictureInPictureMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        // El bloqueo, inyectado en TODOS los frames al empezar el documento.
        if let script = cargarScript() {
            config.userContentController.addUserScript(
                WKUserScript(source: script,
                             injectionTime: .atDocumentStart,
                             forMainFrameOnly: false))
        }

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true   // deslizar para volver
        webView.scrollView.backgroundColor = .black
        webView.backgroundColor = .black
        webView.isOpaque = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never

        // Tirar hacia abajo para recargar, como en la app.
        refresco.tintColor = .white
        refresco.addTarget(self, action: #selector(recargar), for: .valueChanged)
        webView.scrollView.refreshControl = refresco

        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])

        aplicarReglasDeRed(a: config)
    }

    /// El script es el MISMO fichero que sirve como userscript de Safari, para
    /// no tener dos copias que se separen con el tiempo.
    private func cargarScript() -> String? {
        guard let url = Bundle.main.url(forResource: "ytlimpio.user", withExtension: "js"),
              let texto = try? String(contentsOf: url, encoding: .utf8) else {
            NSLog("[YTLimpio] falta ytlimpio.user.js en el bundle")
            return nil
        }
        return texto
    }

    /// Capa de red, el equivalente de las reglas de la extensión. Se compila
    /// una vez y Safari la guarda; si falla, la app sigue funcionando con la
    /// poda del script, que es la que de verdad quita los anuncios de vídeo.
    private func aplicarReglasDeRed(a config: WKWebViewConfiguration) {
        guard let url = Bundle.main.url(forResource: "bloqueo", withExtension: "json"),
              let json = try? String(contentsOf: url, encoding: .utf8) else { return }

        WKContentRuleListStore.default()?.compileContentRuleList(
            forIdentifier: "ytlimpio-bloqueo", encodedContentRuleList: json
        ) { lista, error in
            if let error = error {
                NSLog("[YTLimpio] reglas no compiladas: \(error.localizedDescription)")
                return
            }
            if let lista = lista {
                config.userContentController.add(lista)
            }
        }
    }

    @objc private func recargar() {
        webView.reload()
    }

    // Barra de estado en claro: YouTube va oscuro.
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    /// Volver atrás con el gesto del sistema aunque el historial sea de la web.
    func puedeVolver() -> Bool { webView.canGoBack }
    func volver() { if webView.canGoBack { webView.goBack() } }
}

// MARK: - Navegación

extension YouTubeViewController: WKNavigationDelegate {

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {

        guard let url = navigationAction.request.url else {
            decisionHandler(.allow); return
        }

        // Todo lo de YouTube y de la cuenta de Google se queda dentro de la app;
        // un enlace de la descripción a otra web se abre en Safari, que es lo
        // que uno espera y evita quedarse encerrado en una página cualquiera.
        let host = url.host?.lowercased() ?? ""
        let esDeCasa = host.hasSuffix("youtube.com") || host.hasSuffix("youtu.be")
            || host.hasSuffix("google.com") || host.hasSuffix("googleapis.com")
            || host.hasSuffix("gstatic.com") || host.hasSuffix("ggpht.com")
            || host.hasSuffix("googlevideo.com") || host.hasSuffix("googleusercontent.com")

        if navigationAction.navigationType == .linkActivated && !esDeCasa {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }

        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        refresco.endRefreshing()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        refresco.endRefreshing()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!,
                 withError error: Error) {
        refresco.endRefreshing()
    }
}

// MARK: - Ventanas nuevas

extension YouTubeViewController: WKUIDelegate {

    /// Un target="_blank" abriría una ventana que en esta app no existe: se
    /// carga en la misma vista para que el enlace no parezca muerto.
    func webView(_ webView: WKWebView,
                 createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
            webView.load(URLRequest(url: url))
        }
        return nil
    }
}
