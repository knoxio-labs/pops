import AVFoundation
import Foundation

/// Whether this app may open the camera, in the four states that lead to four
/// different screens.
///
/// ``restricted`` is kept apart from ``denied`` because the recovery differs and
/// telling someone to change a setting they are not allowed to change is worse
/// than saying nothing. ``unavailable`` exists because a simulator or a device
/// with no camera would otherwise present a scanner showing black forever.
public enum CameraAccess: Hashable, Sendable {
    /// Nobody has been asked yet.
    case notDetermined
    case authorized
    /// The person said no. Settings can undo it.
    case denied
    /// A profile or Screen Time policy said no. Settings cannot undo it.
    case restricted
    /// There is no camera to authorise.
    case unavailable
}

/// The camera permission decision, as a seam.
///
/// A protocol rather than direct `AVCaptureDevice` calls because "denied" is a
/// first-class screen in this flow and has to be reachable from a test. There
/// is no way to put a real `AVCaptureDevice` into that state from a test
/// process, and the system prompt cannot be answered by one either.
public protocol CameraAuthorizing: Sendable {
    /// The standing decision. Does not prompt.
    func currentAccess() -> CameraAccess

    /// Prompts if nobody has been asked, and reports the decision either way.
    /// Calling it when the answer is already known simply returns the answer.
    func requestAccess() async -> CameraAccess
}

/// The real one.
public struct SystemCameraAuthorization: CameraAuthorizing {
    public init() {}

    public func currentAccess() -> CameraAccess {
        guard AVCaptureDevice.default(for: .video) != nil else { return .unavailable }
        return Self.access(for: AVCaptureDevice.authorizationStatus(for: .video))
    }

    public func requestAccess() async -> CameraAccess {
        let standing = currentAccess()
        // Only `.notDetermined` produces a prompt; asking again in any other
        // state returns the same answer without showing anything, so this guard
        // is about intent rather than behaviour — a caller reading this should
        // see that a second call cannot re-prompt someone who already declined.
        guard standing == .notDetermined else { return standing }

        _ = await AVCaptureDevice.requestAccess(for: .video)
        return currentAccess()
    }

    private static func access(for status: AVAuthorizationStatus) -> CameraAccess {
        switch status {
        case .authorized: .authorized
        case .denied: .denied
        case .restricted: .restricted
        case .notDetermined: .notDetermined
        // A status this SDK does not know is treated as a refusal. The manual
        // path is always available, so guessing "authorized" would trade a
        // working fallback for a scanner that may never produce a frame.
        @unknown default: .denied
        }
    }
}
