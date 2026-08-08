import AppCore
import AppCoreFakes
import Foundation
import Synchronization

@testable import FeaturePairing

/// A camera whose answer the test chooses, and which records whether it was
/// asked to prompt.
///
/// The state that matters most here — "the person said no" — cannot be reached
/// with a real `AVCaptureDevice` from a test process at all: there is no API to
/// set it and no way to answer the system prompt.
internal final class StubCameraAuthorization: CameraAuthorizing {
    /// The standing decision and what a prompt would resolve to, held as one
    /// value so a `Mutex` covers both — the same shape `InMemoryKeyStore` uses,
    /// rather than an `@unchecked Sendable` promise nothing checks.
    ///
    /// They are separate fields because a test needs to model "not determined,
    /// then denied", which is the only sequence a first-run refusal produces.
    private struct State {
        var standing: CameraAccess
        var afterPrompt: CameraAccess
        var promptCount = 0
    }

    private let state: Mutex<State>

    internal init(standing: CameraAccess, afterPrompt: CameraAccess? = nil) {
        state = Mutex(State(standing: standing, afterPrompt: afterPrompt ?? standing))
    }

    /// Settable, so a test can model the decision changing while the app was in
    /// Settings.
    internal var standing: CameraAccess {
        get { state.withLock(\.standing) }
        set { state.withLock { $0.standing = newValue } }
    }

    internal var promptCount: Int { state.withLock(\.promptCount) }

    internal func currentAccess() -> CameraAccess { standing }

    internal func requestAccess() async -> CameraAccess {
        state.withLock {
            $0.promptCount += 1
            $0.standing = $0.afterPrompt
            return $0.afterPrompt
        }
    }
}

internal struct StubDeviceDescription: DeviceDescribing {
    internal var suggestedName = "iPhone"
    internal var modelIdentifier = "iPhone17,1"
}

/// A pairing service that parks mid-call until the test lets it go.
///
/// The only way to observe what the screen does *while* a pairing is in
/// flight — the spinner, and the guard that stops a second tap spending the
/// code twice. Both are actor-serialised, so the handshake is deterministic
/// rather than a sleep.
internal actor GatedPairingService: DevicePairingService {
    internal private(set) var callCount = 0

    private var arrival: CheckedContinuation<Void, Never>?
    private var held: [CheckedContinuation<Void, Never>] = []
    private let result: Result<PairedDevice, PairingError>

    internal init(result: Result<PairedDevice, PairingError> = .success(.fake())) {
        self.result = result
    }

    internal func pair(_ request: PairingRequest) async throws -> PairedDevice {
        callCount += 1
        arrival?.resume()
        arrival = nil
        await withCheckedContinuation { held.append($0) }
        return try result.get()
    }

    /// Returns once ``pair(_:)`` has been entered at least once.
    internal func waitUntilCalled() async {
        guard callCount == 0 else { return }
        await withCheckedContinuation { arrival = $0 }
    }

    internal func release() {
        for continuation in held { continuation.resume() }
        held = []
    }
}
