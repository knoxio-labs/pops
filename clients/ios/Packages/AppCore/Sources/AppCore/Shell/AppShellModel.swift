import Observation

/// The root's whole decision surface: which of three screens the app is on, and
/// what the paired one contains.
///
/// ## What it is holding together
///
/// Three inputs, none of which the view may reach for itself. The session,
/// which `Auth` moves from whatever executor a `403` arrived on. What the
/// device left behind at the last launch. And what the BFM says is reachable
/// right now, which is the whole reason ``BootstrapService`` exists — the app
/// renders what the server says is available and carries no compiled-in idea of
/// what the federation contains.
///
/// It does carry a compiled-in idea of what it can *draw*, and that is not the
/// same thing. ``renderableFeatures`` is the set of screens that exist in this
/// binary; the BFM decides which of them are worth opening. A feature the
/// server names and this build has never heard of is skipped, and a feature
/// this build can draw that the server does not mention is not shown.
///
/// ## Why the surface is optimistic
///
/// Bootstrap does not gate the launch. The surface starts as "everything this
/// build can draw", marked ``BootstrapPhase/pending``, and is narrowed when the
/// answer lands. Blocking on it would mean the app does not open until a status
/// call completes — and a status call that never completes is bounded only by a
/// URL session timeout, which is a minute of nothing on a bad connection.
///
/// The transitional wrongness is small in the one case it can be seen: a
/// feature the BFM is about to report as unavailable is unavailable because the
/// pillar behind it is down, so its screen is showing its own loading state for
/// the same second, and is replaced by an explanation rather than by a blank.
@MainActor
@Observable
public final class AppShellModel {
    /// The session every other module writes to. Held rather than mirrored:
    /// `Auth` already has the only reference that matters, and a second copy of
    /// this state is a second thing that can be wrong.
    public let session: SessionStore

    private let restorer: any SessionRestoring
    private let bootstrapService: @Sendable (PairedDevice) -> any BootstrapService
    private let renderableFeatures: [MobileFeature]

    private var hasRestored = false
    private var phase: BootstrapPhase = .pending
    private var snapshot: BootstrapSnapshot?

    /// The device a bootstrap has been asked about. What makes
    /// ``loadBootstrap()`` once-per-device however often a view lifecycle
    /// calls it.
    private var requestedFor: PairedDevice?

    /// Whether a call is in flight. Written before the first `await`, which on
    /// this actor makes it a mutex: two tasks racing cannot both ask.
    private var isAsking = false

    /// - Parameters:
    ///   - session: The one the rest of the app already writes to.
    ///   - restorer: What the device left behind. Read once, at launch.
    ///   - bootstrapService: Built per device rather than held, because the
    ///     base URL arrives with the pairing code — there is no BFM to call
    ///     before the session says which one.
    ///   - renderableFeatures: The screens this binary contains, in the order
    ///     to fall back to before the BFM has said anything. Supplied by the
    ///     composition root, which is the only thing that knows what views
    ///     exist.
    public init(
        session: SessionStore,
        restorer: any SessionRestoring,
        bootstrapService: @escaping @Sendable (PairedDevice) -> any BootstrapService,
        renderableFeatures: [MobileFeature]
    ) {
        self.session = session
        self.restorer = restorer
        self.bootstrapService = bootstrapService
        self.renderableFeatures = renderableFeatures
    }

    /// What the root view draws.
    public var destination: RootDestination {
        guard hasRestored else { return .launching }

        switch session.state {
        case .unpaired:
            return .pairing(nil)
        case .revoked(let reason):
            return .pairing(reason)
        case .paired:
            return .content(surface)
        }
    }
}

extension AppShellModel {
    /// Reads the stored session, once per process.
    ///
    /// Everything before this returns is ``RootDestination/launching``, so a
    /// device with valid credentials never sees the pairing screen — which is
    /// the point, and is why this does not go near the network.
    public func restoreSession() async {
        guard !hasRestored else { return }

        if case .paired(let device) = await restorer.restoredSession() {
            session.send(.paired(device))
        }
        hasRestored = true
    }

    /// Asks the BFM what to show, once per device.
    ///
    /// Safe to call as often as a view lifecycle wants to: a second call for a
    /// device already asked about does nothing. Driven by the session, so it
    /// runs on the launch that restored a device and again when pairing
    /// produces a different one.
    ///
    /// A cancellation leaves the phase where it was and forgets that the device
    /// was asked about. Nothing was learned, so recording the attempt would
    /// skip every later one for the same device — and the launch's own
    /// `.task(id:)` is cancelled by any change of session, so that is a
    /// reachable way to strand the surface on this build's guess.
    public func loadBootstrap() async {
        guard case .paired(let device) = session.state, requestedFor != device else { return }
        await ask(device)
    }

    /// Asks again, whatever the last answer was.
    ///
    /// The way out of a surface the app cannot leave on its own. A BFM that
    /// reported every feature unavailable leaves a screen with nothing on it,
    /// and the pillar behind that feature coming back is not something the app
    /// finds out about by waiting — nothing on that screen makes a request.
    /// Without this, recovering means force-quitting.
    ///
    /// Driven by a person returning to the app or pressing a button, never by a
    /// timer: the app is usable throughout, and a status call that failed once
    /// is not made more likely to succeed by being repeated on a schedule
    /// against a server that is already unhappy.
    ///
    /// A failed phase resets to ``BootstrapPhase/pending`` so the degraded
    /// notice goes away while the retry is in flight. An answered one does not
    /// — keeping the last answer on screen until a better one arrives is what
    /// stops a foreground from flickering the whole surface.
    public func reloadBootstrap() async {
        guard case .paired(let device) = session.state, !isAsking else { return }
        if case .failed = phase { phase = .pending }
        await ask(device)
    }

    private func ask(_ device: PairedDevice) async {
        guard !isAsking else { return }

        isAsking = true
        requestedFor = device
        defer { isAsking = false }

        do {
            let answered = try await bootstrapService(device).bootstrap()
            guard isStillCurrent(device) else { return }
            snapshot = answered
            phase = .answered(answered.registrySource)
        } catch is CancellationError {
            // Forget the attempt. `requestedFor` is what makes
            // ``loadBootstrap()`` once-per-device, and leaving it set for a
            // call that answered nothing would skip every later one — the
            // surface would stay on this build's guess for as long as the app
            // is on this device.
            if requestedFor == device { requestedFor = nil }
        } catch {
            guard isStillCurrent(device) else { return }
            snapshot = nil
            phase = .failed(RepositoryError.describing(error))
        }
    }

    /// Whether the answer that just arrived is still about the session on
    /// screen. A revocation, or a re-pair to a different BFM, can land while
    /// this call is in flight, and a snapshot describing a device the app no
    /// longer is would decide what a different device shows.
    private func isStillCurrent(_ device: PairedDevice) -> Bool {
        session.state == .paired(device)
    }
}

extension AppShellModel {
    /// What this build can draw, narrowed by what the BFM says is worth
    /// opening.
    ///
    /// The intersection runs in the server's order rather than this build's,
    /// because the order features are offered in is a product decision and the
    /// server is where it is made.
    private var surface: FeatureSurface {
        guard let snapshot else {
            return FeatureSurface(
                available: renderableFeatures,
                unavailable: [],
                bootstrap: phase
            )
        }

        let named = snapshot.features.filter { renderableFeatures.contains($0.id) }
        return FeatureSurface(
            available: named.filter(\.reachability.isUsable).map(\.id),
            unavailable: named.filter { !$0.reachability.isUsable },
            bootstrap: phase
        )
    }
}

extension RepositoryError {
    /// ``BootstrapService`` does not constrain what it throws, so anything
    /// unrecognised becomes ``RepositoryError/transport(_:)`` — a diagnostic,
    /// never something a screen renders verbatim.
    fileprivate static func describing(_ error: any Error) -> RepositoryError {
        error as? RepositoryError ?? .transport(String(describing: error))
    }
}
