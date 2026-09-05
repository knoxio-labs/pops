import SwiftUI

/// Which appearance the stage renders in.
///
/// Applied with `.environment(\.colorScheme,)` rather than
/// `.preferredColorScheme`, which reaches the whole window: the point is to
/// flip the *surface* while the playground's own chrome stays where the
/// reader put it, and to be able to see both at once on a wide device.
///
/// ``system`` is the default and is an *absence* of an override rather than a
/// third value to apply — a surface opened without touching this control is
/// drawn in whatever the device is set to, which is the only setting under
/// which what a reviewer sees is what a user would see.
public enum Appearance: String, CaseIterable, Identifiable, Sendable {
    case system
    case light
    case dark

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .system: "System"
        case .light: "Light"
        case .dark: "Dark"
        }
    }

    public var symbol: String {
        switch self {
        case .system: "iphone"
        case .light: "sun.max"
        case .dark: "moon"
        }
    }

    /// `nil` for ``system``, which is what makes it an absence: the stage
    /// applies no `colorScheme` at all and the surface inherits the device's.
    public var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
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
