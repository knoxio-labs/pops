import DesignSystem
import SwiftUI

extension View {
    /// The conditions the surface is being reviewed under.
    ///
    /// Applied to the chrome and the surface together — a dark review wants a
    /// dark navigation bar — and deliberately *not* to the inspector, which
    /// has to stay readable while it is being used to look at AX5 in dark.
    /// `colorScheme` is applied only when the reader has chosen one, which is
    /// why ``Appearance/system`` is a branch rather than a value passed
    /// through: writing the device's current scheme back into the environment
    /// looks identical until the device changes appearance under a stage that
    /// has quietly pinned the old one.
    @ViewBuilder
    func surfaceEnvironment(_ settings: StageSettings) -> some View {
        let sized = environment(\.dynamicTypeSize, settings.typeSize)
            .environment(\.layoutDirection, settings.rightToLeft ? .rightToLeft : .leftToRight)
        if let scheme = settings.appearance.colorScheme {
            sized.environment(\.colorScheme, scheme)
        } else {
            sized
        }
    }
}

/// Draws a surface inside the navigation chrome it is being reviewed in, with
/// the playground's own inspector placed where that chrome allows.
///
/// Every case here is a *real* system container rather than a drawing of one.
/// That is the whole reason this playground is a native app: a `NavigationStack`
/// brings its own bar, its own scroll-edge treatment and its own material, a
/// `TabView` brings a tab bar that floats over content in iOS 26, and a sheet
/// brings detents and a grabber. None of those can be approximated — they are
/// where the platform's glass comes from, and a review that draws its own
/// version of them has reviewed a picture.
internal struct ChromeHost<Content: View, Inspector: View>: View {
    let settings: StageSettings
    let title: String
    /// What the sheet is presented over, when the surface supplies one.
    let backdrop: (@MainActor () -> AnyView)?
    @ViewBuilder let content: Content
    /// Placed by the chrome rather than over it. A `.sheet` is a system
    /// presentation and renders above everything in the presenting view's
    /// `ZStack`, so an inspector overlaid on the stage is simply unreachable
    /// behind one — under that chrome it has to go inside the sheet.
    @ViewBuilder let inspector: Inspector

    private var chrome: Chrome { settings.chrome }

    var body: some View {
        switch chrome {
        case .bare:
            overlaid { content }
        case .navigation:
            overlaid { navigationStack(large: false) }
        case .navigationLarge:
            overlaid { navigationStack(large: true) }
        case .tabbed:
            overlaid { tabs { content } }
        case .navigationAndTabs:
            overlaid { tabs { navigationStack(large: true) } }
        case .sheet:
            sheetPresentation
        }
    }

    /// The ordinary placement: the inspector floats over the whole stage, and
    /// only what is under it carries the review conditions.
    private func overlaid<Inner: View>(@ViewBuilder inner: () -> Inner) -> some View {
        ZStack(alignment: .bottom) {
            inner().surfaceEnvironment(settings)
            inspector
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
            if let backdrop {
                backdrop()
            } else {
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
        }
        .surfaceEnvironment(settings)
        .sheet(isPresented: .constant(true)) {
            ZStack(alignment: .bottom) {
                NavigationStack {
                    content
                        .navigationTitle(title)
                        .playgroundTitleDisplay(large: false)
                }
                .surfaceEnvironment(settings)
                inspector
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
