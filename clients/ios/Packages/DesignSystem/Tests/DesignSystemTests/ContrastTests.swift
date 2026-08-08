import SwiftUI
import Testing

@testable import DesignSystem

/// A palette is only plain-looking until someone cannot read it. Every
/// foreground token is checked against every surface it is allowed to sit on,
/// in both schemes, so a later colour change cannot quietly drop below the
/// WCAG AA threshold for body text.
///
/// `popsSeparator` is deliberately absent: it draws hairlines, which WCAG
/// treats as decoration rather than as a graphical object carrying meaning.
@Suite("Contrast")
internal struct ContrastTests {
    private static let minimumRatio = 4.5

    private static let surfaces: [(name: String, color: Color)] = [
        ("popsBackground", .popsBackground),
        ("popsSurface", .popsSurface),
    ]

    private static let foregrounds: [(name: String, color: Color)] = [
        ("popsForeground", .popsForeground),
        ("popsMutedForeground", .popsMutedForeground),
        ("popsAccent", .popsAccent),
        ("popsDestructive", .popsDestructive),
        ("popsSuccess", .popsSuccess),
        ("popsWarning", .popsWarning),
    ]

    private static func luminance(_ color: Color, in scheme: ColorScheme) -> Double {
        var environment = EnvironmentValues()
        environment.colorScheme = scheme
        let resolved = color.resolve(in: environment)
        return 0.2126 * Double(resolved.linearRed)
            + 0.7152 * Double(resolved.linearGreen)
            + 0.0722 * Double(resolved.linearBlue)
    }

    private static func ratio(_ foreground: Color, on background: Color, in scheme: ColorScheme)
        -> Double
    {
        let first = luminance(foreground, in: scheme)
        let second = luminance(background, in: scheme)
        return (max(first, second) + 0.05) / (min(first, second) + 0.05)
    }

    @Test(
        "body text clears WCAG AA on every surface it may sit on",
        arguments: ContrastTests.foregrounds.map(\.name), ColorScheme.allCases)
    func foregroundIsReadable(foreground name: String, scheme: ColorScheme) throws {
        let color = try #require(Self.foregrounds.first { $0.name == name }?.color)
        for surface in Self.surfaces {
            let measured = Self.ratio(color, on: surface.color, in: scheme)
            let reading = String(format: "%.2f", measured)
            #expect(
                measured >= Self.minimumRatio,
                "\(name) on \(surface.name) in \(scheme) is \(reading):1, below \(Self.minimumRatio):1"
            )
        }
    }
}
