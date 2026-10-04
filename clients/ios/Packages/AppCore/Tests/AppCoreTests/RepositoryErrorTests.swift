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
}
