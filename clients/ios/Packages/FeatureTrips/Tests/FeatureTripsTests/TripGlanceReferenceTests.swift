import AppCore
import DesignSystemTestSupport
import Foundation
import SwiftUI
import Testing

@testable import FeatureTrips

@Suite("Current trip glance references")
@MainActor
internal struct TripGlanceReferenceTests {
    @Test("glance hides references while the full card retains them", .requiresCompiledColorCatalog)
    internal func referenceDisclosure() throws {
        let first = try source(reference: "REFERENCE-AAAA")
        let second = try source(reference: "REFERENCE-ZZZZ")
        let firstGlance = try render(first, isCurrent: true)
        let secondGlance = try render(second, isCurrent: true)
        let firstFull = try render(first, isCurrent: false)
        let secondFull = try render(second, isCurrent: false)
        #expect(RenderedPixels.drawTheSame(firstGlance, secondGlance))
        #expect(!RenderedPixels.drawTheSame(firstFull, secondFull))
    }

    private func source(reference: String) throws -> TripSource {
        let snapshot = try TripTestSources.snapshot()
        let stay = try #require(snapshot.stays.first)
        return .stay(
            TripStay(
                id: stay.id, tripId: stay.tripId, visitId: stay.visitId, name: stay.name,
                kind: stay.kind,
                status: stay.status, timing: stay.timing, address: stay.address,
                reference: reference,
                notes: stay.notes, sourceLinks: stay.sourceLinks, hostLinks: stay.hostLinks,
                documentLinks: stay.documentLinks))
    }

    private func render(_ source: TripSource, isCurrent: Bool) throws -> Data {
        let renderer = ImageRenderer(
            content:
                TripsSourceRow(source: source, zone: .gmt, places: [], isCurrent: isCurrent)
                .frame(width: 320)
        )
        renderer.scale = 1
        let image = try #require(renderer.cgImage)
        let bytes = try #require(image.dataProvider?.data)
        return bytes as Data
    }
}
