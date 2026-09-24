import Foundation

/// The zoom a lens needs before a QR code framed at a comfortable size is also
/// one it can focus on.
///
/// The failure this exists for looks like "autofocus is broken" and is not.
/// Every lens has a minimum focus distance — about 20 cm on a Pro iPhone's
/// main camera — and a QR code on a laptop screen, framed to fill the reticle
/// at 1×, sits inside it. Continuous autofocus hunts, gives up, and the preview
/// stays soft however long the phone is held there, because no focus setting
/// reaches a subject that close.
///
/// ``QRScannerCoordinator`` answers that in two ways, and this is the second.
/// Where the phone has a multi-lens virtual camera it opens that one and lets
/// it hand close subjects to the ultra-wide, the way the Camera app's macro
/// does. Where it has a single lens, zooming in moves the distance at which the
/// code fills the frame back out towards the focus limit — Apple's own answer
/// in the AVCamBarcode sample — and this is the arithmetic for it.
///
/// Pure arithmetic, deliberately outside the UIKit-only scanner files: it is
/// the one part of the camera path a host test can check.
public enum QRFocusGeometry {
    /// Narrowest code the scanner is tuned for, in millimetres. An inventory
    /// label is about this wide; a pairing QR on a monitor is larger, and a
    /// larger code only makes the arithmetic below more forgiving.
    public static let minimumCodeWidthMillimetres: Double = 20

    /// How much of the preview's width that code should fill when held at
    /// the distance the zoom is chosen for. A quarter is already far more than
    /// the metadata output needs to read a code; asking for more buys a zoom
    /// that makes a large code overflow the frame at arm's length.
    public static let previewFillFraction: Double = 0.25

    /// Ceiling on the zoom this picks, whatever the lens could do. Past about
    /// 2× hand shake starts to show in the preview, and a pairing QR on a
    /// monitor stops fitting in the frame at the distance it is meant for.
    public static let maximumAutomaticZoom: Double = 2

    /// Distance, in millimetres, at which a code `codeWidth` wide fills
    /// `fillFraction` of a lens's horizontal field of view.
    ///
    /// Returns `nil` for inputs no real lens reports (a field of view outside
    /// (0°, 180°), or a non-positive width or fraction), so a caller cannot
    /// turn a malformed format description into an infinite zoom.
    public static func subjectDistance(
        fieldOfViewDegrees: Double,
        codeWidth: Double = minimumCodeWidthMillimetres,
        fillFraction: Double = previewFillFraction
    ) -> Double? {
        guard fieldOfViewDegrees > 0, fieldOfViewDegrees < 180,
            codeWidth > 0, fillFraction > 0, fillFraction <= 1
        else { return nil }
        let visibleWidth = codeWidth / fillFraction
        let halfAngle = fieldOfViewDegrees / 2 * .pi / 180
        return (visibleWidth / 2) / tan(halfAngle)
    }

    /// The zoom factor that pushes the framing distance out to the lens's
    /// minimum focus distance, clamped to what the device can do.
    ///
    /// `1` — no zoom — whenever the lens can already focus at the framing
    /// distance, or when it does not report a minimum focus distance at all
    /// (`AVCaptureDevice.minimumFocusDistance` is `-1` then). Never below
    /// `minimum`, and never above `maximum` (the device format's own limit) or
    /// ``maximumAutomaticZoom``, whichever is lower.
    public static func zoomFactor(
        minimumFocusDistanceMillimetres: Int,
        fieldOfViewDegrees: Double,
        minimum: Double = 1,
        maximum: Double
    ) -> Double {
        let lowest = max(1, minimum)
        guard minimumFocusDistanceMillimetres > 0,
            let distance = subjectDistance(fieldOfViewDegrees: fieldOfViewDegrees),
            distance < Double(minimumFocusDistanceMillimetres)
        else { return lowest }
        let needed = Double(minimumFocusDistanceMillimetres) / distance
        let ceiling = max(lowest, min(maximum, maximumAutomaticZoom))
        return min(max(needed, lowest), ceiling)
    }
}
