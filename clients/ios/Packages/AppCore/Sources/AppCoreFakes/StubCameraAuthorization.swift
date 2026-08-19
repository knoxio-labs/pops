import AppCore
import Synchronization

/// A camera whose answer the test chooses, and which records whether it was
/// asked to prompt.
///
/// The state that matters most — "the person said no" — cannot be reached with
/// a real `AVCaptureDevice` from a test process at all: there is no API to set
/// it and no way to answer the system prompt.
///
/// In `AppCoreFakes` rather than in one feature's test target because both
/// screens that open a camera — pairing's QR scanner and receipt capture — need
/// the same four refusals, and the second copy of this would be the one that
/// stopped matching `CameraAuthorizing`.
public final class StubCameraAuthorization: CameraAuthorizing {
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

    public init(standing: CameraAccess, afterPrompt: CameraAccess? = nil) {
        state = Mutex(State(standing: standing, afterPrompt: afterPrompt ?? standing))
    }

    /// Settable, so a test can model the decision changing while the app was in
    /// Settings.
    public var standing: CameraAccess {
        get { state.withLock(\.standing) }
        set { state.withLock { $0.standing = newValue } }
    }

    public var promptCount: Int { state.withLock(\.promptCount) }

    public func currentAccess() -> CameraAccess { standing }

    public func requestAccess() async -> CameraAccess {
        state.withLock {
            $0.promptCount += 1
            $0.standing = $0.afterPrompt
            return $0.afterPrompt
        }
    }
}
