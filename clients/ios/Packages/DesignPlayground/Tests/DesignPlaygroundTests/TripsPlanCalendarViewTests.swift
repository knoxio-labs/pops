import AppCore
import Foundation
import SwiftUI
import Testing
import ViewInspector

@testable import FeatureTrips

@Suite("Native Plan calendar interactions")
@MainActor
internal struct TripsPlanCalendarViewTests {
    @Test("the date control keeps its accessible name without a competing visual label")
    internal func dateControlLabel() throws {
        let route = TripRouteSnapshot(
            tripId: 1, revision: 1, order: [], paths: [], missingSources: [])
        let calendar = TripsPlanCalendarView(
            route: route, snapshot: nil, selectedDay: .constant(nil), openSource: { _ in })
        let picker = try calendar.inspect().find(ViewType.DatePicker.self)
        #expect(picker.labelsHidden())
        #expect(try picker.labelView().text().string() == "Date")
    }

    @Test("the Plan picker switches lenses while retaining exact route, detail and source action")
    internal func lenses() async throws {
        let snapshot = try TripNavigationTestContext.snapshot()
        let source = try #require(snapshot.journeys.first)
        let route = TripRouteSnapshot(
            tripId: snapshot.trip.id, revision: 1, order: [.journey(source.id)],
            paths: [], missingSources: [])
        var lens = TripsPlanLens.line
        var opened: TripSource?
        let model = TripsModel(repository: CalendarSelectionReader(snapshot: snapshot))
        await model.select(snapshot.trip.id)
        let selection = TripsPlanCalendarSelection()
        let view = TripsPlanView(
            route: route, snapshot: snapshot,
            lens: Binding(get: { lens }, set: { lens = $0 }),
            selectedDay: selection.binding(for: model),
            openSource: {
                opened = $0
                model.source = $0
            })
        #expect(try view.inspect().findAll(TripsPlanLineView.self).count == 1)
        try view.inspect().find(ViewType.Picker.self).select(value: TripsPlanLens.calendar)
        #expect(lens == .calendar)
        let calendar = try view.inspect().find(TripsPlanCalendarView.self).actualView()
        #expect(calendar.route == route)
        #expect(calendar.snapshot == snapshot)
        let chosen = try #require(TripClock.day("2028-02-29"))
        try calendar.inspect().find(ViewType.DatePicker.self).select(date: chosen)
        #expect(calendar.selectedDay == "2028-02-29")
        calendar.openSource(.journey(source))
        #expect(opened == .journey(source))
        model.source = nil
        #expect(calendar.selectedDay == "2028-02-29")
        #expect(try view.inspect().findAll(TripsPlanLineView.self).isEmpty)
        try view.inspect().find(ViewType.Picker.self).select(value: TripsPlanLens.line)
        #expect(lens == .line)
        try view.inspect().find(ViewType.Picker.self).select(value: TripsPlanLens.calendar)
        let returned = try view.inspect().find(TripsPlanCalendarView.self).actualView()
        #expect(returned.selectedDay == "2028-02-29")
        let grid = try returned.inspect().find(TripsPlanCalendarGrid.self).actualView()
        #expect(grid.month.firstDay == "2028-02-01")
    }

    @Test("a month day tap selects the exact date and stay bands open the actual recorded source")
    internal func gridActions() throws {
        let snapshot = try TripNavigationTestContext.snapshot()
        let stay = try #require(
            snapshot.stays.first { $0.visitId != nil && $0.timing.arrival != nil })
        let visitID = try #require(stay.visitId)
        let arrival = try #require(stay.timing.arrival)
        let month = try #require(TripPlanCalendarMonth(containing: arrival))
        let route = TripRouteSnapshot(
            tripId: snapshot.trip.id, revision: 1, order: [.visit(visitID)],
            paths: [], missingSources: [])
        let projection = TripPlanCalendarProjection(route: route, snapshot: snapshot, zone: .gmt)
        var selected: String?
        var opened: TripSource?
        let grid = TripsPlanCalendarGrid(
            month: month, projection: projection, firstWeekday: 2,
            locale: Locale(identifier: "en_AU"), selectedDay: arrival,
            selectDay: { selected = $0 }, openSource: { opened = $0 })
        let buttons = try grid.inspect().findAll(ViewType.Button.self)
        let day = try #require(
            buttons.first { button in
                (try? button.accessibilityLabel().string()) == TripClock.dayLabel(arrival)
            })
        try day.tap()
        #expect(selected == arrival)
        let band = try #require(
            buttons.first { button in
                (try? button.accessibilityHint().string()) == "Open stay details"
            })
        try band.tap()
        #expect(opened == .stay(stay))
    }

    @Test("Calendar with failed detail keeps missing identity and open-route structure visible")
    internal func absentDetail() throws {
        let route = TripRouteSnapshot(
            tripId: 1, revision: 1, order: [.gap(7), .journey(8)], paths: [],
            missingSources: [.journey(8)])
        let calendar = TripsPlanCalendarView(
            route: route, snapshot: nil, selectedDay: .constant(nil), openSource: { _ in })
        let rows = try calendar.inspect().findAll(TripsPlanLineRow.self).map {
            try $0.actualView().item
        }
        #expect(rows.map(\.content) == [.gap(7), .missing(.journey(8))])
        #expect(try calendar.inspect().findAll(TripsPlanLineSourceRow.self).isEmpty)
    }

    @Test("a changed Trip clears date selection and rejects old and ABA calendar bindings")
    internal func tripDateIsolation() async throws {
        let snapshot = try TripNavigationTestContext.snapshot()
        let model = TripsModel(repository: CalendarSelectionReader(snapshot: snapshot))
        await model.select(snapshot.trip.id)
        let selection = TripsPlanCalendarSelection()
        let oldBinding = selection.binding(for: model)
        oldBinding.wrappedValue = "2028-02-29"
        #expect(oldBinding.wrappedValue == "2028-02-29")
        let firstEpoch = model.tripSelectionEpoch
        await model.select(2)
        await model.select(snapshot.trip.id)
        #expect(model.tripSelectionEpoch != firstEpoch)
        #expect(oldBinding.wrappedValue == nil)
        let newBinding = selection.binding(for: model)
        let route = TripRouteSnapshot(
            tripId: snapshot.trip.id, revision: 1, order: [], paths: [], missingSources: [])
        let view = TripsPlanView(
            route: route, snapshot: nil, lens: .constant(.calendar),
            selectedDay: newBinding, openSource: { _ in })
        #expect(try view.inspect().find(TripsPlanCalendarView.self).actualView().selectedDay == nil)
        oldBinding.wrappedValue = "2029-01-01"
        #expect(newBinding.wrappedValue == nil)
        newBinding.wrappedValue = "2030-03-04"
        await model.select(snapshot.trip.id)
        #expect(newBinding.wrappedValue == "2030-03-04")
        let source = try #require(snapshot.stays.first)
        model.source = .stay(source)
        model.source = nil
        #expect(selection.binding(for: model).wrappedValue == "2030-03-04")
    }
}

private struct CalendarSelectionReader: TripsReading {
    let snapshot: TripSnapshot
    func trips() async throws -> [TripRecord] { [snapshot.trip] }
    func trip(id: Int) async throws -> TripSnapshot? { id == snapshot.trip.id ? snapshot : nil }
}
