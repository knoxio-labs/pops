import Testing

@testable import DesignPlayground

@Suite("Trips browser explicit route")
internal struct TripsBrowserRouteTests {
    @Test("Route order follows entries independently of dates and prioritised Today sources")
    func explicitOrder() throws {
        var trip = try #require(tripsBrowserSelectedTrip(tripsBrowserFixture()))
        let before = trip
        let original = tripsBrowserRouteRows(trip)
        trip.route.reverse()
        #expect(tripsBrowserRouteRows(trip).map(\.entry) == original.reversed().map(\.entry))
        #expect(
            tripsTodayProjection(trip.today).sources == tripsTodayProjection(before.today).sources)
        #expect(original.first?.visit?.id == "sydney-out")
        #expect(original.last?.visit?.id == "sydney-home")
        #expect(original.first?.visit?.placeID == original.last?.visit?.placeID)
        #expect(original.first?.visit?.id != original.last?.visit?.id)
    }

    @Test("Journeys are route entries, while visits retain local sources and exact contact IDs")
    func explicitAssociations() throws {
        let trip = try #require(tripsBrowserSelectedTrip(tripsBrowserFixture()))
        let rows = tripsBrowserRouteRows(trip)
        let transport = rows.compactMap { row -> String? in
            guard case .transport(let id) = row.entry else { return nil }
            return id
        }
        #expect(transport == ["outbound", "poa-rec", "return"])
        #expect(!trip.visits.flatMap(\.sourceIDs).contains { transport.contains($0) })
        let olinda = try #require(trip.visits.first { $0.id == "olinda-visit" })
        #expect(olinda.sourceIDs.contains("carmo"))
        #expect(olinda.sourceIDs.contains("olinda-switch"))
        #expect(olinda.contactIDs == ["marina", "carmo-contact"])
        #expect(tripsBrowserFindings(trip).isEmpty)
    }

    @Test("Source-authored gap endpoints and alternatives survive without invented journeys")
    func gapAndAlternative() throws {
        let trip = try #require(tripsBrowserSelectedTrip(tripsBrowserFixture()))
        let rows = tripsBrowserRouteRows(trip)
        let gap = try #require(
            rows.first {
                if case .gap = $0.entry { return true }
                return false
            })
        #expect(gap.title == "Transport")
        #expect(gap.detail.isEmpty)
        #expect(gap.source == nil)
        #expect(
            gap.entry
                == .gap(
                    .init(id: "sao-poa-gap", fromVisitID: "sao-paulo-visit", toVisitID: "poa-visit")
                ))
        let alternative = try #require(
            rows.first {
                if case .alternative = $0.entry { return true }
                return false
            })
        #expect(alternative.sourceIDs == ["recife-stay"])
        #expect(tripsTodaySource(trip.today, id: "recife-stay")?.purchased == false)
    }

    @Test("Missing references remain explicit without replacing them by equal names")
    func missingReferences() throws {
        let trip = try #require(tripsBrowserSelectedTrip(tripsBrowserFixture(.missingReferences)))
        let rows = tripsBrowserRouteRows(trip)
        #expect(
            rows.contains {
                $0.entry == .visit("missing-visit") && $0.missingReference && $0.visit == nil
            })
        #expect(
            rows.contains {
                $0.entry == .transport("missing-journey") && $0.missingReference && $0.source == nil
            })
        #expect(tripsBrowserFindings(trip).contains { $0.id == "missing-document-links" })
        #expect(tripsBrowserFindings(trip).contains { $0.id == "missing-links" })
        #expect(tripsBrowserPeriod(trip) == .other)
    }

    @Test("Repeated route occurrences remain distinct, originals remain unchanged")
    func repeatedOccurrence() throws {
        var trip = try #require(tripsBrowserSelectedTrip(tripsBrowserFixture()))
        trip.route = [.visit("sydney-out"), .visit("sydney-out")]
        let before = trip
        let rows = tripsBrowserRouteRows(trip)
        #expect(Set(rows.map(\.id)).count == 2)
        #expect(rows.map { $0.visit?.id } == ["sydney-out", "sydney-out"])
        _ = tripsBrowserCalendar(trip, day: "2027-12-29")
        _ = tripsBrowserFindings(trip)
        #expect(trip == before)
    }
}
