/// The handles the capture screen offers to something driving it from outside
/// the process.
///
/// Not what VoiceOver reads — that is the label, and every control here has
/// one. This is the other half of the accessibility API: a stable name that
/// survives a copy edit, a Dynamic Type size and a localisation, so a UI flow
/// keys on the element rather than on the sentence inside it.
///
/// Hyphens rather than dots because Maestro matches a selector as a regular
/// expression, and a dot there matches any character. Same convention as
/// `FeaturePairing`'s.
internal enum ReceiptCaptureAccessibility {
    internal static let captureButton = "receipt-capture-start"
    internal static let captureAnotherButton = "receipt-capture-another"
    /// The screen shown when the camera cannot be opened at all — which is
    /// every Simulator, so this is the state an automated flow actually meets.
    internal static let cameraRefusal = "receipt-capture-camera-refusal"
    /// Present only on the one refusal Settings can undo — see
    /// ``CameraRefusal``. A flow asserting this is *absent* is asserting that
    /// rule, which is why it needs a name of its own rather than being found
    /// by its label.
    internal static let openSettings = "receipt-capture-open-settings"
    internal static let problem = "receipt-capture-problem"
    /// Opens the same form a corrected reading uses, blank — reachable
    /// without a camera, which is what lets a Maestro flow exercise this
    /// screen's whole write path on the Simulator (POPS-2454).
    internal static let manualEntryButton = "receipt-capture-manual-entry"
    /// Distinct from ``captureAnotherButton``: it ends a manual entry, not a
    /// photograph, and the two must be tellable apart by a flow that has
    /// only ever taken one of the two paths through this screen.
    internal static let manualEntryDoneButton = "receipt-capture-manual-entry-done"
}
