import Testing
import ViewInspector

@testable import DesignPlayground

@Suite("Native trip browser")
@MainActor
internal struct TripBrowserViewTests {
    @Test("booking destinations retain exact source identity when names collide")
    func exactBookingIdentity() throws {
        let trip = try #require(tripsBrowserSelectedTrip(tripsBrowserFixture()))
        let first = try #require(trip.today.stays.first)
        var other = first
        other.id = "other-stay"
        other.essentials.reference = "DEMO-OTHER"
        let view = TripBrowserSourceLink(source: .stay(other), trip: trip)
        let destination = try view.inspect().find(ViewType.NavigationLink.self).view(
            TripBrowserSourceView.self)
        #expect(try destination.actualView().source.id == "other-stay")
        #expect(try destination.actualView().source.essentials.reference == "DEMO-OTHER")
    }

    @Test("contact values precede their original method labels and are not fabricated actions")
    func contactFacts() throws {
        let trip = try #require(tripsBrowserSelectedTrip(tripsBrowserFixture()))
        let contact = TripsBrowserContact(
            id: "person", name: "Alex Vale", kind: .person,
            methods: [.init(id: "method", label: "Hotel Desk", value: "+55 81 0000 0000")])
        let inspected = try TripBrowserContactView(contact: contact, trip: trip).inspect()
        let texts = try inspected.findAll(ViewType.Text.self).map { try $0.string() }
        let value = try #require(texts.firstIndex(of: "+55 81 0000 0000"))
        let label = try #require(texts.firstIndex(of: "Hotel Desk"))
        #expect(value < label)
        #expect(inspected.findAll(ViewType.Button.self).isEmpty)
    }

    @Test("document metadata has no simulated file controls and exposes missing source references")
    func metadataOnly() throws {
        let trip = try #require(tripsBrowserSelectedTrip(tripsBrowserFixture()))
        let document = TripsBrowserDocument(
            id: "missing", title: "Confirmation", fileName: "confirmation.pdf",
            mimeType: "application/pdf",
            sourceIDs: ["absent"])
        let inspected = try TripBrowserDocumentView(document: document, trip: trip).inspect()
        #expect(try inspected.find(text: "confirmation.pdf").string() == "confirmation.pdf")
        #expect(
            try inspected.find(text: "Missing Source · absent").string()
                == "Missing Source · absent")
        #expect(inspected.findAll(ViewType.Button.self).isEmpty)
    }

    @Test("document lists preserve unassociated and missing-reference records")
    func documentOrphansRemainVisible() throws {
        var trip = try #require(tripsBrowserSelectedTrip(tripsBrowserFixture()))
        trip.documents.append(
            .init(
                id: "orphan", title: "Orphan", fileName: "orphan.pdf",
                mimeType: "application/pdf", sourceIDs: ["absent"]))
        let rows = try TripBrowserDocumentsView(trip: trip).inspect()
            .findAll(TripBrowserDocumentLink.self)
        let identities = try rows.map { try $0.actualView().document.id }
        #expect(Set(identities) == Set(trip.documents.map(\.id)))
        #expect(identities.filter { $0 == "orphan" }.count == 1)
    }

    @Test("unbought arrangements do not acquire a planning status from a false purchase flag")
    func purchaseDoesNotInventStatus() throws {
        var stay = try #require(tripsBrowserSelectedTrip(tripsBrowserFixture())?.today.stays.first)
        stay.purchased = false
        let view = try TripBrowserSourceSummary(source: .stay(stay), displayZone: "America/Recife")
            .inspect()
        let texts = try view.findAll(ViewType.Text.self).map { try $0.string() }
        #expect(!texts.contains("Purchased"))
        #expect(!texts.contains("Planned"))
        #expect(!texts.contains("Not Purchased"))
        #expect(texts.contains(stay.name))
    }

    @Test("booking rows show source schedules while date-only events never gain a clock")
    func bookingSchedulePrecision() throws {
        let trip = try #require(tripsBrowserSelectedTrip(tripsBrowserFixture()))
        let stay = try #require(trip.today.stays.first)
        let stayView = try TripBrowserSourceSummary(
            source: .stay(stay), displayZone: trip.today.displayZone
        ).inspect()
        let clock = try #require(stay.from)
        let from =
            "From "
            + TripTodayClockCopy.label(clock, zone: trip.today.displayZone, includeZone: false)
        #expect(try stayView.find(text: from).string() == from)
        let event = TripsTodayEvent(
            id: "day", name: "Birthday", day: "2028-01-02",
            essentials: .init(), purchased: false)
        let timing = try TripBrowserSourceTiming(
            source: .event(event), displayZone: trip.today.displayZone
        ).inspect()
        let texts = try timing.findAll(ViewType.Text.self).map { try $0.string() }
        #expect(texts == ["2 Jan 2028"])
    }

    @Test("search opens historical contacts by trip identity even while another trip is selected")
    func historicalSearchIdentity() throws {
        let state = tripsBrowserFixture()
        let result = try #require(
            tripsBrowserSearch(state, query: "Marina", scope: .allTrips).first {
                $0.tripID != state.selectedTripID && $0.kind == .contact
            })
        let contact = try TripBrowserSearchDestination(result: result, state: state).inspect()
            .find(TripBrowserContactView.self).actualView().contact
        #expect(contact.id == result.recordID)
        #expect(contact.methods.contains { $0.value == "marina.old@example.test" })
    }

    @Test("the contact directory mixes types alphabetically without merging equal names")
    func alphabeticalDirectory() {
        let contacts: [TripsBrowserContact] = [
            .init(id: "z", name: "Zoe", kind: .person),
            .init(id: "b", name: "Alpha", kind: .organisation),
            .init(id: "a", name: "Alpha", kind: .business),
        ]
        #expect(tripBrowserSortedContacts(contacts).map(\.id) == ["a", "b", "z"])
    }

    @Test("bookings name the display zone once before converted source schedules")
    func bookingDisplayZone() throws {
        let trip = try #require(tripsBrowserSelectedTrip(tripsBrowserFixture()))
        let texts = try TripBrowserBookingsView(trip: trip).inspect()
            .findAll(ViewType.Text.self).map { try $0.string() }
        let label = "Times in " + trip.today.displayZone
        #expect(texts.first == label)
        #expect(texts.filter { $0 == label }.count == 1)
    }

    @Test("calendar ranges include leap days and reject invalid source dates")
    func calendarBoundaries() throws {
        #expect(TripBrowserCalendarDates.date("2028-02-30") == nil)
        let from = try #require(TripBrowserCalendarDates.date("2028-02-28"))
        let through = try #require(TripBrowserCalendarDates.date("2028-03-01"))
        #expect(
            TripBrowserCalendarDates.days(from: from, through: through)
                == ["2028-02-28", "2028-02-29", "2028-03-01"])
        #expect(TripBrowserCalendarDates.days(from: through, through: from).isEmpty)
    }
}
