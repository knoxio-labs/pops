import AppCore

/// Every word this screen shows, in one place.
///
/// English string literals, like `DesignSystem`'s state primitives and for the
/// same reason: the app has no localisation layer yet, and scattering the copy
/// through the view now would make adding one a hunt. Gathering it here makes
/// that a change to one file. Tracked separately as a gap rather than
/// pretended away.
internal enum PairingCopy {
    internal static let title = "Pair this device"
    internal static let subtitle =
        "Open the Devices page on your Pops server and scan the code it shows."

    internal static let scanButton = "Scan QR code"
    internal static let scannerInstruction = "Point the camera at the QR code."
    internal static let scannerCancel = "Cancel"

    internal static let cameraDenied =
        "Pops cannot use the camera. Allow it in Settings, or type the details below."
    internal static let cameraRestricted =
        "Camera access is restricted on this device. Type the details below instead."
    internal static let cameraUnavailable =
        "This device has no camera. Type the details below instead."
    internal static let openSettings = "Open Settings"

    internal static let serverLabel = "Server address"
    internal static let serverPlaceholder = "https://bfm.example.com"
    internal static let codeLabel = "Pairing code"
    internal static let codePlaceholder = "XXXX-XXXX-XXXX"
    internal static let nameLabel = "Device name"
    internal static let namePlaceholder = "This iPhone"

    internal static let pairButton = "Pair"
    internal static let pairing = "Pairing…"

    /// What to say about each failure, and it is one sentence per case because
    /// each one has a different next action. The pair of them that must never
    /// merge is ``PairingError/codeRejected`` and
    /// ``PairingError/rateLimited(retryAfterSeconds:)``: telling a
    /// rate-limited person to generate a new code sends them round the loop
    /// that produced the rate limit.
    internal static func message(for error: PairingError) -> String {
        switch error {
        case .codeRejected:
            return "That code did not work. Generate a new one and try again."
        case .rateLimited(let retryAfterSeconds):
            let unit = retryAfterSeconds == 1 ? "second" : "seconds"
            return "Too many attempts. Try again in \(retryAfterSeconds) \(unit)."
        case .invalidRequest:
            // Deliberately not "check your code". The server refused the
            // request itself, which is this build's fault, and sending someone
            // to mint fresh codes against a bug wastes their time indefinitely.
            return "This version of Pops sent something the server refused. Update the app."
        case .unreachable:
            return "Could not reach that server. Check the address and your connection."
        case .keyGenerationFailed:
            return "This device could not create its security key. Unlock it and try again."
        case .credentialStorageFailed:
            return
                "Paired, but this device could not store its credentials. "
                + "Revoke it on the Devices page and pair again."
        case .dependencyNotBound:
            return "Pops is not set up correctly on this device."
        }
    }

    /// Why the button is not available, for VoiceOver. A disabled control with
    /// no stated reason is a dead end for anyone who cannot see which field is
    /// still empty.
    internal static func blockedHint(for problem: PairingInputProblem) -> String {
        switch problem {
        case .missingServer: return "Enter the server address first."
        case .missingCode: return "Enter the pairing code first."
        case .missingName: return "Enter a name for this device first."
        case .fieldTooLong:
            return "The pairing code and device name must be 64 characters or fewer."
        }
    }
}

/// Why the form cannot be submitted yet. Ordered by which field to fix first.
internal enum PairingInputProblem: Hashable, Sendable {
    case missingServer
    case missingCode
    case missingName
    case fieldTooLong
}
