import SwiftUI

/// Semantic colour tokens. Each name says what the colour is *for*, never what
/// it looks like, so a redesign is a change to `Resources/Colors.xcassets` and
/// nothing else. The catalogue is also the only place light and dark diverge —
/// no call site branches on `colorScheme`.
extension Color {
    /// The base surface a screen sits on.
    public static let popsBackground = Color(popsToken: "popsBackground")

    /// A raised surface layered over `popsBackground` — cards, grouped rows.
    public static let popsSurface = Color(popsToken: "popsSurface")

    /// Primary text and iconography.
    public static let popsForeground = Color(popsToken: "popsForeground")

    /// Supporting text: subtitles, captions, placeholder copy.
    public static let popsMutedForeground = Color(popsToken: "popsMutedForeground")

    /// Hairline rules and container borders.
    public static let popsSeparator = Color(popsToken: "popsSeparator")

    /// Interactive emphasis — links, selection, the primary action.
    public static let popsAccent = Color(popsToken: "popsAccent")

    /// Failure, and destructive actions the user cannot undo.
    public static let popsDestructive = Color(popsToken: "popsDestructive")

    /// A completed or healthy outcome.
    public static let popsSuccess = Color(popsToken: "popsSuccess")

    /// A degraded outcome that has not failed.
    public static let popsWarning = Color(popsToken: "popsWarning")
}

extension Color {
    /// Asset-catalogue lookup is name-based and fails soft — a typo yields a
    /// colour that renders but is identical in both schemes, which is what
    /// `ColorTokenTests` detects.
    fileprivate init(popsToken name: String) {
        self.init(name, bundle: .module)
    }
}
