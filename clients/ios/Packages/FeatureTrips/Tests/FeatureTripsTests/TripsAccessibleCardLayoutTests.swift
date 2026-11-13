import AppCore
import DesignSystem
import DesignSystemTestSupport
import Foundation
import SwiftUI
import Testing

@testable import FeatureTrips

@Suite("Accessible trip card readability")
@MainActor
internal struct TripsAccessibleCardLayoutTests {
    private let width: CGFloat = 320
    private var textWidth: CGFloat { width - PopsSpacing.lg * 2 }
    private let longTitle = "Fictional harbour guesthouse overlooking the sheltered waterfront"
    private let shortTitle = "Stay"

    @Test(
        "the production Now card gives its heading the entire padded width",
        .comparisonSurvivesAnUncompiledCatalog)
    internal func currentHeadingWidth() throws {
        let long = try source(named: longTitle)
        let short = try source(named: shortTitle)
        let longHeight = try height(
            TripsSourceRow(source: long, zone: .gmt, places: [], isCurrent: true))
        let shortHeight = try height(
            TripsSourceRow(source: short, zone: .gmt, places: [], isCurrent: true))
        try expectFullWidthTitleDelta(longHeight - shortHeight)
    }

    @Test(
        "the production Next card does not reserve side columns beside accessible text",
        .comparisonSurvivesAnUncompiledCatalog)
    internal func nextHeadingWidth() throws {
        let long = try source(named: longTitle)
        let short = try source(named: shortTitle)
        let longHeight = try height(TripsNextSummaryRow(source: long, zone: .gmt, places: []))
        let shortHeight = try height(TripsNextSummaryRow(source: short, zone: .gmt, places: []))
        try expectFullWidthTitleDelta(longHeight - shortHeight)
    }

    @Test(
        "accessible date and IANA zone each retain their full wrapped text height",
        .comparisonSurvivesAnUncompiledCatalog)
    internal func dateZoneReadability() throws {
        let zone = try #require(TimeZone(identifier: "America/Argentina/Buenos_Aires"))
        let instant = try #require(TripClock.instant(local: "2026-01-01T12:00", zone: "UTC"))
        let actual = try height(TripsDateZoneView(date: instant, zone: zone), width: textWidth)
        let day = try height(
            Text(TripClock.dateLabel(instant, zone: zone))
                .font(.popsCaption).fixedSize(horizontal: false, vertical: true),
            width: textWidth)
        let identifier = try height(
            Text(zone.identifier)
                .font(.popsCaption).fixedSize(horizontal: false, vertical: true),
            width: textWidth)
        #expect(identifier > 0)
        #expect(abs(actual - day - identifier - PopsSpacing.xs) <= 2)
    }

    @Test(
        "the actual Next content gives every timing field its own untruncated line group",
        .comparisonSurvivesAnUncompiledCatalog)
    internal func nextTimingReadability() throws {
        let zone = try #require(TimeZone(identifier: "America/Argentina/Buenos_Aires"))
        let summary = TripNextSummary(source: try source(named: longTitle), places: [], zone: zone)
        #expect(!summary.hasConflictingTimes)
        let captions = ["Next"] + summary.timing + [summary.stateLine].compactMap { $0 }
        var expected = try height(
            Text(summary.title).font(.popsHeadline).fixedSize(horizontal: false, vertical: true),
            width: textWidth)
        for caption in captions {
            expected += try height(
                Text(caption).font(.popsCaption).fixedSize(horizontal: false, vertical: true),
                width: textWidth)
        }
        expected += CGFloat(captions.count) * PopsSpacing.xs
        let actual = try height(TripsNextSummaryContent(summary: summary), width: textWidth)
        #expect(abs(actual - expected) <= CGFloat(captions.count + 1))
    }

    @Test(
        "accessible visit chapters use the full padded width for their title",
        .comparisonSurvivesAnUncompiledCatalog)
    internal func chapterWidth() throws {
        let long = TripOverviewChapter(
            id: 1, title: longTitle, timing: "Dates not set", hasOpenDates: true, isCurrent: true)
        let short = TripOverviewChapter(
            id: 1, title: shortTitle, timing: long.timing, hasOpenDates: true, isCurrent: true)
        let longHeight = try height(TripsChapterRail(chapters: [long], onSelectVisit: { _ in }))
        let shortHeight = try height(TripsChapterRail(chapters: [short], onSelectVisit: { _ in }))
        try expectFullWidthTitleDelta(longHeight - shortHeight)
    }

    private func expectFullWidthTitleDelta(_ actual: CGFloat) throws {
        let long = try height(
            Text(longTitle).font(.popsHeadline).fixedSize(horizontal: false, vertical: true),
            width: textWidth)
        let short = try height(
            Text(shortTitle).font(.popsHeadline).fixedSize(horizontal: false, vertical: true),
            width: textWidth)
        #expect(long > short)
        #expect(abs(actual - (long - short)) <= 2)
    }

    private func source(named name: String) throws -> TripSource {
        let snapshot = try TripTestSources.snapshot()
        let stay = try #require(snapshot.stays.first)
        return .stay(
            TripStay(
                id: stay.id, tripId: stay.tripId, visitId: stay.visitId, name: name,
                kind: stay.kind, status: stay.status, timing: stay.timing, address: stay.address,
                reference: stay.reference, notes: stay.notes, sourceLinks: stay.sourceLinks,
                hostLinks: stay.hostLinks, documentLinks: stay.documentLinks))
    }

    private func height(_ content: some View, width: CGFloat? = nil) throws -> CGFloat {
        let viewport = width ?? self.width
        let renderer = ImageRenderer(
            content:
                content
                .environment(\.dynamicTypeSize, .accessibility5)
                .frame(width: viewport, alignment: .leading))
        renderer.scale = 1
        let image = try #require(renderer.cgImage)
        #expect(image.width == Int(viewport))
        return CGFloat(image.height)
    }
}
