import SwiftUI

/// Shows a failure whose outcome cannot change by repeating the request.
///
/// Use ``ErrorStateView`` when the caller can offer a meaningful retry action.
public struct NonRetryableErrorStateView: View {
    /// The fallback displayed when the caller supplies blank or whitespace-only copy.
    public static let fallbackMessage = ErrorStateView.fallbackMessage

    private let message: String

    /// Creates a no-action failure state with caller-owned copy.
    public init(message: String) {
        self.message = message
    }

    var resolvedMessage: String {
        StateMessage.resolve(message, fallback: Self.fallbackMessage)
    }

    public var body: some View {
        StateView(message: resolvedMessage, messageColor: .popsDestructive) {
            EmptyView()
        }
    }
}

#Preview("Non-retryable error") {
    ColorSchemePreview {
        NonRetryableErrorStateView(message: "Update the app to continue.")
    }
}
