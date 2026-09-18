import CoreGraphics
import Foundation
import Testing

@testable import DesignSystem

@Suite("Shimmer")
internal struct PopsShimmerTests {
    @Test(
        "the phase stays inside one sweep, before the reference date too",
        arguments: [-1_000_000.3, -0.7, 0, 0.7, 1.4, 123_456.789])
    func phaseIsBounded(seconds: TimeInterval) {
        let phase = PopsShimmer.phase(at: Date(timeIntervalSinceReferenceDate: seconds))
        #expect(phase >= 0)
        #expect(phase < 1)
    }

    @Test("the phase moves with time and repeats every period")
    func phaseAdvancesAndRepeats() {
        let start = Date(timeIntervalSinceReferenceDate: 10 * PopsShimmer.period)
        let half = start.addingTimeInterval(PopsShimmer.period / 2)
        let next = start.addingTimeInterval(PopsShimmer.period)

        #expect(abs(PopsShimmer.phase(at: half) - PopsShimmer.phase(at: start) - 0.5) < 0.001)
        #expect(abs(PopsShimmer.phase(at: next) - PopsShimmer.phase(at: start)) < 0.001)
    }

    @Test("the band starts wholly before the leading edge and ends wholly past the trailing one")
    func bandCrossesTheWholeWidth() {
        let width: CGFloat = 300
        let band = width * PopsShimmer.bandFraction

        #expect(PopsShimmer.offset(phase: 0, width: width) + band == 0)
        #expect(PopsShimmer.offset(phase: 1, width: width) == width)
        #expect(PopsShimmer.offset(phase: 0.5, width: width) > -band)
        #expect(PopsShimmer.offset(phase: 0.5, width: width) < width)
    }
}
