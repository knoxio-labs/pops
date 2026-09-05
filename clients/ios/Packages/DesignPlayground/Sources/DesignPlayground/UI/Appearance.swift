import SwiftUI

/// Which appearance the stage renders in.
///
/// Applied with `.environment(\.colorScheme,)` rather than
/// `.preferredColorScheme`, which reaches the whole window: the point is to
/// flip the *surface* while the playground's own chrome stays where the
/// reader put it, and to be able to see both at once on a wide device.
public enum Appearance: String, CaseIterable, Identifiable, Sendable {
    case light
    case dark

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .light: "Light"
        case .dark: "Dark"
        }
    }

    public var symbol: String {
        switch self {
        case .light: "sun.max"
        case .dark: "moon"
        }
    }

    public var colorScheme: ColorScheme {
        switch self {
        case .light: .light
        case .dark: .dark
        }
    }

    public var flipped: Appearance {
        switch self {
        case .light: .dark
        case .dark: .light
        }
    }
}

extension DynamicTypeSize {
    /// A short label for the inspector's slider. `DynamicTypeSize` has no
    /// display name of its own, and "AX3" is what the Settings screen calls
    /// the size a reader would recognise.
    var playgroundLabel: String {
        switch self {
        case .xSmall: "XS"
        case .small: "S"
        case .medium: "M"
        case .large: "L"
        case .xLarge: "XL"
        case .xxLarge: "2XL"
        case .xxxLarge: "3XL"
        case .accessibility1: "AX1"
        case .accessibility2: "AX2"
        case .accessibility3: "AX3"
        case .accessibility4: "AX4"
        case .accessibility5: "AX5"
        @unknown default: "?"
        }
    }

    /// The system default, and what a surface opens at.
    static let playgroundDefault: DynamicTypeSize = .large
}
