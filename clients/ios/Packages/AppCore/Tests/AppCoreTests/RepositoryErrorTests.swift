import AppCore
import Testing

@Suite("Repository errors")
internal struct RepositoryErrorTests {
    @Test(
        "conflicts preserve their reason and remain distinct from every transport diagnostic",
        arguments: ["purchase_locked", "purchase_stale", "", "offline"])
    func conflictIdentity(transportDiagnostic: String) {
        #expect(RepositoryError.conflict("purchase_locked") != .conflict("purchase_stale"))
        #expect(RepositoryError.conflict("purchase_locked") != .transport(transportDiagnostic))
    }

    @Test("a structured failure remains available through the compatible transport case")
    func structuredTransportFailure() throws {
        let source = PopsError(
            code: "ios.net.offline",
            message: "The request could not reach the server",
            retryable: true,
            kind: .offline
        )

        guard case .transport(let payload) = RepositoryError.transport(source) else {
            Issue.record("expected a transport error")
            return
        }

        #expect(payload.popsError == source)
        #expect(payload.diagnostic == source.code)
    }

    @Test("rate limits remain retryable when converted to structured diagnostics")
    func rateLimitedDiagnostic() {
        let error = PopsError(
            repositoryError: .rateLimited(retryAfterSeconds: 30),
            fallbackMessage: "Finance asked this device to wait."
        )

        #expect(error.code == "ios.http.429")
        #expect(error.message == "Finance asked this device to wait.")
        #expect(error.retryable)
        #expect(error.kind == .client)
    }

    @Test("a rejected request is non-retryable in structured diagnostics")
    func requestRejectedDiagnostic() {
        let error = PopsError(
            repositoryError: .requestRejected,
            fallbackMessage: "Update the app before saving this purchase."
        )

        #expect(error.code == "ios.contract.request_rejected")
        #expect(error.message == "Update the app before saving this purchase.")
        #expect(!error.retryable)
        #expect(error.kind == .client)
    }

    @Test("a capability refusal is non-retryable in structured diagnostics")
    func featureUnavailableDiagnostic() {
        let error = PopsError(
            repositoryError: .featureUnavailable,
            fallbackMessage: "This device cannot use Purchases."
        )

        #expect(error.code == "ios.auth.capability_not_granted")
        #expect(error.message == "This device cannot use Purchases.")
        #expect(!error.retryable)
        #expect(error.kind == .client)
    }
}
