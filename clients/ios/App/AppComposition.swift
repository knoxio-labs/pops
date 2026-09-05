import AppCore
import Auth
import BFMClient
import Foundation

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

    /// The pairing screen's dependencies. Everything that speaks to a BFM is
    /// left unbound rather than pointed at a client: the base URL arrives with
    /// the pairing code, so there is nothing to point one at yet, and a screen
    /// that could read transactions or upload a receipt before the device is
    /// paired is a screen that should not exist.
    internal let pairingDependencies: AppDependencies

    private let credentialStore: DeviceCredentialStore
    private let authenticated: @Sendable (PairedDevice) -> BFMHTTPClient

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

    internal init(credentialStore: DeviceCredentialStore = .live()) {
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
            accounts: BFMAccountsRepository(client: authenticated(device))
        )
        bound = (device, dependencies)
        return dependencies
    }

    /// What to prefill the pairing form's server field with.
    ///
    /// `nil` in Release, which is the normal state and not a failure: the base
    /// URL arrives with the pairing code. Debug bakes in a local default so
    /// simulator work does not have to pair against a real deployment first.
    internal var suggestedBaseURL: URL? { BuiltInBaseURL.current }
}
