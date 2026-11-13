import Foundation
import Testing

@testable import AppCore

@Suite("Last verified Trip reads fail closed")
internal struct TripOfflineReadPolicyTests {
    @Test(
        "only explicit repository unavailability permits a last-good read",
        arguments: [
            RepositoryError.unavailable, .unauthorized, .featureUnavailable, .requestRejected,
            .contractMismatch, .transport("unknown"), .conflict("changed"),
            .rateLimited(retryAfterSeconds: nil),
        ])
    internal func repositoryErrors(error: RepositoryError) {
        #expect(
            TripOfflineReadPolicy.permitsLastVerifiedRead(after: error) == (error == .unavailable))
    }

    @Test(
        "reachability failures permit fallback, but cancellation and TLS failures do not",
        arguments: [
            URLError.Code.notConnectedToInternet, .networkConnectionLost, .timedOut,
            .cannotFindHost, .cannotConnectToHost, .dnsLookupFailed,
        ])
    internal func unreachable(code: URLError.Code) {
        #expect(TripOfflineReadPolicy.permitsLastVerifiedRead(after: URLError(code)))
    }

    @Test("missing, configuration, owner and integrity failures cannot revive a cached source")
    internal func denied() {
        let errors: [any Error] = [
            DocumentAccessError.notFound, DocumentAccessError.notConfigured,
            TripDocumentOfflineError.ownerChanged, TripDocumentOfflineError.corruptOriginal,
            TripDocumentOfflineError.invalidRecord, CancellationError(),
            URLError(.cancelled), URLError(.serverCertificateUntrusted),
        ]
        for error in errors {
            #expect(!TripOfflineReadPolicy.permitsLastVerifiedRead(after: error))
        }
    }

    @Test("an offline display label without original URL identity never authorizes fallback")
    internal func collapsedDiagnostic() {
        let display = PopsError(
            code: "ios.net.offline", message: "The request could not reach the server",
            retryable: true, kind: .offline)
        #expect(
            !TripOfflineReadPolicy.permitsLastVerifiedRead(
                after: RepositoryError.transport(display)))
        let typed = RepositoryError.transport(
            RepositoryTransportError(popsError: display, urlErrorCode: .notConnectedToInternet))
        #expect(TripOfflineReadPolicy.permitsLastVerifiedRead(after: typed))
        let tls = RepositoryError.transport(
            RepositoryTransportError(popsError: display, urlErrorCode: .serverCertificateUntrusted))
        #expect(!TripOfflineReadPolicy.permitsLastVerifiedRead(after: tls))
        let refused = RepositoryError.transport(
            RepositoryTransportError(
                popsError: display, urlErrorCode: .notConnectedToInternet,
                configurationFailure: .upstreamMisconfigured))
        #expect(!TripOfflineReadPolicy.permitsLastVerifiedRead(after: refused))
    }
}
