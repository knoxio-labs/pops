import AppCore
import AppCoreFakes

/// A shell wired to fakes, with the two knobs every suite below turns: what the
/// device left behind, and what the BFM says when asked.
@MainActor
internal struct AppShellFixture {
    internal let session: SessionStore
    internal let bootstrap: FakeBootstrapService
    internal let model: AppShellModel

    /// - Parameters:
    ///   - restored: What a cold launch finds.
    ///   - bootstrap: What the BFM answers.
    ///   - renderable: The screens this "build" contains. Defaulted to the one
    ///     the app really has, and overridden by the suites that are about the
    ///     intersection rather than about a particular feature.
    internal init(
        restored: SessionState = .unpaired,
        bootstrap: FakeBootstrapService = FakeBootstrapService(),
        renderable: [MobileFeature] = [.transactions]
    ) {
        let session = SessionStore()
        self.session = session
        self.bootstrap = bootstrap
        model = AppShellModel(
            session: session,
            restorer: FakeSessionRestorer(restored),
            bootstrapService: { _ in bootstrap },
            renderableFeatures: renderable
        )
    }

    /// The launch sequence the root view drives, in the order it drives it.
    internal func launch() async {
        await model.restoreSession()
        await model.loadBootstrap()
    }

    internal var destination: RootDestination { model.destination }

    /// The content surface, or `nil` when the app is not showing content —
    /// which is itself the assertion in several tests below.
    internal var surface: FeatureSurface? {
        guard case .content(let surface) = model.destination else { return nil }
        return surface
    }
}
