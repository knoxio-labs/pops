import Foundation
import Testing

@testable import Auth
@testable import BFMClient

@Suite("Device session stream authorizer")
internal struct StreamAuthorizerTests {
    @Test("current stream credential returns the stored token and revision")
    func currentStreamCredential() async throws {
        let paired = try RefresherFixture()
        let unpaired = try RefresherFixture(tokens: nil)

        let credential = try #require(await paired.refresher.currentStreamCredential())
        #expect(credential.accessToken == "access-1")
        #expect(credential.revision == 0)
        #expect(await unpaired.refresher.currentStreamCredential() == nil)
    }

    @Test("refresh returns and stores the rotated stream credential")
    func refreshedStreamCredentialStoresRotation() async throws {
        let fixture = try RefresherFixture()

        let credential = try await fixture.refresher.refreshedStreamCredential(
            replacing: "access-1",
            at: RefresherFixture.baseURL
        )

        #expect(credential.accessToken == "access-2")
        #expect(credential.revision == 0)
        #expect(try fixture.tokenStore.load()?.accessToken == "access-2")
        #expect(fixture.exchange.spends.count == 1)
    }

    @Test("a late stale request uses the stored token without a second exchange")
    func lateStaleRequestDoesNotRefreshAgain() async throws {
        let fixture = try RefresherFixture()

        _ = try await fixture.refresher.refreshedStreamCredential(
            replacing: "access-1",
            at: RefresherFixture.baseURL
        )
        let lateCredential = try await fixture.refresher.refreshedStreamCredential(
            replacing: "access-1",
            at: RefresherFixture.baseURL
        )

        #expect(lateCredential.accessToken == "access-2")
        #expect(lateCredential.revision == 0)
        #expect(fixture.exchange.spends.count == 1)
    }

    @Test("a stale stream revocation cannot wipe a replacement pairing")
    func staleStreamRevocationCannotWipeReplacement() async throws {
        let fixture = try RefresherFixture()
        let oldCredential = try #require(await fixture.refresher.currentStreamCredential())
        let pairing = BFMDevicePairingService(
            credentialStore: fixture.credentialStore,
            exchange: { _ in ScriptedPairingExchange() }
        )
        let newDevice = try await pairing.pair(.fake())
        let newKey = try #require(try fixture.keyStore.publicKey())

        await fixture.refresher.deviceWasRevoked(
            ifCredentialRevision: oldCredential.revision
        )

        #expect(newDevice.credentialRevision == 1)
        #expect(try fixture.tokenStore.load()?.accessToken == "access-token")
        #expect(try fixture.keyStore.publicKey() == newKey)
        #expect(try fixture.pairedDeviceStore.load() == newDevice)
        #expect(fixture.session.events.isEmpty)
    }

    @Test("a late Ego stream revocation cannot wipe a replacement pairing")
    func lateStreamResponseCannotWipeReplacement() async throws {
        let fixture = try RefresherFixture()
        let gate = Gate()
        let transport = BFMEgoByteTransport(
            baseURL: RefresherFixture.baseURL,
            authorizer: fixture.refresher,
            source: GatedStreamRevocationSource(gate: gate)
        )
        let opening = Task { try await transport.open(body: Data()) }

        try await withDeadline { try await gate.waitForArrivals(atLeast: 1) }
        let pairing = BFMDevicePairingService(
            credentialStore: fixture.credentialStore,
            exchange: { _ in ScriptedPairingExchange() }
        )
        let newDevice = try await pairing.pair(.fake())
        let newKey = try #require(try fixture.keyStore.publicKey())
        await gate.open()
        let result = try await opening.value

        guard case .rejected(let status, _, _) = result else {
            Issue.record("expected the stream refusal to be returned")
            return
        }
        #expect(status == 403)
        #expect(newDevice.credentialRevision == 1)
        #expect(try fixture.tokenStore.load()?.accessToken == "access-token")
        #expect(try fixture.keyStore.publicKey() == newKey)
        #expect(try fixture.pairedDeviceStore.load() == newDevice)
        #expect(fixture.session.events.isEmpty)
    }

    @Test("a refused refresh throws without returning a token")
    func refusedRefreshThrows() async throws {
        let fixture = try RefresherFixture(
            exchange: ScriptedRefreshExchange(
                refreshes: [.failure(BFMClientError.refreshRefused(.invalidGrant))]
            )
        )

        await #expect(throws: SessionRefreshError.credentialsRejected) {
            try await fixture.refresher.refreshedStreamCredential(
                replacing: "access-1",
                at: RefresherFixture.baseURL
            )
        }
        #expect(fixture.exchange.spends.count == 1)
    }
}

private struct GatedStreamRevocationSource: BFMByteSource {
    let gate: Gate

    func open(_ request: URLRequest) async throws -> (
        HTTPURLResponse, AsyncThrowingStream<[UInt8], any Error>
    ) {
        guard let url = request.url,
            let response = HTTPURLResponse(
                url: url,
                statusCode: 403,
                httpVersion: nil,
                headerFields: nil
            )
        else {
            throw StreamSourceError.invalidResponse
        }

        let payload = Array(#"{"code":"bfm.auth.device_revoked"}"#.utf8)
        let body = AsyncThrowingStream<[UInt8], any Error> { continuation in
            Task {
                await gate.wait()
                continuation.yield(payload)
                continuation.finish()
            }
        }
        return (response, body)
    }
}

private enum StreamSourceError: Error {
    case invalidResponse
}
