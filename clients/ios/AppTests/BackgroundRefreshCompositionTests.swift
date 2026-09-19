import AppCore
import Auth
import Foundation
import InventoryReplica
import Synchronization
import Testing

@testable import Pops

/// Records the refresh requests the composition makes.
private final class RecordingRefreshScheduler: BackgroundRefreshScheduler {
    private let identifiers = Mutex<[String]>([])

    var requested: [String] { identifiers.withLock { $0 } }

    func submitRefresh(identifier: String, earliestBeginDate: Date) throws {
        identifiers.withLock { $0.append(identifier) }
    }
}

/// How the composition root answers a background refresh (POPS-4076).
/// Here rather than in a package because `App/` is in no package; the
/// refresh's own rules are `AppCore`'s `BackgroundRefreshTests`.
@Suite("Background refresh composition")
@MainActor
internal struct BackgroundRefreshCompositionTests {
    private static let namespace = "com.knoxiolabs.pops.tests.background-refresh"

    private func composition(
        scheduler: RecordingRefreshScheduler, probeDirectory: URL
    ) -> AppComposition {
        AppComposition(
            credentialStore: DeviceCredentialStore(
                keyStore: SecureEnclaveKeyStore(),
                tokenStore: KeychainTokenStore(service: Self.namespace),
                pairedDeviceStore: UserDefaultsPairedDeviceStore(suiteName: Self.namespace)
            ),
            openInventoryReplica: { _ in try InventoryReplica() },
            backgroundScheduler: scheduler,
            firstUnlock: FirstUnlockProbe(directory: probeDirectory))
    }

    private func temporaryDirectory() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent(
            "BackgroundRefreshCompositionTests-\(UUID().uuidString)", isDirectory: true)
    }

    @Test("leaving the foreground asks for the Inventory refresh")
    func backgroundSchedules() {
        let scheduler = RecordingRefreshScheduler()
        let directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }

        composition(scheduler: scheduler, probeDirectory: directory).scheduleBackgroundRefresh()

        #expect(scheduler.requested == [BackgroundRefresh.inventoryIdentifier])
    }

    @Test("before the phone has been unlocked, a refresh reschedules and touches nothing")
    func lockedSinceBootDoesNothing() async {
        let scheduler = RecordingRefreshScheduler()
        let directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let root = composition(scheduler: scheduler, probeDirectory: directory)

        #expect(await root.refreshInventoryInBackground() == .lockedSinceBoot)
        #expect(scheduler.requested == [BackgroundRefresh.inventoryIdentifier])
        #expect(root.shell.destination == .launching)
    }

    @Test("after a foreground, an unpaired refresh completes with nothing to do")
    func unpairedCompletes() async {
        let scheduler = RecordingRefreshScheduler()
        let directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let root = composition(scheduler: scheduler, probeDirectory: directory)
        root.noteForeground()

        #expect(await root.refreshInventoryInBackground() == .completed)
        #expect(scheduler.requested == [BackgroundRefresh.inventoryIdentifier])
        guard case .unpaired = root.session.state else {
            Issue.record("expected no paired device, got \(root.session.state)")
            return
        }
    }
}
