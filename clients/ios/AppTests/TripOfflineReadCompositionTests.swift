import AppCore
import Auth
import Foundation
import Synchronization
import Testing

@testable import Pops

@Suite("Offline Trip read composition ownership")
@MainActor
internal struct TripOfflineReadCompositionTests {
    @Test(
        "the existing session observation retires A synchronously even when B→A coalesces before rendering"
    )
    internal func observedABA() throws {
        let fixture = try OfflineCompositionFixture()
        defer { fixture.disk.remove() }
        let reader = fixture.reader()
        #expect(try reader.selectedTripID() == 7)
        let other = PairedDevice(
            id: fixture.device.id, baseURL: try #require(URL(string: "https://other.example")),
            credentialRevision: fixture.device.credentialRevision)
        fixture.composition.session.send(.paired(other))
        fixture.composition.session.send(.paired(fixture.device))
        #expect(fixture.composition.session.state == .paired(fixture.device))
        #expect(throws: TripDocumentOfflineError.ownerChanged) { try reader.selectedTripID() }
        #expect(try fixture.reader().selectedTripID() == 7)
    }

    @Test("persisted pairing replacement and confirmed revocation refuse the old cache")
    internal func revoked() throws {
        let fixture = try OfflineCompositionFixture()
        defer { fixture.disk.remove() }
        let reader = fixture.reader()
        try fixture.metadata.saveSnapshot(
            PairedDeviceSnapshot(revision: fixture.device.credentialRevision + 1, device: nil))
        #expect(throws: TripDocumentOfflineError.ownerChanged) { try reader.selectedTripID() }
        fixture.composition.session.send(
            .revoked(.revokedByOperator, ifCredentialRevision: fixture.device.credentialRevision))
        #expect(throws: TripDocumentOfflineError.ownerChanged) {
            try fixture.reader().selectedTripID()
        }
        #expect(try fixture.disk.store().loadNavigation() != nil)
    }

    @Test("unchanged pairing metadata and view retirement have independent lifetimes")
    internal func viewLifetime() throws {
        let fixture = try OfflineCompositionFixture()
        defer { fixture.disk.remove() }
        let reader = fixture.reader()
        try fixture.metadata.saveSnapshot(
            PairedDeviceSnapshot(
                revision: fixture.device.credentialRevision, device: fixture.device))
        #expect(try reader.selectedTripID() == 7)
        reader.retire()
        #expect(throws: TripDocumentOfflineError.ownerChanged) { try reader.selectedTripID() }
        #expect(try fixture.reader().selectedTripID() == 7)
    }
}

@MainActor
private struct OfflineCompositionFixture {
    let disk: TripDocumentOfflineFixture
    let device: PairedDevice
    let metadata: OfflinePairingMetadata
    let composition: AppComposition

    init() throws {
        disk = try TripDocumentOfflineFixture()
        device = PairedDevice(
            id: disk.current.deviceID, baseURL: disk.current.baseURL,
            credentialRevision: disk.current.credentialRevision)
        metadata = OfflinePairingMetadata(
            PairedDeviceSnapshot(revision: device.credentialRevision, device: device))
        composition = AppComposition(
            experience: .trips,
            credentialStore: DeviceCredentialStore(
                keyStore: SecureEnclaveKeyStore(),
                tokenStore: KeychainTokenStore(service: "offline-read-\(UUID().uuidString)"),
                pairedDeviceStore: metadata))
        composition.session.send(.paired(device))
        try disk.store().replaceNavigation(disk.navigation(), replacing: nil)
    }

    func reader() -> TripOfflineReadCoordinator {
        composition.tripOfflineReads(for: device, root: disk.root)
    }
}

private final class OfflinePairingMetadata: PairedDeviceStore {
    private let snapshot: Mutex<PairedDeviceSnapshot?>
    init(_ snapshot: PairedDeviceSnapshot) { self.snapshot = Mutex(snapshot) }
    func loadSnapshot() throws -> PairedDeviceSnapshot? { snapshot.withLock { $0 } }
    func saveSnapshot(_ snapshot: PairedDeviceSnapshot) throws {
        self.snapshot.withLock { $0 = snapshot }
    }
}
