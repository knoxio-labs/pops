import Testing
import ViewInspector

@testable import DesignPlayground

@Suite("Native trip Today views")
@MainActor
internal struct TripTodayViewTests {
    @Test("a row opens its exact source even when another source has the same name")
    func rowOpensExactSource() throws {
        let first = try #require(tripsTodayFixture().stays.first)
        var second = first
        second.id = "second-stay"
        second.essentials.reference = "DEMO-OTHER"
        var selected: TripsTodaySource?
        let row = TripTodayRow(source: .stay(second), displayZone: "America/Recife") {
            selected = $0
        }
        try row.inspect().find(ViewType.Button.self).tap()
        #expect(selected?.id == second.id)
        #expect(selected?.essentials.reference == "DEMO-OTHER")
        #expect(selected?.id != first.id)
    }

    @Test("both hierarchies render the same original identities once")
    func layoutsShareSources() throws {
        let state = tripsTodayFixture()
        let projection = tripsTodayProjection(state)
        let expected = Set(projection.sources.map(\.id))
        for layout in TripTodayLayout.allCases {
            let view = TripTodayView(state: state, layout: layout)
            let rows = try view.inspect().findAll(TripTodayRow.self)
            let ids = try rows.map { try $0.actualView().source.id }
            #expect(Set(ids) == expected)
            #expect(ids.count == expected.count)
            if layout == .nextFirst {
                #expect(ids.first == projection.currentStays.first?.id)
            } else {
                #expect(ids == projection.sources.map(\.id))
            }
        }
    }

    @Test(
        "row accessibility preserves source facts instead of replacing them with a name-only label")
    func rowPreservesAccessibleChildren() throws {
        let stay = try #require(tripsTodayFixture().stays.first)
        let row = TripTodayRow(source: .stay(stay), displayZone: "America/Recife") { _ in }
        let button = try row.inspect().find(ViewType.Button.self)
        #expect((try? button.accessibilityLabel()) == nil)
        #expect(try button.accessibilityHint().string() == "Open details")
        #expect(try button.find(text: "DEMO-CARMO-29").string() == "DEMO-CARMO-29")
        #expect(try button.find(text: "Rua do Amparo, Olinda").string() == "Rua do Amparo, Olinda")
        #expect(try button.find(text: "Purchased").string() == "Purchased")
    }

    @Test("unavailable documents expose metadata without a download or invented file action")
    func unavailableDocumentHasNoFileAction() throws {
        let stay = try #require(tripsTodayFixture(.unavailable).stays.first)
        let view = TripTodayEssentialsView(essentials: stay.essentials)
        let inspected = try view.inspect()
        #expect(try inspected.find(text: "Source unavailable").string() == "Source unavailable")
        #expect(try inspected.find(text: "Stay confirmation").string() == "Stay confirmation")
        #expect(inspected.findAll(ViewType.Button.self).isEmpty)
        #expect(try inspected.find(text: "DEMO-CARMO-29").string() == "DEMO-CARMO-29")
        #expect(try inspected.find(text: "+55 81 0000 0129").string() == "+55 81 0000 0129")
    }

    @Test("source time formatting retains both zones and rejects an invalid source zone")
    func sourceClockFormatting() throws {
        let journey = try #require(tripsTodayFixture(.outbound).journeys.first)
        let clock = try #require(journey.legs.first?.arrival)
        #expect(TripTodayClockCopy.label(clock, zone: "America/Chicago").contains("08:15"))
        #expect(
            TripTodayClockCopy.label(clock, zone: "America/Chicago").contains("America/Chicago"))
        #expect(
            TripTodayClockCopy.label(clock, zone: "Australia/Sydney").contains("Australia/Sydney"))
        var invalid = clock
        invalid.timeZone = "Not/AZone"
        #expect(TripTodayClockCopy.label(invalid, zone: "UTC").hasPrefix("Invalid source time"))
    }
}
