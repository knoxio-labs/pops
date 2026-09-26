import Foundation
import Testing

@testable import AppCore

@Suite("Error presentation values")
internal struct ErrorPresentationTests {
    @Test("copied details contain the complete documented diagnostic block")
    func copiedDetails() {
        let presented = PresentedError(
            id: UUID(),
            error: PopsError(
                code: "inventory.codes.name_required",
                message: "Name the item before asking for a code.",
                requestID: "request-1",
                retryable: false,
                kind: .client),
            operation: "Suggest inventory code",
            occurredAt: Date(timeIntervalSince1970: 1_700_000_000),
            build: "Pops 1.8 (412)")

        #expect(
            presented.copiedDetails
                == """
                Name the item before asking for a code.
                Code: inventory.codes.name_required
                Request: request-1
                Operation: Suggest inventory code
                Time: \(presented.occurredAtText)
                Build: Pops 1.8 (412)
                """)
    }

    @Test("local failures state that no request id was provided")
    func missingRequestID() {
        let presented = PresentedError(
            error: PopsError(
                code: "ios.net.offline", message: "The server could not be reached.",
                retryable: true, kind: .offline),
            operation: "Refresh transactions",
            build: "Pops 1.8 (412)")

        #expect(presented.requestID == "Not provided")
        #expect(presented.copiedDetails.contains("Request: Not provided"))
    }

    @Test("recent errors keep the newest 50 failures")
    func recentErrorsBound() {
        var recent = RecentErrors()
        for index in 0..<52 {
            recent.record(Self.failure(index))
        }

        #expect(recent.entries.count == RecentErrors.limit)
        #expect(recent.entries.first?.error.code == "test.51")
        #expect(recent.entries.last?.error.code == "test.2")
    }

    @Test("constructing recent errors also enforces the bound")
    func decodedRecentErrorsBound() {
        let source = (0..<52).reversed().map(Self.failure)
        let recent = RecentErrors(source)

        #expect(recent.entries.count == RecentErrors.limit)
        #expect(recent.entries.first?.error.code == "test.51")
        #expect(recent.entries.last?.error.code == "test.2")
    }

    private static func failure(_ index: Int) -> PresentedError {
        PresentedError(
            id: UUID(),
            error: PopsError(
                code: "test.\(index)", message: "Failure \(index)",
                retryable: true, kind: .server),
            operation: "Test",
            occurredAt: Date(timeIntervalSince1970: TimeInterval(index)),
            build: "Test")
    }
}
