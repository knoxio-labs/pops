/// `FeaturePairing`'s one screen — `PairingView`, driven by
/// `PairingViewModel` — in every condition it can report.
///
/// ## What is deliberately not a state
///
/// The QR scanner is a live camera feed behind `#if canImport(UIKit)` in
/// `QRScannerView`, and it needs an `AVCaptureDevice` to show anything at all.
/// This package builds for macOS specifically so it can run with no camera —
/// see `Package.swift` — so a "scanning" row here would have to fake the
/// viewfinder, which is exactly the HTML facsimile this app replaces, redrawn
/// in Swift instead of CSS. What is reviewable without a camera is staged
/// instead: the button that opens the scanner (every state in
/// ``PairingFormStates``, since `.notDetermined` and `.authorized` both show
/// it), and the form a scan fills in (``PairingFormStates/all``'s "ready"
/// state uses the same fields a successful scan would leave behind).
///
/// `PairingInputProblem`'s four cases — which field is empty, or which is too
/// long — are also not four rows. `PairingView` renders all of them the same
/// way: the Pair button disabled, with the difference living only in an
/// `accessibilityHint` a static review cannot see. ``PairingFormStates``
/// stages the two ends of that range instead — nothing entered, and
/// everything valid — which is what actually differs on screen.
///
/// Reachable through the seam and given no row for a different reason:
/// pairing's own success. It hands a `PairedDevice` to `SessionStore`, which
/// is what makes the app's root swap this screen away — nothing about
/// `PairingView` itself changes first. ``PlaygroundPairingService/Outcome``
/// still answers `.succeeds`, so the stand-in speaks for the whole seam even
/// though no state here asks it to.
@MainActor
internal enum PairingSurfaces {
    internal static let surfaces: [DesignSurface] = [
        DesignSurface(
            id: SurfaceID(area: "pairing", slug: "pairing"),
            title: "Pairing",
            synopsis:
                "The unpaired app's only screen: scan or type, and everything that can go wrong doing it.",
            chrome: .bare,
            states: PairingFormStates.all + PairingFailureStates.all + PairingReturningStates.all
        )
    ]
}
