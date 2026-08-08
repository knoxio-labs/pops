import Foundation
import Security

/// The real device key store: a P-256 key generated inside the Secure Enclave.
///
/// ## Access control, and the decision not to require biometry
///
/// The key is created with `.privateKeyUsage` alone, over
/// `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`. Signing therefore needs an
/// unlocked device and nothing else: no Face ID prompt, no passcode, no
/// `LAContext`.
///
/// Adding `.biometryCurrentSet` was considered and rejected, and the reason is
/// a product consequence rather than a preference. Every access token this app
/// holds is short-lived by design, so refresh is not an occasional event — it
/// is a background one. Requiring biometry per signature would mean:
///
/// - no refresh from a background task, so a push-triggered fetch or a warm
///   cache update cannot authenticate at all;
/// - a Face ID sheet appearing on token expiry rather than on any action the
///   person actually took, which trains them to approve prompts they did not
///   ask for — the opposite of what the prompt is for.
///
/// What is given up is narrow and worth naming: an unlocked, unattended phone
/// can mint a new access token. The threat this design defends against is a
/// leaked refresh token — the server's database, a proxy log, a backup — and
/// that defence is unaffected, because the private half is still non-extractable
/// and still requires physical possession of this specific unlocked device.
/// Defending against an unlocked phone in a stranger's hands is the device
/// passcode's job, not this key's.
///
/// If a later feature signs something that is not a token refresh — an
/// operation with a real-world consequence — it should get its own Enclave key
/// with biometry attached, rather than reopening this one. The two use cases
/// have genuinely different requirements and one key cannot serve both.
///
/// ## Accessibility class
///
/// `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` is doing two separate jobs.
/// `WhenUnlocked` is the access window above. `ThisDeviceOnly` is what keeps
/// the key out of iCloud Keychain and out of encrypted backups, so a device
/// identity cannot be restored onto different hardware — a restored identity
/// would be a second device the BFM believes is the first one.
///
/// ## Hardware
///
/// None of this runs in the simulator: there is no Secure Enclave to generate
/// into, and `SecKeyCreateRandomKey` fails. The tests covering this type are
/// gated off by default and the gap is tracked — see the package README.
public struct SecureEnclaveKeyStore: DeviceKeyStore {
    private let tag: Data

    /// - Parameter applicationTag: The Keychain `kSecAttrApplicationTag` the key
    ///   is filed under. The default is the only value production uses; tests
    ///   on real hardware pass their own so a run cannot destroy a paired key.
    public init(applicationTag: String = "com.knoxiolabs.pops.device-key") {
        tag = Data(applicationTag.utf8)
    }

    @discardableResult
    public func createKey() throws -> DevicePublicKey {
        if try loadPrivateKey() != nil { throw DeviceKeyStoreError.keyAlreadyExists }

        var accessControlError: Unmanaged<CFError>?
        guard
            let access = SecAccessControlCreateWithFlags(
                nil,
                kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
                .privateKeyUsage,
                &accessControlError
            )
        else {
            throw DeviceKeyStoreError.secureEnclaveUnavailable(code: Self.code(of: accessControlError))
        }

        let attributes: [CFString: Any] = [
            kSecAttrKeyType: kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrKeySizeInBits: 256,
            kSecAttrTokenID: kSecAttrTokenIDSecureEnclave,
            kSecPrivateKeyAttrs: [
                kSecAttrIsPermanent: true,
                kSecAttrApplicationTag: tag,
                kSecAttrAccessControl: access,
                // Must match `baseQuery()`, or the key is written to one
                // keychain and looked up in the other — see that method.
                kSecUseDataProtectionKeychain: true,
            ] as [CFString: Any],
        ]

        var creationError: Unmanaged<CFError>?
        guard
            let privateKey = SecKeyCreateRandomKey(attributes as CFDictionary, &creationError)
        else {
            throw DeviceKeyStoreError.secureEnclaveUnavailable(code: Self.code(of: creationError))
        }

        return try Self.publicKey(of: privateKey)
    }

    public func publicKey() throws -> DevicePublicKey? {
        guard let privateKey = try loadPrivateKey() else { return nil }
        return try Self.publicKey(of: privateKey)
    }

    public func signature(for message: Data) throws -> Data {
        guard let privateKey = try loadPrivateKey() else { throw DeviceKeyStoreError.keyNotFound }

        var signingError: Unmanaged<CFError>?
        guard
            let signature = SecKeyCreateSignature(
                privateKey,
                .ecdsaSignatureMessageX962SHA256,
                message as CFData,
                &signingError
            )
        else {
            throw DeviceKeyStoreError.signingFailed(code: Self.code(of: signingError))
        }
        return signature as Data
    }

    public func deleteKey() throws {
        let status = SecItemDelete(baseQuery() as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw DeviceKeyStoreError.keychain(status)
        }
    }

    /// Every `SecItem` call and the generation attributes in ``createKey()``
    /// must name the same keychain. iOS has only the data-protection keychain
    /// and the flag is a no-op there; a macOS host build has two and defaults
    /// to the file-based one, so omitting it in one place and not the other
    /// creates a key that then cannot be found or deleted.
    private func baseQuery() -> [CFString: Any] {
        [
            kSecClass: kSecClassKey,
            kSecAttrKeyType: kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrApplicationTag: tag,
            kSecUseDataProtectionKeychain: true,
        ]
    }

    private func loadPrivateKey() throws -> SecKey? {
        var query = baseQuery()
        query[kSecReturnRef] = true

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        switch status {
        case errSecSuccess:
            // `as?` on a CoreFoundation type compiles to an unconditional
            // success — Swift has no isa to test — so the CFTypeID comparison
            // is the only real check available here.
            guard let item, CFGetTypeID(item) == SecKeyGetTypeID() else {
                throw DeviceKeyStoreError.keychain(errSecInvalidItemRef)
            }
            return unsafeDowncast(item, to: SecKey.self)
        case errSecItemNotFound:
            return nil
        default:
            throw DeviceKeyStoreError.keychain(status)
        }
    }

    private static func publicKey(of privateKey: SecKey) throws -> DevicePublicKey {
        guard let publicKey = SecKeyCopyPublicKey(privateKey) else {
            throw DeviceKeyStoreError.malformedPublicKey
        }
        // An export refusal is the framework declining, not bad bytes — the
        // public half of an Enclave key is always exportable when the key is
        // reachable at all — so it carries the code rather than reporting as
        // a malformed key.
        var exportError: Unmanaged<CFError>?
        guard let x963 = SecKeyCopyExternalRepresentation(publicKey, &exportError) as Data? else {
            throw DeviceKeyStoreError.secureEnclaveUnavailable(code: Self.code(of: exportError))
        }
        return try DevicePublicKey(x963Representation: x963)
    }

    /// Consumes a Security-framework `CFError` out-parameter and returns its
    /// code. These are `+1` references the caller owns, so they must be taken
    /// rather than left; `takeRetainedValue` hands them to ARC and reading the
    /// code on the way past is the only diagnostic this path ever gets.
    private static func code(of error: Unmanaged<CFError>?) -> Int {
        guard let error else { return 0 }
        return CFErrorGetCode(error.takeRetainedValue())
    }
}
