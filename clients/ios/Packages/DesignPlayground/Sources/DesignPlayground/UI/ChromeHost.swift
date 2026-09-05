import DesignSystem
import SwiftUI

/// Draws a surface inside the navigation chrome it is being reviewed in.
///
/// Every case here is a *real* system container rather than a drawing of one.
/// That is the whole reason this playground is a native app: a `NavigationStack`
/// brings its own bar, its own scroll-edge treatment and its own material, a
/// `TabView` brings a tab bar that floats over content in iOS 26, and a sheet
/// brings detents and a grabber. None of those can be approximated — they are
/// where the platform's glass comes from, and a review that draws its own
/// version of them has reviewed a picture.
struct ChromeHost<Content: View>: View {
    let chrome: Chrome
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        switch chrome {
        case .bare:
            content
        case .navigation:
            navigationStack(large: false)
        case .navigationLarge:
            navigationStack(large: true)
        case .tabbed:
            tabs { content }
        case .navigationAndTabs:
            tabs { navigationStack(large: true) }
        case .sheet:
            sheetPresentation
        }
    }

    private func navigationStack(large: Bool) -> some View {
        NavigationStack {
            content
                .navigationTitle(title)
                .playgroundTitleDisplay(large: large)
        }
    }

    /// A stand-in tab set. The second and third tabs are unreachable on
    /// purpose: what is being reviewed is how the surface sits with a tab bar
    /// over it, and a tab bar with one tab is not one the system draws the
    /// same way.
    private func tabs<Inner: View>(@ViewBuilder inner: () -> Inner) -> some View {
        TabView {
            inner()
                .tabItem { Label(title, systemImage: "square.grid.2x2") }
            Color.popsBackground
                .tabItem { Label("Second", systemImage: "circle") }
            Color.popsBackground
                .tabItem { Label("Third", systemImage: "square") }
        }
    }

    /// The surface as a sheet over a backdrop, because a sheet's height, its
    /// grabber and what shows behind it are the review — a sheet drawn on a
    /// blank screen answers none of that.
    private var sheetPresentation: some View {
        ZStack {
            Color.popsBackground.ignoresSafeArea()
            VStack(spacing: PopsSpacing.md) {
                Text("Behind the sheet")
                    .font(.popsTitle)
                    .foregroundStyle(Color.popsMutedForeground)
                ForEach(0..<6, id: \.self) { index in
                    PopsRow(title: "Row \(index + 1)", subtitle: "Content the sheet covers")
                        .padding(.horizontal, PopsSpacing.lg)
                }
            }
        }
        .sheet(isPresented: .constant(true)) {
            NavigationStack {
                content
                    .navigationTitle(title)
                    .playgroundTitleDisplay(large: false)
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
            // The sheet must not be dismissible: it is the thing being
            // reviewed, and a swipe that closed it would leave the stage
            // showing the backdrop with no way back to the surface.
            .interactiveDismissDisabled()
        }
    }
}
