import SwiftUI

/// The one spinner. A feature that rolls its own is a feature whose loading
/// state will not follow the next redesign.
///
/// `message` is caller-supplied, not baked in — see "Copy" in
/// `DesignSystem/README.md` for why the package stops at an English fallback
/// rather than owning translation itself.
public struct LoadingStateView: View {
    public static let fallbackMessage = "Loading…"

    private let message: String

    public init(message: String = LoadingStateView.fallbackMessage) {
        self.message = message
    }

    public var body: some View {
        StateView(
            message: StateMessage.resolve(message, fallback: Self.fallbackMessage),
            messageColor: .popsMutedForeground
        ) {
            ProgressView()
                .tint(.popsAccent)
        }
        .accessibilityElement(children: .combine)
    }
}

#Preview("Loading") {
    ColorSchemePreview {
        LoadingStateView()
    }
}
