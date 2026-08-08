import SwiftUI

/// A failure the user can act on. `retry` is required rather than optional: a
/// dead end is a design decision, and making it the easy default is how screens
/// end up with one.
///
/// Both `message` and `retryTitle` are caller-supplied, not baked in — see
/// "Copy" in `DesignSystem/README.md` for why the package stops at an English
/// fallback rather than owning translation itself.
public struct ErrorStateView: View {
    public static let fallbackMessage = "Something went wrong."
    public static let fallbackRetryTitle = "Retry"

    private let message: String
    private let retryTitle: String
    let retry: () -> Void

    public init(
        message: String, retryTitle: String = ErrorStateView.fallbackRetryTitle,
        retry: @escaping () -> Void
    ) {
        self.message = message
        self.retryTitle = retryTitle
        self.retry = retry
    }

    public var body: some View {
        StateView(
            message: StateMessage.resolve(message, fallback: Self.fallbackMessage),
            messageColor: .popsDestructive
        ) {
            Button(
                StateMessage.resolve(retryTitle, fallback: Self.fallbackRetryTitle), action: retry
            )
            .font(.popsHeadline)
            .foregroundStyle(Color.popsAccent)
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.vertical, PopsSpacing.sm)
            .overlay(
                RoundedRectangle(cornerRadius: PopsRadius.control)
                    .stroke(Color.popsSeparator, lineWidth: PopsBorder.hairline)
            )
        }
    }
}

#Preview("Error") {
    ColorSchemePreview {
        ErrorStateView(message: "Could not reach the server.") {}
    }
}
