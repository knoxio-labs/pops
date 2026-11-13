import Foundation
import Testing

@testable import FeatureTrips

@Suite("Plan calendar month boundaries")
internal struct TripPlanCalendarMonthTests {
    @Test("Gregorian leap days and leading weekdays preserve every day exactly once")
    internal func leapMonth() throws {
        let leap = try #require(TripPlanCalendarMonth(containing: "2028-02-29"))
        #expect(leap.firstDay == "2028-02-01")
        #expect(leap.days.count == 29)
        #expect(leap.days.last == "2028-02-29")
        #expect(leap.cells(firstWeekday: 2).count == 35)
        #expect(leap.cells(firstWeekday: 2).first == .some(nil))
        #expect(leap.cells(firstWeekday: 2).compactMap { $0 } == leap.days)
        #expect(leap.cells(firstWeekday: 1).compactMap { $0 } == leap.days)
        #expect(leap.cells(firstWeekday: 0).isEmpty)
        #expect(TripPlanCalendarMonth(containing: "2027-02-29") == nil)
    }

    @Test("month navigation crosses years and never clips a long month to its selected day")
    internal func navigation() throws {
        let december = try #require(TripPlanCalendarMonth(containing: "2027-12-31"))
        #expect(december.moved(by: 1)?.firstDay == "2028-01-01")
        #expect(december.moved(by: -12)?.firstDay == "2026-12-01")
        let january = try #require(december.moved(by: 1))
        #expect(january.moved(by: -1) == december)
        #expect(january.moved(by: 1)?.days.count == 29)
        #expect(TripPlanCalendarMonth(containing: "not a date") == nil)
    }

    @Test("current display-day selection respects the requested zone without changing source days")
    internal func displayDay() throws {
        let date = try #require(TripClock.instant(local: "2028-03-01T00:30", zone: "UTC"))
        let honolulu = try #require(TimeZone(identifier: "Pacific/Honolulu"))
        #expect(TripPlanCalendarMonth.dayKey(date, zone: .gmt) == "2028-03-01")
        #expect(TripPlanCalendarMonth.dayKey(date, zone: honolulu) == "2028-02-29")
    }
}
