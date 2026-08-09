/// Device pairing, Secure Enclave key material, Keychain token storage,
/// refresh, and the middleware that attaches a token to every request.
///
/// This type only exists so the app target's placeholder view can assert the
/// module links, and goes when that view does.
public enum Auth {
    public static let moduleName = "Auth"
}
