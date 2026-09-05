import DesignSystem
import SwiftUI

/// One surface, drawn under its chrome, with the inspector over it.
///
/// Presented as a full-screen cover rather than pushed, and that is a
/// correctness matter rather than a preference: most chromes here build their
/// own `NavigationStack`, and a stack inside the browser's stack means the
/// inner one wins while the outer one silently does nothing — the same trap
/// `ContentView` documents in the app itself.
struct StageView: View {
    let surface: DesignSurface
    @State private var settings: StageSettings
    @State private var inspectorExpanded = false
    @Environment(\.dismiss) private var dismiss

    init(surface: DesignSurface) {
        self.surface = surface
        _settings = State(
            initialValue: StageSettings(
                stateID: surface.openingState?.id ?? "default",
                chrome: surface.chrome
            )
        )
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            stage
            InspectorView(
                surface: surface,
                settings: $settings,
                expanded: $inspectorExpanded,
                onClose: { dismiss() }
            )
            // Starts clear of a tab bar when the chrome draws one. Only a
            // starting point — what else sits at that edge (on iPhone, iOS 26
            // puts the search field there too) is the drag's job.
            .padding(.bottom, settings.chrome.showsTabBar ? 58 : 0)
        }
        .background(Color.popsBackground)
    }

    /// The surface itself. Every override is applied here rather than on the
    /// whole cover so the inspector keeps the reader's own appearance and text
    /// size — an inspector rendered at AX5 in dark, because the surface is,
    /// would be unusable at exactly the sizes it is there to explore.
    private var stage: some View {
        ChromeHost(chrome: settings.chrome, title: surface.title) {
            currentState
        }
        .environment(\.colorScheme, settings.appearance.colorScheme)
        .environment(\.dynamicTypeSize, settings.typeSize)
        .environment(\.layoutDirection, settings.rightToLeft ? .rightToLeft : .leftToRight)
        // Keyed on everything that changes the tree's shape. `NavigationStack`
        // and `TabView` keep internal state that outlives a swap between them,
        // and a surface that came back with the previous chrome's scroll
        // offset would read as a layout bug in the design rather than in this.
        .id(stageIdentity)
    }

    private var stageIdentity: String {
        "\(settings.stateID)|\(settings.chrome.rawValue)|\(settings.rightToLeft)"
    }

    @ViewBuilder private var currentState: some View {
        if let state = surface.state(id: settings.stateID) ?? surface.openingState {
            state.build()
        } else {
            // A surface with no states is a contract error rather than a
            // crash, for the same reason the web registry lists a malformed
            // screen in the sidebar instead of failing to boot.
            ErrorStateView(message: "This surface declares no states.", retryTitle: "Close") {
                dismiss()
            }
        }
    }
}
