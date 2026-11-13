import AppCore
import Auth
import Foundation
import Synchronization
import Testing

@testable import Pops

@Suite("Capture storage credential lifecycle")
@MainActor
internal struct TripCaptureRevocationTests {
    @Test("only a confirmed matching revocation removes the captured owner's files")
    internal func confirmedRevocation() async throws {
        let fixture = try CaptureLifecycleFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        try fixture.seed(fixture.device)
        let oldStore = fixture.composition.tripCaptureDraftStore(
            for: fixture.device, root: fixture.root)
        let previous = fixture.composition.session.state
        try fixture.identity.saveSnapshot(PairedDeviceSnapshot(revision: 2, device: nil))
        fixture.composition.session.send(.revoked(.revokedByOperator, ifCredentialRevision: 1))
        await fixture.composition.captureSessionChanged(
            from: previous, to: fixture.composition.session.state, root: fixture.root)
        #expect(try fixture.read(fixture.device) == nil)
        #expect(throws: TripCaptureStorageError.ownerChanged) {
            try oldStore.replace(fixture.state(fixture.device), replacing: nil)
        }
    }

    @Test("cleanup filesystem failures retain drafts and record only a safe typed error")
    internal func cleanupFailure() async throws {
        let fixture = try CaptureLifecycleFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        try fixture.seed(fixture.device)
        let blocked = fixture.root.appendingPathComponent("blocked")
        try Data("not a directory".utf8).write(to: blocked)
        let previous = fixture.composition.session.state
        try fixture.identity.saveSnapshot(PairedDeviceSnapshot(revision: 2, device: nil))
        fixture.composition.session.send(.revoked(.revokedByOperator, ifCredentialRevision: 1))
        await fixture.composition.captureSessionChanged(
            from: previous, to: fixture.composition.session.state, root: blocked)
        #expect(try fixture.read(fixture.device) != nil)
        let failure = try #require(fixture.composition.errorPresenter.recentErrors.entries.first)
        #expect(failure.error.code == "ios.trips.capture.draft_removal_failed")
        #expect(failure.error.message == "Saved capture drafts could not be removed.")
        #expect(fixture.composition.errorPresenter.banner == nil)
    }

    @Test("replacement preserves both quarantined A and the current B namespace")
    internal func replacement() async throws {
        let fixture = try CaptureLifecycleFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        try fixture.seed(fixture.device)
        let previous = fixture.composition.session.state
        let next = PairedDevice(
            id: fixture.device.id, baseURL: fixture.device.baseURL, credentialRevision: 2)
        try fixture.identity.saveSnapshot(PairedDeviceSnapshot(revision: 2, device: next))
        fixture.composition.session.send(.paired(next))
        try fixture.seed(next)
        await fixture.composition.captureSessionChanged(
            from: previous, to: .revoked(.revokedByOperator, credentialRevision: 1),
            root: fixture.root)
        #expect(try fixture.read(fixture.device) != nil)
        #expect(try fixture.read(next) != nil)
        #expect(throws: TripCaptureStorageError.ownerChanged) {
            try fixture.composition.tripCaptureDraftStore(for: fixture.device, root: fixture.root)
                .load(tripID: 7)
        }
        #expect(
            try fixture.composition.tripCaptureDraftStore(for: next, root: fixture.root).load(
                tripID: 7) != nil)
    }

    @Test("startup, ordinary refusal, unconfirmed re-pair and mismatched revisions never purge")
    internal func unconfirmedEvents() async throws {
        let fixture = try CaptureLifecycleFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        try fixture.seed(fixture.device)
        let previous = fixture.composition.session.state
        let events: [SessionState] = [
            .unpaired, .revoked(.credentialsRejected, credentialRevision: 1),
            .revoked(.revokedByOperator), .revoked(.revokedByOperator, credentialRevision: 0),
            .revoked(.revokedByOperator, credentialRevision: 1),
        ]
        for event in events {
            await fixture.composition.captureSessionChanged(
                from: previous, to: event, root: fixture.root)
            #expect(try fixture.read(fixture.device) != nil)
        }
        try fixture.identity.saveSnapshot(PairedDeviceSnapshot(revision: 2, device: nil))
        await fixture.composition.captureSessionChanged(
            from: .unpaired, to: .revoked(.revokedByOperator, credentialRevision: 1),
            root: fixture.root)
        #expect(try fixture.read(fixture.device) != nil)
    }
}

@MainActor
private struct CaptureLifecycleFixture {
    let root: URL
    let device: PairedDevice
    let identity: CapturePairingMetadata
    let composition: AppComposition

    init() throws {
        root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        device = PairedDevice(
            id: "capture-device", baseURL: try #require(URL(string: "https://owner.example")),
            credentialRevision: 1)
        identity = CapturePairingMetadata(PairedDeviceSnapshot(revision: 1, device: device))
        composition = AppComposition(
            experience: .trips,
            credentialStore: DeviceCredentialStore(
                keyStore: SecureEnclaveKeyStore(),
                tokenStore: KeychainTokenStore(service: "capture-lifecycle-\(UUID().uuidString)"),
                pairedDeviceStore: identity))
        composition.session.send(.paired(device))
    }

    func state(_ device: PairedDevice) -> TripCaptureDraftState {
        TripCaptureDraftState(
            owner: TripCaptureDraftOwner(device: device), tripID: 7,
            input: TripCaptureInput(originalText: "Unsent"), pending: nil, result: nil, receipts: []
        )
    }

    func seed(_ device: PairedDevice) throws {
        try composition.tripCaptureDraftStore(for: device, root: root).replace(
            state(device), replacing: nil)
    }

    func read(_ device: PairedDevice) throws -> TripCaptureDraftState? {
        try ProtectedTripCaptureDraftStore(
            owner: TripCaptureDraftOwner(device: device), root: { root }, isCurrent: { true }
        ).load(tripID: 7)
    }
}

private final class CapturePairingMetadata: PairedDeviceStore {
    private let snapshot: Mutex<PairedDeviceSnapshot?>
    init(_ snapshot: PairedDeviceSnapshot) { self.snapshot = Mutex(snapshot) }
    func loadSnapshot() throws -> PairedDeviceSnapshot? { snapshot.withLock { $0 } }
    func saveSnapshot(_ snapshot: PairedDeviceSnapshot) throws {
        self.snapshot.withLock { $0 = snapshot }
    }
}
