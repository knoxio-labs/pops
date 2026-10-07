import AppCore

/// Every word this screen shows, in one place.
///
/// Each sentence is written here in English and resolved through this
/// package's String Catalog, where the English is the key and `pt-BR` is the
/// translation. The two placeholders that are a shape rather than a sentence
/// stay literals.
internal enum PairingCopy {
    private static let localized = LocalizedCopy(bundle: .module)

    internal static var title: String { localized("Pair this device") }
    internal static var subtitle: String {
        localized("Open the Devices page on your Pops server and scan the code it shows.")
    }

    internal static var scanButton: String { localized("Scan QR code") }
    internal static var scannerInstruction: String { localized("Point the camera at the QR code.") }
    internal static var scannerCancel: String { localized("Cancel") }

    internal static var cameraDenied: String {
        localized("Pops cannot use the camera. Allow it in Settings, or type the details below.")
    }
    internal static var cameraRestricted: String {
        localized("Camera access is restricted on this device. Type the details below instead.")
    }
    internal static var cameraUnavailable: String {
        localized("This device has no camera. Type the details below instead.")
    }
    internal static var openSettings: String { localized("Open Settings") }

    internal static var serverLabel: String { localized("Server address") }
    internal static let serverPlaceholder = "https://bfm.example.com"
    internal static var codeLabel: String { localized("Pairing code") }
    internal static let codePlaceholder = "XXXX-XXXX-XXXX"
    internal static var nameLabel: String { localized("Device name") }
    internal static var namePlaceholder: String { localized("This iPhone") }

    internal static var pairButton: String { localized("Pair") }
    internal static var pairing: String { localized("Pairing…") }

    /// Why somebody who was signed in is looking at this screen again.
    ///
    /// Shown rather than skipped because the alternative — being returned to
    /// pairing with no explanation — is indistinguishable from the app having
    /// lost its mind, and reads as a defect for months. The two reasons say
    /// different things because they lead to different next actions: one is
    /// somebody's deliberate decision, the other is a fault to report.
    internal static func explanation(for reason: RevocationReason) -> String {
        switch reason {
        case .revokedByOperator:
            return localized(
                "This device was removed on your Pops server. Pair it again to continue.")
        case .credentialsRejected:
            return localized(
                "This device's sign-in expired and could not be renewed. Pair it again.")
        }
    }

    /// What to say about each failure, and it is one sentence per case because
    /// each one has a different next action. The pair of them that must never
    /// merge is ``PairingError/codeRejected`` and
    /// ``PairingError/rateLimited(retryAfterSeconds:)``: telling a
    /// rate-limited person to generate a new code sends them round the loop
    /// that produced the rate limit.
    internal static func message(for error: PairingError) -> String {
        switch error {
        case .codeRejected:
            return localized("That code did not work. Generate a new one and try again.")
        case .rateLimited(.some(let retryAfterSeconds)):
            return localized("Too many attempts. Try again in \(retryAfterSeconds) seconds.")
        case .rateLimited(.none):
            // No number to give, and inventing one would be a promise the
            // server never made. Still says the thing that decides what to do.
            return localized("Too many attempts. Wait a minute and try again.")
        case .invalidRequest:
            // Deliberately not "check your code". The server refused the
            // request itself, which is this build's fault, and sending someone
            // to mint fresh codes against a bug wastes their time indefinitely.
            return localized(
                "This version of Pops sent something the server refused. Update the app.")
        case .unreachable:
            return localized("Could not reach that server. Check the address and your connection.")
        case .keyGenerationFailed:
            return localized(
                "This device could not create its security key. Unlock it and try again.")
        case .credentialStorageFailed:
            return localized(
                """
                Paired, but this device could not store its credentials. \
                Revoke it on the Devices page and pair again.
                """)
        case .dependencyNotBound:
            return localized("Pops is not set up correctly on this device.")
        }
    }

    /// Why the button is not available, for VoiceOver. A disabled control with
    /// no stated reason is a dead end for anyone who cannot see which field is
    /// still empty.
    internal static func blockedHint(for problem: PairingInputProblem) -> String {
        switch problem {
        case .missingServer: return localized("Enter the server address first.")
        case .missingCode: return localized("Enter the pairing code first.")
        case .missingName: return localized("Enter a name for this device first.")
        case .fieldTooLong:
            return localized("The pairing code and device name must be 64 characters or fewer.")
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
