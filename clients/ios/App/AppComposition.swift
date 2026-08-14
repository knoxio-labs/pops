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

    /// The pairing screen's dependencies. Transactions is left unbound rather
    /// than pointed at a client: there is no BFM to point it at yet, and a
    /// screen that could read transactions before the device is paired is a
    /// screen that should not exist.
    internal let pairingDependencies: AppDependencies

    private let credentialStore: DeviceCredentialStore
    private let authenticated: @Sendable (PairedDevice) -> BFMHTTPClient

    /// The navigation path the paired app pushes onto.
    ///
    /// Held here rather than created where it is used, because a `Router()`
    /// written inside a view's body is a new one on every re-render: the
    /// screen that captured the first keeps sending taps to it while the
    /// `NavigationStack` renders another, and the path changes with nothing
    /// moving on screen. One instance, for the life of the process.
    internal let router = Router()

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
            receiptCapture: AppDependencies.unbound.receiptCapture
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
            // Left unbound: `BFMClient` has no `POST /mobile/receipts` conformance
            // yet, so there is nothing real to point this at. A screen that reads
            // it fails with `dependencyNotBound` rather than reaching a client that
            // does not exist.
            receiptCapture: AppDependencies.unbound.receiptCapture
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
