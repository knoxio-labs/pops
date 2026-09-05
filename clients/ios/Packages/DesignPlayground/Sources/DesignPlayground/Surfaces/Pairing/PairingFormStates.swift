import FeaturePairing

/// The form before any attempt: untouched, ready, and the three camera
/// refusals.
///
/// `CameraAccess.notDetermined` is not its own row here. `PairingView` renders
/// it identically to `.authorized` — both show the scan button — so a second
/// state would repeat the first pixel for pixel and call it coverage.
@MainActor
internal enum PairingFormStates {
    internal static let all: [DesignState] = [
        DesignState.standard {
            PairingView(model: PairingSurfaceFactory.model())
        },
        DesignState("ready", "Ready to submit") {
            PairingView(
                model: PairingSurfaceFactory.model(
                    baseURLText: PairingSurfaceFactory.readyBaseURL,
                    codeText: PairingSurfaceFactory.readyCode
                )
            )
        },
        DesignState("camera-denied", "Camera denied") {
            PairingView(model: PairingSurfaceFactory.model(camera: .denied))
        },
        DesignState("camera-restricted", "Camera restricted") {
            PairingView(model: PairingSurfaceFactory.model(camera: .restricted))
        },
        DesignState("camera-unavailable", "No camera on this device") {
            PairingView(model: PairingSurfaceFactory.model(camera: .unavailable))
        },
    ]
}
