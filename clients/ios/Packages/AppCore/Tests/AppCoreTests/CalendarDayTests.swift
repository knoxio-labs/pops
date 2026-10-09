import AppCore
import Testing

@Suite("Calendar day")
internal struct CalendarDayTests {
    @Test("component construction validates Gregorian boundaries and leap days")
    func validatesComponents() {
        #expect(CalendarDay(year: 2000, month: 2, day: 29) != nil)
        #expect(CalendarDay(year: 1900, month: 2, day: 29) == nil)
        #expect(CalendarDay(year: 2026, month: 2, day: 30) == nil)
        #expect(CalendarDay(year: 1, month: 1, day: 1) != nil)
        #expect(CalendarDay(year: 10000, month: 1, day: 1) == nil)
    }

    @Test("ISO parsing accepts only valid canonical calendar days")
    func parsesCanonicalDays() {
        #expect(CalendarDay(iso8601: "2026-03-05") == CalendarDay(year: 2026, month: 3, day: 5))
        #expect(CalendarDay(iso8601: "2024-02-29") != nil)
        #expect(CalendarDay(iso8601: "2023-02-29") == nil)
        #expect(CalendarDay(iso8601: "2026-02-30") == nil)
        #expect(CalendarDay(iso8601: "2026-3-5") == nil)
        #expect(CalendarDay(iso8601: "2026-03-05T00:00:00Z") == nil)
        #expect(CalendarDay(iso8601: "0000-01-01") == nil)
    }
}
