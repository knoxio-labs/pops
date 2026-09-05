import SwiftUI

/// The playground's own root.
///
/// Four tabs and no state above them, because the playground holds nothing:
/// there is no session, no cache and nothing to restore, so a tab is only ever
/// showing the catalogue as it was compiled.
public struct PlaygroundRootView: View {
    public init() {}

    public var body: some View {
        TabView {
            SurfaceBrowser()
                .tabItem { Label("Screens", systemImage: "iphone") }
            ComponentBrowser()
                .tabItem { Label("Components", systemImage: "square.on.square") }
            ExperimentBrowser()
                .tabItem { Label("Experiments", systemImage: "arrow.trianglehead.branch") }
            TokensView()
                .tabItem { Label("Tokens", systemImage: "paintpalette") }
        }
    }
}
