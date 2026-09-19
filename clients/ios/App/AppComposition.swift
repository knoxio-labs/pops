import AppCore
import Auth
import BFMClient
import FeatureInventory
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
    private var bound: (device: PairedDevice, dependencies: AppDependencies)?

    /// - Parameter openInventoryReplica: Opens a paired device's Inventory
    ///   replica. The on-disk one under Application Support by default;
    ///   tests point it somewhere disposable, or make it throw.
    internal init(
        credentialStore: DeviceCredentialStore = .live(),
        openInventoryReplica: @escaping (PairedDevice) throws -> InventoryReplica =
            AppComposition.onDiskInventoryReplica(for:)
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
        pairingDependencies = AppDependencies(
            transactions: AppDependencies.unbound.transactions,
            pairing: BFMDevicePairingService(credentialStore: credentialStore),
            reachability: AppDependencies.unbound.reachability,
            receiptCapture: AppDependencies.unbound.receiptCapture,
            purchases: AppDependencies.unbound.purchases,
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

        let dependencies = AppDependencies(
            transactions: BFMTransactionsRepository(client: authenticated(device)),
            pairing: BFMDevicePairingService(credentialStore: credentialStore),
            reachability: shell,
            receiptCapture: BFMReceiptCaptureRepository(client: authenticated(device)),
            purchases: BFMPurchasesRepository(client: authenticated(device)),
            accounts: BFMAccountsRepository(client: authenticated(device)),
            inventory: inventoryStore(for: device)
        )
        bound = (device, dependencies)
        return dependencies
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
    private func inventoryStore(for device: PairedDevice) -> any InventoryStore {
        let transport = BFMInventoryTransport(client: authenticated(device))
        do {
            return LocalFirstInventoryStore(
                replica: try openInventoryReplica(device), transport: transport,
                reachability: NetworkPathReachability())
        } catch InventoryStorageError.full {
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
}
