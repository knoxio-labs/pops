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

    /// A gate-failure code this build has never heard of fails the whole
    /// outcome rather than being rendered under a made-up label — the same
    /// call ``BFMTransactionsRepository`` makes about a row it cannot map.
    @Test("a needs-review code outside the closed kind is a contract mismatch")
    func unrecognisedGateFailureCode() async {
        let actual = await error(
            status: .ok,
            json: ReceiptCaptureWire.needsReview(
                problems: ReceiptCaptureWire.problem(code: "receipt-ate-the-model"))
        )

        #expect(actual == .contractMismatch)
    }

    private func isTransport(_ error: RepositoryError?) -> Bool {
        if case .transport = error { return true }
        return false
    }
}
