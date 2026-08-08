import SwiftUI

/// A failure the user can act on. `retry` is required rather than optional: a
/// dead end is a design decision, and making it the easy default is how screens
/// end up with one.
public struct ErrorStateView: View {
    public static let fallbackMessage = "Something went wrong."
    public static let retryTitle = "Retry"

    private let message: String
    let retry: () -> Void

    public init(message: String, retry: @escaping () -> Void) {
        self.message = message
        self.retry = retry
    }

    public var body: some View {
        StateView(
            message: StateMessage.resolve(message, fallback: Self.fallbackMessage),
            messageColor: .popsDestructive
        ) {
            Button(Self.retryTitle, action: retry)
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
