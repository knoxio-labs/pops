import AppCore

/// Why the camera cannot be opened, and whether Settings can undo it.
///
/// One value rather than three branches inside ``ReceiptCapturePrompt``. Which
/// refusals are worth sending somebody to Settings for is a fact about the
/// camera states, not about the layout, and holding it here is what lets it be
/// asserted without rasterising a screen — the render comparisons cannot see
/// the link at all, because a refusal differs from its neighbours by copy
/// whether or not the link is there.
internal struct CameraRefusal: Equatable {
    internal let message: String

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
            return CameraRefusal(message: ReceiptCaptureCopy.cameraDenied, offersSettings: true)
        case .restricted:
            return CameraRefusal(
                message: ReceiptCaptureCopy.cameraRestricted, offersSettings: false)
        case .unavailable:
            return CameraRefusal(
                message: ReceiptCaptureCopy.cameraUnavailable, offersSettings: false)
        }
    }
}
