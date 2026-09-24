import AppCore
import Auth
import BFMClient
import FeatureInventory
import FeaturePurchases
import Foundation
import InventoryReplica
import os

/// The composition root: the one place a protocol is bound to a concrete type,
/// and the only module that knows every other module exists.
///
/// Everything above this file reads a seam from `AppCore` and cannot name what
/// is behind it. That is what makes a feature runnable against fakes and a
/// transport replaceable in one place — and it only holds while this file is
/// the only one doing the binding.
///
/// ## Why some of it is a factory
///
/// A device learns where its BFM is by pairing: the QR carries the base URL
/// alongside the code, and a Release build ships no hostname at all. So there
/// is no client to construct at launch, and the objects that need one —
/// everything reaching `/mobile/*` — are built per paired device instead of
/// held. What *can* be built once is built once: the credential store, the
/// refresher that single-flights token rotation, and the middleware that
/// attaches a token, none of which know a base URL until they are handed one.
///
/// ## Why it is a class
///
/// A `final class` held in one `@State`, because a SwiftUI view's
/// stored-property initialisers run on every rebuild and only the first result
/// is kept. As a value type this would construct and discard a session store, a
/// refresher and a credential store on every pass, and `dependencies(for:)`
/// would build a fresh HTTP client every time a body was evaluated.
@MainActor
internal final class AppComposition {
    internal let session: SessionStore
    internal let shell: AppShellModel
    /// The process-wide network path shared by network-aware features.
    internal let networkReachability = NetworkPathReachability()

    /// Where a scanned or opened ``PopsURI`` resolves to a screen.
    ///
    /// One instance for the life of the process, held here rather than built
    /// where it is used, for the same reason ``router(for:)`` is: a fresh
    /// registry on every body evaluation would forget every feature's
    /// registration between renders. Inventory's items and places are
    /// registered in `init`; every other reference is the approved hand-off,
    /// which is correct: a code this build cannot show should say so, not
    /// silently do nothing.
    internal let entityRouter: EntityRouter = EntityRouterRegistry()

    /// What a routed reference asked to open, for `ContentView` to present.
    internal let entityPresentation = EntityPresentation()

    /// The pairing screen's dependencies. Everything that speaks to a BFM is
    /// left unbound rather than pointed at a client: the base URL arrives with
    /// the pairing code, so there is nothing to point one at yet, and a screen
    /// that could read transactions or upload a receipt before the device is
    /// paired is a screen that should not exist.
    internal let pairingDependencies: AppDependencies

    private let credentialStore: DeviceCredentialStore
    private let authenticated: @Sendable (PairedDevice) -> BFMHTTPClient
    private let openInventoryReplica: (PairedDevice) throws -> InventoryReplica
    private let backgroundRefresh: BackgroundRefresh
    private let firstUnlock: FirstUnlockProbe
    /// Refreshes the bound device's Inventory and waits for its log to be
    /// sent, for a background refresh; `nil` until a device is bound.
    private var synchronizeInventory: (@Sendable () async -> Void)?

    /// One navigation path per feature, since each draws its own
    /// `NavigationStack`.
    ///
    /// Held here rather than created where they are used, because a `Router()`
    /// written inside a view's body is a new one on every re-render: the
    /// screen that captured the first keeps sending taps to it while the
    /// `NavigationStack` renders another, and the path changes with nothing
    /// moving on screen. One instance per feature, for the life of the process.
    ///
    /// Per feature rather than one shared instance, which is what this was
    /// until a second feature drew a stack (POPS-2848). Two `NavigationStack`s
    /// bound to the same `[Route]` are one stack rendered twice: tapping an
    /// account would push `.accountDetail` onto the transactions tab as well,
    /// and each tab would inherit the other's depth on every switch.
    private var routers: [MobileFeature: Router] = [:]

    /// The router driving one feature's stack, minted on first use.
    internal func router(for feature: MobileFeature) -> Router {
        if let existing = routers[feature] { return existing }
        let created = Router()
        routers[feature] = created
        return created
    }

    /// The last device's dependencies, kept so a body evaluation is free.
    /// One entry, not a cache: the app is paired to one device at a time, and
    /// a re-pair replaces the entry rather than growing it.
    private var bound: BoundDevice?

    /// What was bound for one paired device: its dependencies, and whether
    /// binding them fell back to `StorageFullInventoryStore` — see
    /// ``inventoryStorageFull``.
    private struct BoundDevice {
        let device: PairedDevice
        let dependencies: AppDependencies
        let storageFull: Bool
    }

    /// Whether the bound device's Inventory could not open its replica, so
    /// every write already goes to `StorageFullInventoryStore`. `false`
    /// before any device has been bound.
    internal var inventoryStorageFull: Bool { bound?.storageFull ?? false }

    /// - Parameters:
    ///   - openInventoryReplica: Opens a paired device's Inventory replica.
    ///     The on-disk one under Application Support by default; tests point
    ///     it somewhere disposable, or make it throw.
    ///   - backgroundScheduler: Where the next background refresh is
    ///     requested; `BGTaskScheduler` by default.
    ///   - firstUnlock: Whether the phone has been unlocked since it started;
    ///     a marker under Application Support by default.
    internal init(
        credentialStore: DeviceCredentialStore = .live(),
        openInventoryReplica: @escaping (PairedDevice) throws -> InventoryReplica =
            AppComposition.onDiskInventoryReplica(for:),
        backgroundScheduler: any BackgroundRefreshScheduler = BackgroundTaskRefreshScheduler(),
        firstUnlock: FirstUnlockProbe = AppComposition.applicationSupportFirstUnlockProbe()
    ) {
        let session = SessionStore()
        let refresher = DeviceSessionRefresher(
            credentialStore: credentialStore,
            sessionEvents: session
        )
        // One instance, reused for every base URL. It attaches and refreshes a
        // token and knows nothing about where the request is going; the client
        // wrapped around it is what carries that.
        let middleware = AuthenticatingMiddleware(refresher: refresher)
        let authenticated: @Sendable (PairedDevice) -> BFMHTTPClient = {
            BFMHTTPClient(baseURL: $0.baseURL, middlewares: [middleware])
        }

        self.session = session
        self.credentialStore = credentialStore
        self.authenticated = authenticated
        self.openInventoryReplica = openInventoryReplica
        self.firstUnlock = firstUnlock
        backgroundRefresh = BackgroundRefresh(
            scheduler: backgroundScheduler,
            isUnlockedSinceBoot: { firstUnlock.isUnlockedSinceBoot })
        pairingDependencies = AppDependencies(
            transactions: AppDependencies.unbound.transactions,
            pairing: BFMDevicePairingService(credentialStore: credentialStore),
            reachability: AppDependencies.unbound.reachability,
            receiptCapture: AppDependencies.unbound.receiptCapture,
            purchases: AppDependencies.unbound.purchases,
            merchants: AppDependencies.unbound.merchants,
            accounts: AppDependencies.unbound.accounts
        )
        shell = AppShellModel(
            session: session,
            restorer: DeviceSessionRestorer(credentialStore: credentialStore),
            bootstrapService: { BFMBootstrapService(client: authenticated($0)) },
            renderableFeatures: RootFeature.renderable
        )
        registerEntityRoutes()
    }

    private func registerEntityRoutes() {
        let presentation = entityPresentation
        for type in InventoryEntity.types {
            entityRouter.register(pillar: InventoryEntity.pillar, type: type) { uri in
                presentation.inventory = InventoryEntity(uri)
            }
        }
    }

    /// Everything a paired device's screens may reach. Built per device rather
    /// than at launch, for the reason in this type's note, and kept until the
    /// device changes.
    internal func dependencies(for device: PairedDevice) -> AppDependencies {
        if let bound, bound.device == device { return bound.dependencies }

        var storageFull = false
        let dependencies = AppDependencies(
            transactions: BFMTransactionsRepository(client: authenticated(device)),
            pairing: BFMDevicePairingService(credentialStore: credentialStore),
            reachability: shell,
            receiptCapture: BFMReceiptCaptureRepository(client: authenticated(device)),
            purchases: BFMPurchasesRepository(client: authenticated(device)),
            merchants: BFMMerchantDirectoryRepository(client: authenticated(device)),
            accounts: BFMAccountsRepository(client: authenticated(device)),
            inventory: inventoryStore(for: device, storageFull: &storageFull)
        )
        bound = BoundDevice(device: device, dependencies: dependencies, storageFull: storageFull)
        return dependencies
    }

    /// Universal search's per-pillar providers, read from the same
    /// dependencies a paired screen reads. Purchases is handed
    /// ``networkReachability`` — the one path monitor shared by every
    /// network-aware feature — so it waits out an offline phone the same way
    /// every other BFM read does, rather than each carrying its own.
    internal func searchProviders(for dependencies: AppDependencies) -> (
        inventory: InventorySearchProvider, purchases: PurchasesSearchProvider
    ) {
        let purchases = PurchasesSearchProvider(
            repository: dependencies.purchases, reachability: networkReachability)
        return (InventorySearchProvider(store: dependencies.inventory), purchases)
    }

    /// The paired device's Inventory: a replica of its own on disk, where
    /// every change lands first and is sent to the BFM's relay when the
    /// network allows (`LocalFirstInventoryStore`).
    ///
    /// Opening the replica fails with `InventoryStorageError.full` when the
    /// phone has no room for it. Reading is still possible then, so the
    /// screens get `StorageFullInventoryStore`, whose every write raises
    /// the Storage full interruption, rather than a store that says
    /// Inventory is not available. Any other failure leaves nothing to read
    /// from, and the screens get the unbound store.
    ///
    /// - Parameter storageFull: Set when this falls back to
    ///   `StorageFullInventoryStore`, so ``inventoryStorageFull`` can
    ///   announce it the moment Inventory is entered rather than waiting
    ///   for a write nobody has made yet.
    private func inventoryStore(
        for device: PairedDevice, storageFull: inout Bool
    ) -> any InventoryStore {
        let transport = BFMInventoryTransport(client: authenticated(device))
        synchronizeInventory = nil
        do {
            let store = LocalFirstInventoryStore(
                replica: try openInventoryReplica(device), transport: transport,
                reachability: networkReachability)
            synchronizeInventory = { await store.synchronize() }
            return store
        } catch InventoryStorageError.full {
            storageFull = true
            return StorageFullInventoryStore(transport: transport)
        } catch {
            return UnboundInventoryStore()
        }
    }

    /// Catches the paired device's Inventory up and sends what it holds,
    /// for when the app comes back to the foreground. Nothing while unpaired.
    internal func refreshInventory() async {
        await bound?.dependencies.inventory.refresh()
    }

    /// Records that the app is in the foreground, which means the phone has
    /// been unlocked since it started (``FirstUnlockProbe``).
    internal func noteForeground() {
        try? firstUnlock.markUnlocked()
    }

    /// Asks for the next background refresh, for when the app leaves the
    /// foreground.
    internal func scheduleBackgroundRefresh() async {
        await backgroundRefresh.schedule()
    }

    /// One background refresh (``AppCore/BackgroundRefresh``): schedules the
    /// next, then, if the phone has been unlocked since it started, restores
    /// the paired device, reads Inventory's change feed and sends its log,
    /// within the refresh's budget. Nothing while unpaired.
    @discardableResult
    internal func refreshInventoryInBackground() async -> BackgroundRefreshOutcome {
        await backgroundRefresh.run { [self] in await synchronizeBoundInventory() }
    }

    private func synchronizeBoundInventory() async {
        await shell.restoreSession()
        guard case .paired(let device) = session.state else { return }
        let inventory = dependencies(for: device).inventory
        if let synchronizeInventory {
            await synchronizeInventory()
        } else {
            await inventory.refresh()
        }
    }

    /// The first-unlock marker under Application Support.
    nonisolated internal static func applicationSupportFirstUnlockProbe() -> FirstUnlockProbe {
        FirstUnlockProbe(
            directory: FileManager.default.urls(
                for: .applicationSupportDirectory, in: .userDomainMask
            ).first ?? FileManager.default.temporaryDirectory)
    }

    /// `Application Support/Inventory/<device>`: one replica per paired
    /// device, so a re-pair to another BFM never sends one server's queued
    /// changes to the other.
    nonisolated internal static func onDiskInventoryReplica(for device: PairedDevice) throws
        -> InventoryReplica
    {
        let support = try FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil,
            create: true)
        return try InventoryReplica(
            onDiskAt: support.appendingPathComponent("Inventory", isDirectory: true)
                .appendingPathComponent(inventoryFolderName(for: device), isDirectory: true))
    }

    /// The device id, with anything but letters, digits, `-` and `_`
    /// replaced, so an id can never climb out of `Inventory/` or name a
    /// hidden folder.
    nonisolated internal static func inventoryFolderName(for device: PairedDevice) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_"))
        let name = String(
            device.id.unicodeScalars.map { allowed.contains($0) ? Character($0) : "_" })
        return name.isEmpty ? "_" : name
    }

    /// What to prefill the pairing form's server field with.
    ///
    /// `nil` in Release, which is the normal state and not a failure: the base
    /// URL arrives with the pairing code. Debug bakes in a local default so
    /// simulator work does not have to pair against a real deployment first.
    internal var suggestedBaseURL: URL? { BuiltInBaseURL.current }

    /// Deletes a previously paired device's on-disk replica once its
    /// mutation log holds nothing unsent, and keeps (logging why) any that
    /// still does.
    ///
    /// A re-pair to a different BFM leaves the old device's folder behind —
    /// `onDiskInventoryReplica(for:)` never removes one, only ever adds
    /// another — and nothing in this build reads it again once the app is
    /// paired elsewhere. Deleting it unconditionally would be simpler, but
    /// wrong: a change queued for a server this phone can no longer reach is
    /// a change no other copy of it exists, so this only ever prunes a
    /// folder whose log is already empty of anything still owed to a server.
    ///
    /// - Parameter root: The `Inventory/` folder to scan. The real one under
    ///   Application Support by default; a test points it somewhere
    ///   disposable.
    nonisolated internal static func pruneStaleInventoryReplicas(
        keeping current: PairedDevice, root: URL? = nil
    ) {
        guard let inventoryRoot = root ?? applicationSupportInventoryRoot() else { return }
        let keep = inventoryFolderName(for: current)
        guard
            let siblings = try? FileManager.default.contentsOfDirectory(
                at: inventoryRoot, includingPropertiesForKeys: [.isDirectoryKey])
        else { return }

        for folder in siblings where folder.lastPathComponent != keep {
            guard
                (try? folder.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory ?? false
            else { continue }
            pruneReplica(at: folder)
        }
    }

    nonisolated private static func applicationSupportInventoryRoot() -> URL? {
        guard
            let support = try? FileManager.default.url(
                for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil,
                create: true)
        else { return nil }
        return support.appendingPathComponent("Inventory", isDirectory: true)
    }

    /// Removes `folder` if the replica in it has nothing left to send, or
    /// keeps it and logs why. Opening it fails the same way any other read
    /// of a corrupt or already-full replica would; either way that reads as
    /// "keep", never as "delete a folder this could not actually inspect".
    nonisolated private static func pruneReplica(at folder: URL) {
        guard let replica = try? InventoryReplica(onDiskAt: folder),
            let outbound = try? replica.outboundMutations()
        else { return }
        guard outbound.isEmpty else {
            Self.replicaPruneLog.notice(
                "keeping \(folder.lastPathComponent, privacy: .private): \(outbound.count) mutation(s) still unsent"
            )
            return
        }
        try? FileManager.default.removeItem(at: folder)
    }

    nonisolated private static let replicaPruneLog = Logger(
        subsystem: "com.knoxiolabs.pops", category: "inventory-replica-prune")
}
