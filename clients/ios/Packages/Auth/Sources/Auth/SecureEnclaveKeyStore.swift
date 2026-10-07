import Foundation
import Security
import Synchronization

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
/// On an Apple Silicon host the simulator reaches the host Mac's Secure
/// Enclave: `SecKeyCreateRandomKey` with `kSecAttrTokenIDSecureEnclave`
/// succeeds there, and the key it returns is genuinely non-extractable, not a
/// software stand-in. What this package's own tests still cannot do is create
/// one — the key is stored `kSecAttrIsPermanent`, which needs a
/// keychain-access-group entitlement no unhosted `swift test` binary carries —
/// so the suite that exercises this type lives in the app's hosted test
/// target instead. See `clients/ios/AppTests/SecureEnclaveKeyStoreTests.swift`
/// and the package README.
public struct SecureEnclaveKeyStore: DeviceKeyStore {
    static let mutationLock = Mutex(())

    let applicationTag: String

    var tag: Data { Data(applicationTag.utf8) }

    var activeCandidateDefaultsKey: String { "\(applicationTag).active-candidate" }

    var candidateDefaultsKey: String { "\(applicationTag).candidates" }

    /// - Parameter applicationTag: The Keychain `kSecAttrApplicationTag` the key
    ///   is filed under. The default is the only value production uses; tests
    ///   on real hardware pass their own so a run cannot destroy a paired key.
    public init(applicationTag: String = "com.knoxiolabs.pops.device-key") {
        self.applicationTag = applicationTag
    }

    @discardableResult
    public func createKey() throws -> DevicePublicKey {
        try Self.mutationLock.withLock { _ in
            if try loadPrivateKey(at: activeTag) != nil {
                throw DeviceKeyStoreError.keyAlreadyExists
            }
            return try createKey(at: tag)
        }
    }

    func createKey(at applicationTag: Data) throws -> DevicePublicKey {
        var accessControlError: Unmanaged<CFError>?
        guard
            let access = SecAccessControlCreateWithFlags(
                nil,
                kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
                .privateKeyUsage,
                &accessControlError
            )
        else {
            throw DeviceKeyStoreError.secureEnclaveUnavailable(
                code: Self.code(of: accessControlError))
        }

        let attributes: [CFString: Any] = [
            kSecAttrKeyType: kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrKeySizeInBits: 256,
            kSecAttrTokenID: kSecAttrTokenIDSecureEnclave,
            kSecPrivateKeyAttrs: [
                kSecAttrIsPermanent: true,
                kSecAttrApplicationTag: applicationTag,
                kSecAttrAccessControl: access,
                kSecUseDataProtectionKeychain: true,
            ] as [CFString: Any],
        ]

        var creationError: Unmanaged<CFError>?
        guard let privateKey = SecKeyCreateRandomKey(attributes as CFDictionary, &creationError)
        else {
            throw DeviceKeyStoreError.secureEnclaveUnavailable(code: Self.code(of: creationError))
        }
        return try Self.publicKey(of: privateKey)
    }

    public func publicKey() throws -> DevicePublicKey? {
        try Self.mutationLock.withLock { _ in
            guard let privateKey = try loadPrivateKey(at: activeTag) else { return nil }
            return try Self.publicKey(of: privateKey)
        }
    }

    public func signature(for message: Data) throws -> Data {
        try Self.mutationLock.withLock { _ in
            guard let privateKey = try loadPrivateKey(at: activeTag) else {
                throw DeviceKeyStoreError.keyNotFound
            }

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
    }

    /// Every `SecItem` call and the generation attributes in ``createKey()``
    /// must name the same keychain. iOS has only the data-protection keychain
    /// and the flag is a no-op there; a macOS host build has two and defaults
    /// to the file-based one, so omitting it in one place and not the other
    /// creates a key that then cannot be found or deleted.
    private var activeTag: Data {
        guard let identifier = UserDefaults.standard.string(forKey: activeCandidateDefaultsKey),
            let uuid = UUID(uuidString: identifier)
        else {
            return tag
        }
        return candidateTag(for: uuid)
    }

    var candidateIdentifiers: [String] {
        UserDefaults.standard.stringArray(forKey: candidateDefaultsKey) ?? []
    }

    func candidateTag(for identifier: UUID) -> Data {
        Data("\(applicationTag).candidate.\(identifier.uuidString)".utf8)
    }

    func matchingCandidateTags() throws -> Set<Data> {
        var query: [CFString: Any] = [
            kSecClass: kSecClassKey,
            kSecAttrKeyType: kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrTokenID: kSecAttrTokenIDSecureEnclave,
            kSecUseDataProtectionKeychain: true,
            kSecMatchLimit: kSecMatchLimitAll,
            kSecReturnAttributes: true,
        ]
        query.removeValue(forKey: kSecAttrApplicationTag)

        var found: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &found)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw DeviceKeyStoreError.keychain(status)
        }
        guard status == errSecSuccess else { return [] }
        guard let attributes = found as? [[String: Any]] else {
            throw DeviceKeyStoreError.keychain(errSecInvalidItemRef)
        }
        let prefix = Data("\(applicationTag).candidate.".utf8)
        return Set(
            attributes.compactMap { $0[kSecAttrApplicationTag as String] as? Data }
                .filter { $0.starts(with: prefix) })
    }

    func removeCandidate(_ identifier: UUID) {
        UserDefaults.standard.set(
            candidateIdentifiers.filter { $0 != identifier.uuidString },
            forKey: candidateDefaultsKey
        )
    }

    private func baseQuery(for applicationTag: Data) -> [CFString: Any] {
        [
            kSecClass: kSecClassKey,
            kSecAttrKeyType: kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrApplicationTag: applicationTag,
            kSecUseDataProtectionKeychain: true,
        ]
    }

    func loadPrivateKey(at applicationTag: Data) throws -> SecKey? {
        var query = baseQuery(for: applicationTag)
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

    func deleteKey(at applicationTag: Data) throws {
        let status = SecItemDelete(baseQuery(for: applicationTag) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
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
