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
