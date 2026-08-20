import AppCore
import Foundation
import HTTPTypes
import Testing

@testable import BFMClient

/// The failure map for `POST /mobile/purchases/receipts` — the gateway
/// failure modes an upload never gets far enough to answer a ``ReceiptOutcome``
/// for: no credential, the pillar unreachable, and a response this build
/// cannot read.
@Suite("BFMReceiptCaptureRepository failures")
internal struct ReceiptCaptureFailureTests {
    private static let onePart = [ReceiptPart(mediaType: .jpeg, data: Data([0xFF]))]

    private func error(status: HTTPResponse.Status, json: String) async -> RepositoryError? {
        await failure {
            try await BFMReceiptCaptureRepository
                .stubbed(StubTransport(status: status, json: json))
                .capture(Self.onePart)
        }
    }

    private func failure(_ work: () async throws -> ReceiptOutcome) async -> RepositoryError? {
        do {
            _ = try await work()
            return nil
        } catch let error as RepositoryError {
            return error
        } catch {
            return nil
        }
    }

    /// No credential, or one the BFM no longer honours, must end the same way
    /// a transactions call does — the session is on its way to `revoked`, not
    /// a reason to say the receipt was unreadable.
    @Test("a rejected or absent credential ends as unauthorized")
    func rejectedCredentials() async {
        let invalidToken = ReceiptCaptureWire.failure(code: "invalid_token")
        let revoked = ReceiptCaptureWire.failure(code: "device_revoked")

        #expect(await error(status: .unauthorized, json: invalidToken) == .unauthorized)
        #expect(await error(status: .forbidden, json: revoked) == .unauthorized)
    }

    @Test("purchases not answering and purchases answering unreadably stay separate facts")
    func upstreamDistinctionSurvives() async {
        let unavailable = await error(
            status: .serviceUnavailable,
            json: ReceiptCaptureWire.upstream(code: "upstream_unavailable")
        )
        let mismatch = await error(
            status: .badGateway,
            json: ReceiptCaptureWire.upstream(code: "upstream_contract_mismatch")
        )

        #expect(unavailable == .unavailable)
        #expect(mismatch == .contractMismatch)
        #expect(unavailable != mismatch)
    }

    @Test("being told to slow down is not something this screen can act on")
    func rateLimited() async {
        let actual = await error(status: .tooManyRequests, json: ReceiptCaptureWire.rateLimited)

        #expect(isTransport(actual))
    }

    /// A device-side size cap, not a fact about the receipt. Reading this as
    /// `.unreadable` would tell somebody standing in a checkout line that the
    /// model looked at their receipt and could not make sense of it, when
    /// nothing was ever read.
    @Test("a body too large for the gateway is a transport failure, never unreadable")
    func payloadTooLarge() async {
        let actual = await error(
            status: .contentTooLarge, json: ReceiptCaptureWire.payloadTooLarge())

        #expect(isTransport(actual))
    }

    @Test("a status the contract does not document is never mistaken for an outcome")
    func undocumentedStatus() async {
        let actual = await error(status: .init(code: 418), json: "{}")

        #expect(isTransport(actual))
    }

    /// A gate-failure code this build has never heard of is NOT a failure.
    /// The wire keeps `code` open so a gate that grows a reason does not break
    /// a build already on a handset, and answering `.contractMismatch` here
    /// would spend that guarantee — the reader would be told to update the app
    /// about a receipt that merely needs reviewing. The mapping test suite
    /// covers what it becomes instead.
    @Test("a needs-review code outside the known set is not a failure")
    func unrecognisedGateFailureCode() async {
        let actual = await error(
            status: .ok,
            json: ReceiptCaptureWire.needsReview(
                problems: ReceiptCaptureWire.problem(code: "receipt-ate-the-model"))
        )

        #expect(actual == nil)
    }

    /// The reading is the one part of `needs-review` the review screen cannot
    /// be drawn without, so a body missing it fails rather than arriving as an
    /// outcome with nothing in it — which is exactly what this arm used to do
    /// on every upload.
    @Test("a needs-review body with no reading does not decode as an empty review")
    func needsReviewWithoutExtraction() async {
        let actual = await error(
            status: .ok,
            json: """
                {"kind":"needs-review","receiptCount":1,\
                "problems":[{"code":"no-lines","detail":"none","deltaCents":null}]}
                """
        )

        #expect(isTransport(actual))
    }

    private func isTransport(_ error: RepositoryError?) -> Bool {
        if case .transport = error { return true }
        return false
    }
}
