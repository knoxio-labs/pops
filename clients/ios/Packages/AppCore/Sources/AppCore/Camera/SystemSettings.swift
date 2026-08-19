import Foundation

#if canImport(UIKit)
    import UIKit
#endif

/// The Settings deep link, isolated so exactly one `#if` guards it rather than
/// one per call site.
///
/// Beside ``CameraAuthorizing`` rather than inside a feature because both
/// screens that ask for the camera — pairing's QR scanner and receipt capture —
/// need somewhere to send a person who said no, and a second copy of this is a
/// second thing to keep in step with a platform API that has moved before.
public enum SystemSettings {
    /// `nil` on any platform without a Settings app to open, which a view
    /// treats as "offer no button".
    public static var url: URL? {
        #if canImport(UIKit)
            return URL(string: UIApplication.openSettingsURLString)
        #else
            return nil
        #endif
    }
}
