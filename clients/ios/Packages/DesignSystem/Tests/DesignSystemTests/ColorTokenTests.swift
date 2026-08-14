import DesignSystemTestSupport
import SwiftUI
import Testing

@testable import DesignSystem

/// Asset-catalogue lookup is by string and fails soft: a misspelled or missing
/// colorset still renders, it just renders the same colour in both schemes.
/// Resolving each token under both colour schemes is therefore the only thing
/// that distinguishes "wired up" from "silently broken".
@Suite("Colour tokens", .requiresCompiledColorCatalog)
internal struct ColorTokenTests {
    private static let tokens: [(name: String, color: Color)] = [
        ("popsBackground", .popsBackground),
        ("popsSurface", .popsSurface),
        ("popsForeground", .popsForeground),
        ("popsMutedForeground", .popsMutedForeground),
        ("popsSeparator", .popsSeparator),
        ("popsAccent", .popsAccent),
        ("popsDestructive", .popsDestructive),
        ("popsSuccess", .popsSuccess),
        ("popsWarning", .popsWarning),
    ]

    private static func resolved(_ color: Color, in scheme: ColorScheme) -> Color.Resolved {
        var environment = EnvironmentValues()
        environment.colorScheme = scheme
        return color.resolve(in: environment)
    }

    @Test(
        "every token carries a distinct light and dark variant",
        arguments: ColorTokenTests.tokens.map(\.name))
    func tokenVariesByColorScheme(name: String) throws {
        let color = try #require(Self.tokens.first { $0.name == name }?.color)
        #expect(
            Self.resolved(color, in: .light) != Self.resolved(color, in: .dark),
            """
            \(name) resolves identically in light and dark — its colorset is \
            missing, misnamed, or has no dark appearance
            """
        )
    }

    @Test("tokens are distinct from one another within a scheme")
    func tokensAreDistinct() {
        for scheme in ColorScheme.allCases {
            let resolvedTokens = Self.tokens.map {
                (name: $0.name, value: Self.resolved($0.color, in: scheme))
            }
            for (index, token) in resolvedTokens.enumerated() {
                for other in resolvedTokens[(index + 1)...] where token.value == other.value {
                    Issue.record(
                        "\(token.name) and \(other.name) resolve to the same colour in \(scheme)")
                }
            }
        }
    }
}
