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
    /// A stable handle for the retry control, distinct from `retryTitle` —
    /// the caller's copy is what VoiceOver reads, this is what a UI flow
    /// keys on instead. `nil` by default: most callers have nothing to
    /// distinguish this retry from any other, and an identifier nobody reads
    /// is not worth the parameter.
    private let retryAccessibilityIdentifier: String?
    let retry: () -> Void

    public init(
        message: String, retryTitle: String = ErrorStateView.fallbackRetryTitle,
        retryAccessibilityIdentifier: String? = nil,
        retry: @escaping () -> Void
    ) {
        self.message = message
        self.retryTitle = retryTitle
        self.retryAccessibilityIdentifier = retryAccessibilityIdentifier
        self.retry = retry
    }

    /// The copy this screen actually shows, after a blank or whitespace-only
    /// caller value has fallen back. Named rather than resolved inline in
    /// `body` so the fallback can be asserted as a value: proving it by
    /// rasterising the screen twice and comparing the images only works where
    /// the colour catalogue compiled, and passes for free where it did not —
    /// two placeholder-coloured canvases are equal whatever the button says.
    var resolvedMessage: String {
        StateMessage.resolve(message, fallback: Self.fallbackMessage)
    }

    /// The retry button's label, after the same fallback — see
    /// ``resolvedMessage``.
    var resolvedRetryTitle: String {
        StateMessage.resolve(retryTitle, fallback: Self.fallbackRetryTitle)
    }

    public var body: some View {
        StateView(message: resolvedMessage, messageColor: .popsDestructive) {
            PopsButton(resolvedRetryTitle, action: retry)
                .accessibilityIdentifierIfPresent(retryAccessibilityIdentifier)
        }
    }
}

extension View {
    /// `.accessibilityIdentifier(_:)` only when the caller supplied one —
    /// applying an empty identifier is not the same as applying none, and
    /// would give every caller that skips this parameter a shared, colliding
    /// identifier of `""`.
    fileprivate func accessibilityIdentifierIfPresent(_ identifier: String?) -> some View {
        modifier(OptionalAccessibilityIdentifier(identifier: identifier))
    }
}

private struct OptionalAccessibilityIdentifier: ViewModifier {
    let identifier: String?

    func body(content: Content) -> some View {
        if let identifier {
            content.accessibilityIdentifier(identifier)
        } else {
            content
        }
    }
}

#Preview("Error") {
    ColorSchemePreview {
        ErrorStateView(message: "Could not reach the server.") {}
    }
}
