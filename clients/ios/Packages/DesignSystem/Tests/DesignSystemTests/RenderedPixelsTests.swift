import DesignSystemTestSupport
import Foundation
import SwiftUI
import Testing

@testable import DesignSystem

/// The tolerance is only honest if it forgives exactly the noise
/// `ImageRenderer` was measured to produce and nothing a real difference is
/// made of. Each boundary is tested from both sides.
@Suite("Rendered pixel comparison")
@MainActor
internal struct RenderedPixelsTests {
    private static let canvas = Data(repeating: 128, count: 1024)

    private static func perturbing(
        _ data: Data, at offsets: [Int], by delta: Int
    ) -> Data {
        var changed = data
        for offset in offsets {
            changed[offset] = UInt8(Int(changed[offset]) + delta)
        }
        return changed
    }

    @Test("identical bytes draw the same")
    func identicalBytesMatch() {
        #expect(RenderedPixels.drawTheSame(Self.canvas, Self.canvas))
    }

    @Test("anti-aliasing noise at the tolerance draws the same, in either direction")
    func noiseWithinToleranceMatches() {
        let brighter = Self.perturbing(
            Self.canvas, at: Array(0..<14), by: RenderedPixels.noiseTolerance)
        let darker = Self.perturbing(
            Self.canvas, at: Array(500..<514), by: -RenderedPixels.noiseTolerance)

        #expect(RenderedPixels.drawTheSame(Self.canvas, brighter))
        #expect(RenderedPixels.drawTheSame(darker, Self.canvas))
    }

    @Test("a single byte one level past the tolerance does not draw the same")
    func oneByteBeyondToleranceDiffers() {
        let changed = Self.perturbing(
            Self.canvas, at: [700], by: RenderedPixels.noiseTolerance + 1)

        #expect(!RenderedPixels.drawTheSame(Self.canvas, changed))
        #expect(!RenderedPixels.drawTheSame(changed, Self.canvas))
    }

    /// A wider and a narrower image can agree on every byte they share.
    @Test("renders of different sizes do not draw the same")
    func differentSizesDiffer() {
        #expect(!RenderedPixels.drawTheSame(Self.canvas, Self.canvas.prefix(512)))
        #expect(!RenderedPixels.drawTheSame(Data(), Self.canvas))
    }

    /// The claim the tolerance is not allowed to break: a view swapped from
    /// light to dark is still a different picture, so a determinism check
    /// using this still fails when a scheme leaks between two renders.
    @Test(
        "a light render and a dark render of one view do not draw the same",
        .requiresCompiledColorCatalog)
    func lightAndDarkStillDiffer() throws {
        let view = PopsButton("Pair") {}
        let light = try #require(PrimitiveRenderingTests.render(view, in: .light))
        let dark = try #require(PrimitiveRenderingTests.render(view, in: .dark))

        #expect(!RenderedPixels.drawTheSame(light, dark))
    }
}
