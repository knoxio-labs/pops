/// The handles the pairing screen offers to something driving it from outside
/// the process.
///
/// An accessibility identifier is not what VoiceOver reads — that is the label,
/// and every control on this screen already has one. This is the other half of
/// the accessibility API: a stable name for an element that survives a copy
/// edit, a Dynamic Type size and a localisation. `clients/ios/.maestro/pairing-to-transaction-detail.yaml`
/// keys on these rather than on the sentences in ``PairingCopy``, which is what
/// stops rewording a button from failing a test about pairing.
///
/// Hyphens rather than dots because Maestro matches a selector as a regular
/// expression, and a dot there matches any character.
internal enum PairingAccessibility {
    internal static let serverField = "pairing-server-field"
    internal static let codeField = "pairing-code-field"
    internal static let deviceNameField = "pairing-device-name-field"
    internal static let submitButton = "pairing-submit"
}
