import AppCore
import Auth
import BFMClient
import FeatureInventory
import FeaturePurchases
import Foundation
import InventoryReplica

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

    internal let credentialStore: DeviceCredentialStore
    internal let authenticated: @Sendable (PairedDevice) -> BFMHTTPClient
    internal let openInventoryReplica: (PairedDevice) throws -> InventoryReplica
    internal let backgroundRefresh: BackgroundRefresh
    internal let firstUnlock: FirstUnlockProbe
    /// Refreshes the bound device's Inventory and waits for its log to be
    /// sent, for a background refresh; `nil` until a device is bound.
    internal var synchronizeInventory: (@Sendable () async -> Void)?

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
    internal var bound: BoundDevice?

    /// What was bound for one paired device: its dependencies, and whether
    /// binding them fell back to `StorageFullInventoryStore` — see
    /// ``inventoryStorageFull``.
    internal struct BoundDevice {
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
        let inventoryTransport = BFMInventoryTransport(client: authenticated(device))
        let dependencies = AppDependencies(
            transactions: BFMTransactionsRepository(client: authenticated(device)),
            pairing: BFMDevicePairingService(credentialStore: credentialStore),
            reachability: shell,
            receiptCapture: BFMReceiptCaptureRepository(client: authenticated(device)),
            purchases: BFMPurchasesRepository(client: authenticated(device)),
            merchants: BFMMerchantDirectoryRepository(client: authenticated(device)),
            accounts: BFMAccountsRepository(client: authenticated(device)),
            inventory: inventoryStore(
                for: device, transport: inventoryTransport, storageFull: &storageFull),
            codeSuggestions: inventoryTransport,
            barcodeLookup: inventoryTransport
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
}
