import Foundation

#if canImport(UIKit)
    import UIKit
#endif

/// The pairing screen: QR scan, manual entry, and the key generation and code
/// exchange behind them.
///
/// The imports across this module are the whole of what a feature may reach
/// for: the seams in `AppCore`, the tokens in `DesignSystem`. `Auth` and
/// `BFMClient` are deliberately absent — this talks to a
/// `DevicePairingService`, and only the composition root knows that the thing
/// behind it holds a Secure Enclave key and speaks HTTP.
public enum FeaturePairing {
    public static let moduleName = "FeaturePairing"
}

/// The Settings deep link, isolated so exactly one `#if` guards it rather than
/// one per call site.
internal enum SystemSettings {
    /// `nil` on any platform without a Settings app to open, which the view
    /// treats as "offer no button".
    internal static var url: URL? {
        #if canImport(UIKit)
            return URL(string: UIApplication.openSettingsURLString)
        #else
            return nil
        #endif
    }
}
