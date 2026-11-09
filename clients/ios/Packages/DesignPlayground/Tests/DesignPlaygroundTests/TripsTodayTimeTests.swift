import Testing

@testable import DesignPlayground

@Suite("Trips Today source clocks")
internal struct TripsTodayTimeTests {
    @Test(
        "Malformed and normalized calendar instants remain invalid",
        arguments: [
            "2027-02-29T10:00:00Z", "2027-02-30T10:00:00Z", "2027-13-01T10:00:00Z",
            "2027-12-29T24:00:00Z", "2027-12-29T10:00:00", "2027-12-29", "not a date",
            "2027-12-29T10:00:00+25:00",
        ])
    func invalidInstant(value: String) {
        #expect(tripsTodayInstant(value) == nil)
    }

    @Test("Leap date and fractional explicit-offset instants remain precise")
    func validInstants() {
        #expect(tripsTodayInstant("2028-02-29T10:00:00Z") != nil)
        #expect(tripsTodayInstant("2027-12-29T10:00:00.125-03:00") != nil)
        #expect(tripsTodayValidDay("2028-02-29"))
        #expect(!tripsTodayValidDay("2027-02-29"))
        #expect(!tripsTodayValidDay("2027-2-01"))
    }

    @Test("A selected display zone changes date across the date line")
    func dateLine() {
        let at = "2027-11-24T10:00:00+11:00"
        #expect(tripsTodayDay(at, zone: "Australia/Sydney") == "2027-11-24")
        #expect(tripsTodayDay(at, zone: "America/Chicago") == "2027-11-23")
        let clock = TripsTodayClock(at: at, timeZone: "Australia/Sydney")
        #expect(tripsTodayLocalTime(clock, zone: "America/Chicago") == "17:00")
        #expect(clock.at == at)
        #expect(tripsTodayDayLabel("2027-12-29") == "29 Dec 2027")
        #expect(tripsTodayDayLabel("2027-02-29") == nil)
    }

    @Test("Invalid source and display zones have no implicit fallback")
    func invalidZones() {
        let clock = TripsTodayClock(at: "2027-12-29T10:00:00Z", timeZone: "Missing/Zone")
        #expect(tripsTodayClockInstant(clock) == nil)
        #expect(tripsTodayLocalTime(clock, zone: "UTC") == nil)
        #expect(tripsTodayDay(clock.at, zone: "Missing/Zone") == nil)
        #expect(tripsTodayDay(clock.at, zone: "GMT+0300") == nil)
        #expect(tripsTodayDay(clock.at, zone: "UTC+3") == nil)
        #expect(tripsTodayTimeZone("US/Eastern") != nil)
        #expect(tripsTodayTimeZone("UTC") != nil)
        var state = tripsTodayFixture()
        state.displayZone = "Missing/Zone"
        let projection = tripsTodayProjection(state)
        #expect(projection.day == nil)
        #expect(projection.sources.isEmpty)
        #expect(projection.findings.contains { $0.id == "zone" })
    }
}
