import AppCore
import FeaturePairing

/// The pairing seam's playground stand-in.
///
/// `AppCoreFakes` is test-only — `ModuleBoundaryTests.fakesAreTestOnly` fails
/// the build for any `Sources` file that names it — so a surface that wants
/// to drive `PairingViewModel` through a real attempt writes its own
/// conformance. This one never opens a connection: every ``Outcome`` is
/// answered from memory, in-process, the same way ``FeaturePairing``'s own
/// `#Preview`s answer theirs.
internal struct PlaygroundPairingService: DevicePairingService {
    /// What a state wants the attempt to do.
    internal enum Outcome: Sendable {
        case succeeds
        case fails(PairingError)
        /// Never resolves. `PairingViewModel.isPairing` therefore stays true
        /// for as long as the state showing it is on screen, which is what
        /// lets that state be looked at rather than flashed past — the review
        /// dismisses the state, cancelling the `.task` that awaits this, not
        /// the other way around.
        case hangs
    }

    internal let outcome: Outcome

    internal func pair(_ request: PairingRequest) async throws -> PairedDevice {
        switch outcome {
        case .succeeds:
            return PairedDevice(id: "playground-pairing", baseURL: request.baseURL)
        case .fails(let error):
            throw error
        case .hangs:
            try await Task.sleep(for: .seconds(3_600))
            return PairedDevice(id: "playground-pairing", baseURL: request.baseURL)
        }
    }
}

/// The camera-permission seam's stand-in: a fixed decision, answered without
/// ever touching `AVCaptureDevice`. This is the whole of how the camera-denied
/// and no-camera states are reviewable on a Mac that has never had a camera
/// permission to ask for.
internal struct PlaygroundCameraAuthorization: CameraAuthorizing {
    internal let access: CameraAccess

    internal func currentAccess() -> CameraAccess { access }

    internal func requestAccess() async -> CameraAccess { access }
}

/// The device-description seam's stand-in. Fixed rather than read off
/// whatever machine is running the review, so the device-name field looks the
/// same to everyone looking at it.
internal struct PlaygroundDeviceDescription: DeviceDescribing {
    @MainActor internal var suggestedName: String { "Design Review iPhone" }

    internal var modelIdentifier: String { "iPhone17,1" }
}
