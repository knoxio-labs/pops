import AppCore
import Auth
import BFMClient
import Foundation
import Testing

@testable import Pops

/// What the composition root actually binds.
///
/// It lives here because `App/` is in no package, so this is the only test
/// target that can name it. Everything below is a claim about wiring that the
/// type system does not make: `AppDependencies` holds existentials, so a root
/// that bound the unbound stub everywhere would compile, build, launch, and
/// show an error state on every screen.
///
/// The doubles at the bottom of this file are written here rather than taken
/// from `AppCoreFakes`. Linking that product would pull a **second** copy of
/// `AppCore` into this bundle alongside the one the host app already links, and
/// the two copies' types are not the same type — which surfaces as an
/// expectation failing with the message that `.dependencyNotBound` is not equal
/// to `.dependencyNotBound`.
@Suite("Composition root")
@MainActor
internal struct CompositionRootTests {
    private func composition() -> AppComposition {
        AppComposition(
            credentialStore: DeviceCredentialStore(
                keyStore: SecureEnclaveKeyStore(),
                tokenStore: KeychainTokenStore(service: Self.namespace),
                pairedDeviceStore: UserDefaultsPairedDeviceStore(suiteName: Self.namespace)
            )
        )
    }

    /// Every seam that speaks to a BFM, not just the first one that did.
    ///
    /// `receiptCapture` is named here because it was the seam left bound to the
    /// unbound stub for as long as no client could satisfy it, with a comment
    /// giving the reason — and a comment is not something anybody re-reads when
    /// the reason expires. Asserting it makes the next change to this
    /// initialiser a test failure instead.
    @Test("a paired device gets repositories that speak to its own BFM")
    func pairedDependenciesAreReal() throws {
        let bound = composition().dependencies(for: try device())

        #expect(bound.transactions is BFMTransactionsRepository)
        #expect(bound.pairing is BFMDevicePairingService)
        #expect(bound.receiptCapture is BFMReceiptCaptureRepository)
    }

    /// Pairing is bound before there is a BFM to bind anything else to — the
    /// base URL arrives with the code — so reading transactions or uploading a
    /// receipt from the pairing screen is a mistake this leaves unbound rather
    /// than papering over with a client pointed nowhere.
    @Test("the pairing screen can pair, and can reach nothing else")
    func pairingDependenciesBindOnlyPairing() async {
        let unpaired = composition().pairingDependencies

        #expect(unpaired.pairing is BFMDevicePairingService)
        #expect(!(unpaired.transactions is BFMTransactionsRepository))
        #expect(!(unpaired.receiptCapture is BFMReceiptCaptureRepository))
        await #expect(throws: RepositoryError.dependencyNotBound) {
            try await unpaired.transactions.transactions(after: nil)
        }
        await #expect(throws: RepositoryError.dependencyNotBound) {
            _ = try await unpaired.receiptCapture.capture([])
        }
    }

    /// A launch reads storage before it draws anything. This asserts the root
    /// starts there rather than at pairing, which is the difference between a
    /// paired device opening on its content and opening on a screen it has
    /// already used.
    @Test("the app draws nothing until the device's own storage has been read")
    func launchesBeforeRestoring() {
        #expect(composition().shell.destination == .launching)
    }

    /// The whole point of `GET /mobile/bootstrap`, asserted against the app's
    /// real renderable list rather than one a test invented: this build can
    /// draw transactions and would like to, and the server's answer is what
    /// decides.
    @Test("what the app offers comes from the BFM, not from this build")
    func featureListComesFromTheServer() async throws {
        let withheld = FeatureAvailability(id: .transactions, reachability: .unavailable)
        let shell = AppShellModel(
            session: SessionStore(),
            restorer: RestoringTo(.paired(try device())),
            bootstrapService: { _ in
                AnsweringWith(
                    BootstrapSnapshot(
                        device: BootstrapDevice(id: "d", name: "n", lastSeenAt: .now),
                        registrySource: .fresh,
                        features: [withheld]
                    )
                )
            },
            renderableFeatures: RootFeature.renderable
        )

        await shell.restoreSession()
        await shell.loadBootstrap()

        #expect(
            shell.destination
                == .content(
                    FeatureSurface(
                        available: [],
                        unavailable: [withheld],
                        bootstrap: .answered(.fresh)
                    )
                )
        )
    }

    @Test("this build can draw the transactions feature")
    func renderableListIsNotEmpty() {
        #expect(RootFeature.renderable.contains(.transactions))
    }

    /// `.invalid` is reserved by RFC 6761, so nothing built from this can reach
    /// a host even if something did try to send a request.
    private func device() throws -> PairedDevice {
        PairedDevice(
            id: "device-composition",
            baseURL: try #require(URL(string: "https://bfm.invalid"))
        )
    }

    /// A Keychain service and a defaults suite of this suite's own, so a run
    /// cannot disturb whatever the app itself has stored on the simulator.
    private static let namespace = "com.knoxiolabs.pops.tests.composition"
}

private struct RestoringTo: SessionRestoring {
    private let state: SessionState

    init(_ state: SessionState) { self.state = state }

    func restoredSession() async -> SessionState { state }
}

private struct AnsweringWith: BootstrapService {
    private let snapshot: BootstrapSnapshot

    init(_ snapshot: BootstrapSnapshot) { self.snapshot = snapshot }

    func bootstrap() async throws -> BootstrapSnapshot { snapshot }
}
