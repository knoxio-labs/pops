/// Device pairing, Secure Enclave key material, Keychain token storage and
/// refresh.
///
/// Key material and token storage are real; pairing and refresh are not written
/// yet. This type only exists so the app target's placeholder view can assert
/// the module links, and goes when that view does.
public enum Auth {
    public static let moduleName = "Auth"
}
