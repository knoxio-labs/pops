import AppCore
import Foundation
import Observation

/// The pairing screen's whole decision surface.
///
/// The view reads these and renders; it decides nothing. That split is what
/// makes "what does the user see when the BFM is unreachable" a test rather
/// than a thing someone checks by hand on a phone — and it is why no networking
/// type appears here either: this talks to `AppCore`'s ``DevicePairingService``
/// and has no idea whether an HTTP call happened.
@MainActor
@Observable
public final class PairingViewModel {
    /// Bound to the form. Prefilled by a scan, editable by hand — the manual
    /// path is not a separate screen, it is the same fields with nothing in them.
    public var baseURLText: String
    public var codeText = ""
    public var deviceNameText: String

    public private(set) var isPairing = false

    /// The last failure, or `nil`. Deliberately the domain error rather than a
    /// rendered string, so a test asserts which failure happened instead of
    /// asserting on prose that a copy edit would break.
    public private(set) var failure: PairingError?

    public private(set) var cameraAccess: CameraAccess = .notDetermined
    public internal(set) var isScannerPresented = false

    private let pairing: any DevicePairingService
    private let session: SessionStore
    private let camera: any CameraAuthorizing
    private let device: any DeviceDescribing

    /// - Parameters:
    ///   - session: Where a successful pairing is committed. The root view
    ///     switches on it, so this screen never dismisses itself.
    ///   - dependencies: Read for ``DevicePairingService`` and nothing else.
    ///   - camera: The permission decision, injected because "denied" is a
    ///     first-class state that no test process can arrange for real.
    ///   - device: The two fields the pair contract needs about the handset.
    ///   - initialBaseURL: What to put in the server field before anything is
    ///     scanned. Supplied by the composition root rather than read here: the
    ///     only build that has one is Debug, and the value lives in `BFMClient`,
    ///     which a feature may not import.
    public init(
        session: SessionStore,
        dependencies: AppDependencies,
        camera: any CameraAuthorizing = SystemCameraAuthorization(),
        device: any DeviceDescribing = SystemDeviceDescription(),
        initialBaseURL: URL? = nil
    ) {
        self.session = session
        self.pairing = dependencies.pairing
        self.camera = camera
        self.device = device
        baseURLText = initialBaseURL?.absoluteString ?? ""
        deviceNameText = device.suggestedName
    }
}

extension PairingViewModel {
    /// Reads the standing camera decision without prompting, so the screen can
    /// offer the scanner or explain why it cannot before anything is tapped.
    public func refreshCameraAccess() {
        cameraAccess = camera.currentAccess()
    }

    /// Prompts if nobody has been asked, and opens the scanner only if the
    /// answer is yes. A refusal updates ``cameraAccess`` and stops there — the
    /// form underneath is already the fallback, so there is nothing to navigate
    /// to and nothing to apologise for beyond one line of copy.
    public func scanQRCode() async {
        cameraAccess = await camera.requestAccess()
        isScannerPresented = cameraAccess == .authorized
    }

    /// Consumes a scanned payload.
    ///
    /// - Returns: `false` when the payload is not a pairing link, which means
    ///   "keep scanning". A camera pointed at the world sees other QR codes and
    ///   none of them is an error worth showing.
    @discardableResult
    public func didScan(_ payload: String) -> Bool {
        guard let link = PairingLink.parse(payload) else { return false }

        baseURLText = link.baseURL.absoluteString
        codeText = link.code
        failure = nil
        isScannerPresented = false
        return true
    }

    public func dismissScanner() {
        isScannerPresented = false
    }

    /// Generates the key, spends the code and commits the session — or records
    /// why it could not.
    ///
    /// Re-entrant calls are dropped rather than queued. A double tap that
    /// spent the code twice would burn it on the first attempt and be told by
    /// the second that it did not work.
    public func pair() async {
        guard !isPairing, let request = pairingRequest else { return }

        isPairing = true
        failure = nil
        defer { isPairing = false }

        do {
            session.send(.paired(try await pairing.pair(request)))
        } catch let error as PairingError {
            record(error)
        } catch {
            // The protocol's error type is not constrained, so a conforming
            // implementation may throw anything. Everything unrecognised is the
            // same thing to the person holding the phone: it did not work and
            // the server is the suspect.
            record(.unreachable)
        }
    }

    private func record(_ error: PairingError) {
        failure = error
        // A rejected code is spent, unknown or expired — in all three the
        // string in the field is now worthless, and leaving it there invites a
        // retry that cannot succeed. Every other failure leaves it alone,
        // because in every other case retrying the same code is the right move.
        if error == .codeRejected { codeText = "" }
    }
}

extension PairingViewModel {
    public var canSubmit: Bool { !isPairing && pairingRequest != nil }

    /// Which field is holding submission up, or `nil` when nothing is. Drives
    /// the button's accessibility hint; see ``PairingCopy/blockedHint(for:)``.
    internal var submissionProblem: PairingInputProblem? {
        guard PairingField.baseURL(baseURLText) != nil else { return .missingServer }
        guard let code = PairingField.trimmed(codeText) else { return .missingCode }
        guard let name = PairingField.trimmed(deviceNameText) else { return .missingName }
        guard PairingField.withinBounds(code), PairingField.withinBounds(name) else {
            return .fieldTooLong
        }
        return nil
    }

    private var pairingRequest: PairingRequest? {
        guard submissionProblem == nil,
            let baseURL = PairingField.baseURL(baseURLText),
            let code = PairingField.trimmed(codeText),
            let name = PairingField.trimmed(deviceNameText)
        else { return nil }

        return PairingRequest(
            baseURL: baseURL,
            code: code,
            deviceName: name,
            // Clamped rather than validated: the model identifier is read off
            // the hardware, so an over-long one is not something the person can
            // fix, and blocking pairing over it would be a dead end.
            deviceModel: PairingField.clamped(device.modelIdentifier)
        )
    }
}
