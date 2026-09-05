import AppCore
import FeaturePairing

/// Builds a ``PairingViewModel`` wired entirely to this file's stand-ins.
///
/// `AppDependencies.unbound` supplies every dependency but `pairing` itself —
/// `transactions`, `receiptCapture`, `purchases` and `accounts` are read but
/// never called from this screen, so their `dependencyNotBound` failure mode
/// is unreachable here and needs no stand-in of its own.
@MainActor
internal enum PairingSurfaceFactory {
    /// A base URL and code that together satisfy `PairingViewModel`'s own
    /// validation, so a state built from them can call `pair()` immediately
    /// instead of stalling on "nothing was typed yet".
    internal static let readyBaseURL = "https://bfm.example.com"
    internal static let readyCode = "7QK4-9M2X-P3ND"

    internal static func model(
        camera: CameraAccess = .authorized,
        outcome: PlaygroundPairingService.Outcome = .hangs,
        baseURLText: String = "",
        codeText: String = ""
    ) -> PairingViewModel {
        let model = PairingViewModel(
            session: SessionStore(),
            dependencies: AppDependencies(
                transactions: AppDependencies.unbound.transactions,
                pairing: PlaygroundPairingService(outcome: outcome),
                reachability: AppDependencies.unbound.reachability,
                receiptCapture: AppDependencies.unbound.receiptCapture,
                purchases: AppDependencies.unbound.purchases,
                accounts: AppDependencies.unbound.accounts
            ),
            camera: PlaygroundCameraAuthorization(access: camera),
            device: PlaygroundDeviceDescription()
        )
        model.baseURLText = baseURLText
        model.codeText = codeText
        return model
    }

    /// A model already filled with ``readyBaseURL`` and ``readyCode``, for a
    /// state whose whole point is what happens once `pair()` is called.
    internal static func readyModel(outcome: PlaygroundPairingService.Outcome) -> PairingViewModel {
        model(outcome: outcome, baseURLText: readyBaseURL, codeText: readyCode)
    }
}
