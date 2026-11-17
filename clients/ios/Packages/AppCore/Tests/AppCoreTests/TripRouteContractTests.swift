import AppCoreFakes
import Foundation
import Testing

@testable import AppCore

@Suite("Canonical route source contract")
internal struct TripRouteContractTests {
    @Test(
        "Codable preserves mixed order, explicit missing sources and applied historical membership")
    internal func roundTrip() throws {
        let expected = TripRouteFixture.snapshot()
        let data = try JSONEncoder().encode(expected)
        #expect(try JSONDecoder().decode(TripRouteSnapshot.self, from: data) == expected)
        #expect(expected.order.compactMap(\.source) == [.visit(22), .journey(40), .visit(21)])
        #expect(TripRouteItem.visit(22) != .journey(22))
    }

    @Test(
        "unknown token kinds, unsafe identities and gaps in source-only memberships fail decoding")
    internal func invalidTokens() {
        for body in [
            #"{"kind":"stay","id":1}"#,
            #"{"kind":"visit","id":0}"#,
            #"{"kind":"journey","id":1.5}"#,
            #"{"kind":"visit","id":9007199254740992}"#,
        ] {
            #expect(throws: (any Error).self) {
                try JSONDecoder().decode(TripRouteItem.self, from: Data(body.utf8))
            }
        }
        #expect(throws: (any Error).self) {
            try JSONDecoder().decode(
                TripRouteSource.self, from: Data(#"{"kind":"gap","id":71}"#.utf8))
        }
    }

    @Test(
        "the complete route rejects invalid revisions and duplicate active sources but allows applied history"
    )
    internal func invalidMembership() throws {
        let value = TripRouteFixture.snapshot()
        let invalid = [
            TripRouteSnapshot(
                tripId: 7, revision: -1, order: value.order, paths: value.paths,
                missingSources: value.missingSources),
            TripRouteSnapshot(
                tripId: 7, revision: 9_007_199_254_740_992, order: value.order, paths: value.paths,
                missingSources: value.missingSources),
            TripRouteSnapshot(
                tripId: 7, revision: 12, order: value.order + [.visit(24)], paths: value.paths,
                missingSources: value.missingSources),
            TripRouteSnapshot(
                tripId: 7, revision: 12, order: value.order, paths: value.paths,
                missingSources: [.journey(999)]),
        ]
        for route in invalid {
            let data = try JSONEncoder().encode(route)
            #expect(throws: (any Error).self) {
                try JSONDecoder().decode(TripRouteSnapshot.self, from: data)
            }
        }
        let boundary = TripRouteSnapshot(
            tripId: 9_007_199_254_740_991, revision: 9_007_199_254_740_991,
            order: [.visit(9_007_199_254_740_991)], paths: [], missingSources: [])
        let data = try JSONEncoder().encode(boundary)
        #expect(try JSONDecoder().decode(TripRouteSnapshot.self, from: data) == boundary)
    }
}
