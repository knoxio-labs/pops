import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import Auth
@testable import BFMClient

@Suite("Documents raw-byte pairing ownership")
internal struct BoundDocumentsAuthorizationTests {
    @Test("replacement credentials never reach an old raw reader", arguments: [false, true])
    internal func replacementBeforeSend(otherOrigin: Bool) async throws {
        let fixture = try RefresherFixture()
        let owner = try #require(try fixture.pairedDeviceStore.load())
        let session = try BoundDocumentSession([200])
        defer { try? FileManager.default.removeItem(at: session.directory) }
        let reader = reader(fixture, owner, session)
        let replacement = try await replace(
            fixture,
            at: otherOrigin ? #require(URL(string: "https://other.example")) : owner.baseURL)
        await #expect(throws: RepositoryError.unauthorized) { _ = try await reader.file(id: 7) }
        #expect(await session.requests.isEmpty)
        #expect(fixture.exchange.challengeCount == 0)
        #expect(try fixture.pairedDeviceStore.load() == replacement)
        #expect(fixture.session.events.isEmpty)
    }

    @Test("a bound raw transport refuses a different origin before sending")
    internal func wrongOrigin() async throws {
        let fixture = try RefresherFixture()
        let owner = try #require(try fixture.pairedDeviceStore.load())
        let session = try BoundDocumentSession([200])
        defer { try? FileManager.default.removeItem(at: session.directory) }
        let reader = BFMDocumentsFileReader(
            baseURL: try #require(URL(string: "https://other.example")),
            authorizer: PairedDeviceStreamAuthorizer(refresher: fixture.refresher, device: owner),
            session: session, expectedDevice: owner)
        await #expect(throws: RepositoryError.unauthorized) { _ = try await reader.file(id: 7) }
        #expect(await session.requests.isEmpty)
        #expect(fixture.exchange.challengeCount == 0)
    }

    @Test(
        "normal rotation preserves the draft owner and pending command and returns original bytes")
    internal func stableRotation() async throws {
        let fixture = try RefresherFixture()
        let owner = try #require(try fixture.pairedDeviceStore.load())
        let operation = TripCaptureCreateOperation(
            operationID: UUID(), input: TripCaptureInput(originalText: "Uncertain original"))
        let inputGeneration = UUID()
        let saved = TripCaptureDraftState(
            owner: TripCaptureDraftOwner(device: owner), tripID: 7, input: operation.command.input,
            pending: operation, inputGeneration: inputGeneration,
            pendingInputGeneration: inputGeneration, result: nil, receipts: [])
        let archive = try JSONEncoder().encode(saved)
        let session = try BoundDocumentSession([401, 200])
        defer { try? FileManager.default.removeItem(at: session.directory) }
        let file = try await reader(fixture, owner, session).file(id: 7)
        #expect(try Data(contentsOf: file.temporaryURL) == Data("original".utf8))
        #expect(
            await session.requests.map { $0.value(forHTTPHeaderField: "Authorization") } == [
                "Bearer access-1", "Bearer access-2",
            ])
        #expect(fixture.exchange.spends.count == 1)
        let rotated = try #require(try fixture.pairedDeviceStore.load())
        #expect(TripCaptureDraftOwner(device: rotated) == saved.owner)
        #expect(
            try JSONDecoder().decode(TripCaptureDraftState.self, from: archive).pending == operation
        )
        #expect(await session.discardedRefusals())
    }

    @Test("replacement before a raw 401 refresh cannot spend the new grant")
    internal func replacementAfterSend() async throws {
        let gate = Gate()
        let fixture = try RefresherFixture()
        let owner = try #require(try fixture.pairedDeviceStore.load())
        let session = try BoundDocumentSession([401], beforeResponse: { await gate.wait() })
        defer { try? FileManager.default.removeItem(at: session.directory) }
        let reader = reader(fixture, owner, session)
        let request = Task { try await reader.file(id: 7) }
        try await withDeadline { try await gate.waitForArrivals(atLeast: 1) }
        let replacement = try await replace(fixture, at: owner.baseURL)
        await gate.open()
        await #expect(throws: SessionRefreshError.unavailable("paired client identity changed")) {
            _ = try await request.value
        }
        #expect(await session.requests.count == 1)
        #expect(fixture.exchange.challengeCount == 0)
        #expect(try fixture.pairedDeviceStore.load() == replacement)
        #expect(await session.discardedRefusals())
    }

    @Test("replacement during raw refresh cannot authorize a retry or overwrite B")
    internal func replacementDuringRefresh() async throws {
        let gate = Gate()
        let fixture = try RefresherFixture(
            exchange: ScriptedRefreshExchange(beforeRefresh: { await gate.wait() }))
        let owner = try #require(try fixture.pairedDeviceStore.load())
        let session = try BoundDocumentSession([401])
        defer { try? FileManager.default.removeItem(at: session.directory) }
        let reader = reader(fixture, owner, session)
        let request = Task { try await reader.file(id: 7) }
        try await withDeadline { try await gate.waitForArrivals(atLeast: 1) }
        let replacement = try await replace(fixture, at: owner.baseURL)
        await gate.open()
        await #expect(throws: SessionRefreshError.unavailable("credentials changed during refresh"))
        {
            _ = try await request.value
        }
        #expect(await session.requests.count == 1)
        #expect(try fixture.pairedDeviceStore.load() == replacement)
        #expect(fixture.session.events.isEmpty)
    }

    @Test("an already-dispatched A revocation cannot wipe the replacement pairing")
    internal func delayedRevocation() async throws {
        let gate = Gate()
        let fixture = try RefresherFixture()
        let owner = try #require(try fixture.pairedDeviceStore.load())
        let session = try BoundDocumentSession([403], beforeResponse: { await gate.wait() })
        defer { try? FileManager.default.removeItem(at: session.directory) }
        let reader = reader(fixture, owner, session)
        let request = Task { try await reader.file(id: 7) }
        try await withDeadline { try await gate.waitForArrivals(atLeast: 1) }
        let replacement = try await replace(fixture, at: owner.baseURL)
        await gate.open()
        await #expect(throws: RepositoryError.unauthorized) { _ = try await request.value }
        #expect(try fixture.pairedDeviceStore.load() == replacement)
        #expect(try fixture.tokenStore.load()?.accessToken == "access-token")
        #expect(fixture.session.events.isEmpty)
    }

    private func reader(
        _ fixture: RefresherFixture, _ device: PairedDevice, _ session: BoundDocumentSession
    )
        -> BFMDocumentsFileReader
    {
        BFMDocumentsFileReader(
            baseURL: device.baseURL,
            authorizer: PairedDeviceStreamAuthorizer(refresher: fixture.refresher, device: device),
            session: session, expectedDevice: device)
    }

    private func replace(_ fixture: RefresherFixture, at baseURL: URL) async throws -> PairedDevice
    {
        try await BFMDevicePairingService(
            credentialStore: fixture.credentialStore, exchange: { _ in ScriptedPairingExchange() }
        ).pair(.fake(baseURL: baseURL))
    }
}
