import DesignSystemTestSupport
import SwiftUI
import Testing

@testable import FeatureTrips

@Suite("Trip journey endpoint layout")
@MainActor
internal struct TripsJourneyLayoutTests {
    @Test("accessibility sizes stack full endpoint facts instead of squeezing two columns")
    internal func accessibilityLayout() {
        #expect(!TripsJourneyLegView.stacksEndpoints(at: .large))
        #expect(!TripsJourneyLegView.stacksEndpoints(at: .xxxLarge))
        for size in [
            DynamicTypeSize.accessibility1, .accessibility2, .accessibility3,
            .accessibility4, .accessibility5,
        ] {
            #expect(TripsJourneyLegView.stacksEndpoints(at: size))
        }
    }

    @Test(
        "the actual endpoint view grows vertically at the largest text size",
        .comparisonSurvivesAnUncompiledCatalog)
    internal func endpointHeightGrows() throws {
        let snapshot = try TripTestSources.snapshot()
        let leg = try #require(snapshot.journeys.first?.legs.first)
        let regular = ImageRenderer(
            content: TripsJourneyLegView(leg: leg, places: snapshot.places)
                .environment(\.dynamicTypeSize, .large)
                .frame(width: 320, alignment: .leading))
        let accessible = ImageRenderer(
            content: TripsJourneyLegView(leg: leg, places: snapshot.places)
                .environment(\.dynamicTypeSize, .accessibility5)
                .frame(width: 320, alignment: .leading))
        regular.scale = 1
        accessible.scale = 1
        let regularImage = try #require(regular.cgImage)
        let accessibleImage = try #require(accessible.cgImage)
        #expect(regularImage.width == 320)
        #expect(accessibleImage.width == 320)
        #expect(accessibleImage.height != regularImage.height)
        #expect(accessibleImage.height > regularImage.height)
    }
}
