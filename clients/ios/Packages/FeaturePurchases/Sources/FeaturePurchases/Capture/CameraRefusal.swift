import AppCore
import DesignSystem

/// Why the camera cannot be opened, how to say so, and whether Settings can
/// undo it.
///
/// One value rather than three branches inside ``ReceiptCapturePrompt``. Which
/// refusals are worth sending somebody to Settings for is a fact about the
/// camera states, not about the layout, and holding it here is what lets it be
/// asserted without rasterising a screen — the render comparisons cannot see
/// the link at all, because a refusal differs from its neighbours by copy
/// whether or not the link is there. The tone is here for the same reason:
/// it decides the colour and the glyph the refusal opens with, and that is a
/// claim about the *kind* of refusal rather than about the drawing of one.
internal struct CameraRefusal: Equatable {
    internal let title: String
    internal let message: String

    /// How this refusal reads before it is read.
    ///
    /// A device with no camera is not a warning — nobody did anything and
    /// nothing is wrong with the phone, so it draws as information. The two
    /// that come from a decision somebody or something made draw as warnings,
    /// because they are states that could be otherwise. None of them is a
    /// failure: nothing has gone wrong with a receipt at this point, and the
    /// destructive tone belongs to the screens where something has.
    internal let tone: PopsStatusHeader.Tone

    /// True only for a refusal the person is actually able to reverse. A link
    /// into Settings that leads to nothing they may change is worse than no
    /// link: it reads as an offer and ends in a dead end.
    internal let offersSettings: Bool

    /// `nil` when there is a camera to offer, which is the button's case.
    internal static func refusing(_ access: CameraAccess) -> CameraRefusal? {
        switch access {
        case .notDetermined, .authorized:
            return nil
        case .denied:
            return CameraRefusal(
                title: ReceiptCaptureCopy.cameraDeniedTitle,
                message: ReceiptCaptureCopy.cameraDenied,
                tone: .warning,
                offersSettings: true)
        case .restricted:
            return CameraRefusal(
                title: ReceiptCaptureCopy.cameraRestrictedTitle,
                message: ReceiptCaptureCopy.cameraRestricted,
                tone: .warning,
                offersSettings: false)
        case .unavailable:
            return CameraRefusal(
                title: ReceiptCaptureCopy.cameraUnavailableTitle,
                message: ReceiptCaptureCopy.cameraUnavailable,
                tone: .information,
                offersSettings: false)
        }
    }
}
