import SwiftUI

/// Shown when a request succeeded and returned nothing. Distinct from
/// `ErrorStateView` on purpose: "no results" and "the call failed" read the
/// same to a user only when a screen conflates them.
public struct EmptyStateView: View {
    private let message: String

    public init(message: String) {
        self.message = message
    }

    public var body: some View {
        StateView(message: StateMessage.resolve(message, fallback: Self.fallbackMessage),
                  messageColor: .popsMutedForeground) {
            EmptyView()
        }
    }

    static let fallbackMessage = "Nothing here yet."
}

#Preview("Empty") {
    ColorSchemePreview {
        EmptyStateView(message: "No transactions in this period.")
    }
}
