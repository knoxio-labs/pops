import SwiftUI

/// The one spinner. A feature that rolls its own is a feature whose loading
/// state will not follow the next redesign.
public struct LoadingStateView: View {
    private let message: String

    public init(message: String = "Loading…") {
        self.message = message
    }

    public var body: some View {
        StateView(message: StateMessage.resolve(message, fallback: Self.fallbackMessage),
                  messageColor: .popsMutedForeground) {
            ProgressView()
                .tint(.popsAccent)
        }
        .accessibilityElement(children: .combine)
    }

    static let fallbackMessage = "Loading…"
}

#Preview("Loading") {
    ColorSchemePreview {
        LoadingStateView()
    }
}
