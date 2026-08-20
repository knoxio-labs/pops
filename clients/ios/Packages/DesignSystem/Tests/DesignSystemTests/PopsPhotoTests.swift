import DesignSystemTestSupport
import Foundation
import SwiftUI
import Testing

@testable import DesignSystem

/// Which bytes are a picture and which are a placeholder, asked as a value.
///
/// The render comparison next door proves the two draw differently; it can
/// only do that where the colour catalogue compiled, because a placeholder
/// drawn entirely in unresolved tokens is a blank canvas. This asks the same
/// question with no renderer at all, so it answers on every lane — and it is
/// the question that actually decides which branch `body` takes.
@Suite("PopsPhoto")
internal struct PopsPhotoTests {
    @Test("no bytes at all is a placeholder")
    func noDataIsAPlaceholder() {
        #expect(!PopsPhoto.isDecodable(nil))
    }

    /// Distinct from `nil` on the wire and identical in meaning here: a
    /// zero-length body is a capture that produced nothing, not a picture of
    /// nothing.
    @Test("an empty body is a placeholder")
    func emptyDataIsAPlaceholder() {
        #expect(!PopsPhoto.isDecodable(Data()))
    }

    /// The case that must not crash: bytes arrive from a camera, a paste
    /// buffer and a server, and only some of those are pictures.
    @Test("bytes no decoder recognises are a placeholder, not a failure")
    func undecodableDataIsAPlaceholder() {
        #expect(!PopsPhoto.isDecodable(Data("this is not an image".utf8)))
    }

    @Test("a real image decodes")
    func aRealImageDecodes() throws {
        let png = try #require(PopsTestImage.pngData(), "the fixture image could not be encoded")

        #expect(PopsPhoto.isDecodable(png))
    }
}

/// The vocabulary of status glyphs, asserted as values.
///
/// A tone that shared another's colour or symbol would draw two situations as
/// one picture, which is the failure `PopsStatusHeader` exists to prevent —
/// and unlike the render comparison this holds on every lane.
@Suite("Status tones")
internal struct PopsStatusToneTests {
    @Test("every tone names a symbol")
    func everyToneHasASymbol() {
        for tone in PopsStatusHeader.Tone.allCases {
            #expect(!tone.symbolName.isEmpty, "\(tone) draws no glyph")
        }
    }

    @Test("no two tones share a symbol")
    func symbolsAreDistinct() {
        let symbols = PopsStatusHeader.Tone.allCases.map(\.symbolName)

        #expect(Set(symbols).count == symbols.count)
    }

    /// Gated for the reason `ColorTokenTests` is gated whole: where
    /// `Colors.xcassets` was copied without being compiled every token
    /// resolves to the same placeholder, so this would report four identical
    /// tones and be describing the build system rather than the palette.
    @Test(
        "no two tones share a colour", .requiresCompiledColorCatalog,
        arguments: ColorScheme.allCases)
    func colorsAreDistinct(scheme: ColorScheme) {
        var environment = EnvironmentValues()
        environment.colorScheme = scheme
        let tones = PopsStatusHeader.Tone.allCases
        let resolved = tones.map { $0.color.resolve(in: environment) }

        for first in tones.indices {
            for second in tones.indices where second > first {
                #expect(
                    resolved[first] != resolved[second],
                    "\(tones[first]) and \(tones[second]) resolve to the same colour in \(scheme)")
            }
        }
    }
}
