import Foundation
import Testing

@testable import AppCore

@Suite("Event source contracts")
internal struct TripEventContractTests {
    @Test("empty timing and date-only timing retain every unknown component")
    internal func independentTiming() throws {
        let empty = try JSONDecoder().decode(TripEventTiming.self, from: Data("{}".utf8))
        #expect(empty.start == nil)
        #expect(empty.end == nil)
        #expect(empty.startTime == nil)
        #expect(empty.endTime == nil)
        #expect(empty.timeZone == nil)
        let dateOnly = try JSONDecoder().decode(
            TripEventTiming.self, from: Data(#"{"start":"2026-01-02"}"#.utf8))
        #expect(dateOnly.start == "2026-01-02")
        #expect(dateOnly.end == nil)
        #expect(dateOnly.startTime == nil)
        #expect(dateOnly.timeZone == nil)
    }

    @Test("an absent required event collection fails rather than becoming a false empty result")
    internal func missingEventCollection() {
        let source = Data(
            #"""
            {
              "trip": {"id":1,"name":null,"destination":"","when":"","tagId":null,
                       "parentId":null,"notes":"","sourceLinks":[]},
              "places":[], "visits":[], "journeys":[], "journeyGroups":[], "stays":[],
              "documentAssociations":[]
            }
            """#.utf8)
        #expect(throws: DecodingError.self) {
            try JSONDecoder().decode(TripSnapshot.self, from: source)
        }
    }

    @Test("lifecycle, opaque document references and source URLs survive independently")
    internal func sourceFacts() throws {
        let source = Data(
            #"""
            {
              "id": 7,
              "tripId": 1,
              "visitId": null,
              "name": null,
              "intention": "Considering",
              "arrangement": "Not arranged",
              "purchase": "Purchased",
              "timing": {},
              "address": null,
              "reference": "EVT7",
              "sourceUrl": "https://example.test/event",
              "ticketUrl": null,
              "notes": "Source notes",
              "sourceLinks": [],
              "venueLinks": [],
              "organiserLinks": [],
              "documentLinks": [
                {
                  "uri": "pops:documents/document/99",
                  "label": "Ticket"
                }
              ]
            }
            """#.utf8)
        let event = try JSONDecoder().decode(TripEvent.self, from: source)
        #expect(event.intention == "Considering")
        #expect(event.arrangement == "Not arranged")
        #expect(event.purchase == "Purchased")
        #expect(event.sourceUrl == "https://example.test/event")
        #expect(event.documentLinks.first?.uri == "pops:documents/document/99")
        let restored = try JSONDecoder().decode(TripEvent.self, from: JSONEncoder().encode(event))
        #expect(restored == event)
    }
}
