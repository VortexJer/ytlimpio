import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let ventana = UIWindow(frame: UIScreen.main.bounds)
        ventana.rootViewController = YouTubeViewController()
        ventana.backgroundColor = .black
        ventana.makeKeyAndVisible()
        window = ventana
        return true
    }
}
