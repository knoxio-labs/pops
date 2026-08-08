import Auth
import Foundation
import Security
import Testing

/// ``SecureEnclaveKeyStore`` against a real Secure Enclave.
///
/// ## This used to be unrunnable, and is not any more
///
/// The suite was gated behind `POPS_IOS_HARDWARE_TESTS=1` on the premise that a
/// simulator has no Enclave and `SecKeyCreateRandomKey` with
/// `kSecAttrTokenIDSecureEnclave` therefore fails there. Measured on an Apple
/// Silicon host, that is no longer true: the simulator reaches the **host Mac's**
/// Enclave, the key it produces reports `kSecAttrTokenIDSecureEnclave`, and its
/// private half does not export. So the gate was removed and this runs on every
/// CI run.
///
/// What that does and does not buy is worth being exact about. It proves the
/// Security-framework calls in `SecureEnclaveKeyStore.swift` are correct — the
/// access-control flags, the query shapes, the create/sign/verify/delete
/// lifecycle — which is the whole of what was previously unverified. It proves
/// nothing about a particular phone's hardware, but no test ever could.
/// `mise run test:device` runs this same suite on an attached iPhone.
///
/// ## Why it is in the app target
///
/// The key is created `kSecAttrIsPermanent` in the data-protection keychain,
/// which needs the process to carry a keychain-access-group entitlement. An
/// unhosted package test bundle has none and would fail on the keychain before
/// ever reaching the Enclave, with a failure nobody could attribute. Here the
/// keychain half is known to work: `DataProtectionKeychainTests` asserts it in
/// the same lane, on every run.
///
/// Its own application tag, so a run cannot destroy the key of a genuinely
/// paired app on the same device.
@Suite("SecureEnclaveKeyStore", .serialized)
internal struct SecureEnclaveKeyStoreTests {
    private static let applicationTag = "com.knoxiolabs.pops.device-key.tests"

    private let store = SecureEnclaveKeyStore(applicationTag: applicationTag)

    init() throws {
        try store.deleteKey()
    }

    /// The stored key, reached directly rather than through
    /// ``SecureEnclaveKeyStore``. That is the point of the two residency tests
    /// below: they are about what the Security framework was actually persuaded
    /// to create, which the store's API deliberately does not expose.
    private func storedKeyQuery(returning attribute: CFString) -> [String: Any] {
        [
            kSecClass as String: kSecClassKey,
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrApplicationTag as String: Data(Self.applicationTag.utf8),
            kSecUseDataProtectionKeychain as String: true,
            attribute as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
    }

    private func storedKeyAttributes() throws -> [String: Any] {
        var found: CFTypeRef?
        let status = SecItemCopyMatching(
            storedKeyQuery(returning: kSecReturnAttributes) as CFDictionary, &found)
        try #require(status == errSecSuccess, "SecItemCopyMatching returned \(status)")
        return try #require(found as? [String: Any], "the Keychain returned no attributes")
    }

    private func storedPrivateKey() throws -> SecKey {
        var found: CFTypeRef?
        let status = SecItemCopyMatching(
            storedKeyQuery(returning: kSecReturnRef) as CFDictionary, &found)
        try #require(status == errSecSuccess, "SecItemCopyMatching returned \(status)")
        let item = try #require(found, "the Keychain returned no key reference")
        try #require(CFGetTypeID(item) == SecKeyGetTypeID(), "the stored item is not a SecKey")
        return unsafeDowncast(item, to: SecKey.self)
    }

    /// **The property the whole auth design rests on.** A leaked refresh token is
    /// survivable only because spending it needs a signature this hardware alone
    /// can produce. The moment the private half is readable that stops being
    /// true, and nothing else in the design notices.
    ///
    /// Asserted rather than assumed because the failure is invisible: a software
    /// key generated after a silently-ignored `kSecAttrTokenIDSecureEnclave`
    /// creates, signs, verifies, persists and deletes exactly like an Enclave
    /// key. Every other test in this suite passes against one.
    @Test("the private half does not export")
    func privateKeyIsNonExtractable() throws {
        try store.createKey()

        let privateKey = try storedPrivateKey()
        var exportError: Unmanaged<CFError>?
        let exported = SecKeyCopyExternalRepresentation(privateKey, &exportError) as Data?
        exportError?.release()

        #expect(
            exported == nil,
            """
            The device private key exported \(exported?.count ?? 0) bytes. It is not \
            Enclave-resident, and every claim this app makes about a stolen refresh token \
            being useless is false.
            """
        )

        try store.deleteKey()
    }

    /// The control that makes the assertion above mean anything.
    ///
    /// A refusal to export is evidence of non-extractability only if the same
    /// call does *not* refuse for an ordinary key. Without this, a toolchain
    /// that stopped exporting private keys at all would leave the test above
    /// passing while asserting nothing — which is the exact shape of failure
    /// this suite was gated off to avoid.
    @Test("an ordinary P-256 private key does export, so that refusal is about the Enclave")
    func softwareKeysAreExtractable() throws {
        let attributes: [CFString: Any] = [
            kSecAttrKeyType: kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrKeySizeInBits: 256,
            kSecPrivateKeyAttrs: [kSecAttrIsPermanent: false] as [CFString: Any],
        ]

        var creationError: Unmanaged<CFError>?
        let created = SecKeyCreateRandomKey(attributes as CFDictionary, &creationError)
        creationError?.release()
        let softwareKey = try #require(created, "could not create a software P-256 key")

        var exportError: Unmanaged<CFError>?
        let exported = SecKeyCopyExternalRepresentation(softwareKey, &exportError) as Data?
        exportError?.release()

        #expect(exported?.isEmpty == false, "a software private key refused to export")
    }

    /// The other half of the residency question, asked of the Keychain rather
    /// than of the key. `SecKeyCreateRandomKey` is not obliged to refuse an
    /// Enclave request it cannot honour, so "it returned a key" is not evidence
    /// of where that key lives.
    @Test("the stored key reports the Secure Enclave as its token")
    func keyIsEnclaveResident() throws {
        try store.createKey()

        let tokenID = try storedKeyAttributes()[kSecAttrTokenID as String] as? String

        #expect(
            tokenID == kSecAttrTokenIDSecureEnclave as String,
            "token id is \(tokenID ?? "unset")"
        )

        try store.deleteKey()
    }

    @Test("a key is generated in the enclave and exports the contract encoding")
    func createExportsSPKI() throws {
        let created = try store.createKey()

        #expect(created.x963Representation.count == 65)
        #expect(created.x963Representation.first == 0x04)
        #expect(try store.publicKey() == created)

        try store.deleteKey()
    }

    @Test("a signature from the enclave verifies against the exported key")
    func signAndVerify() throws {
        let publicKey = try store.createKey()
        let message = Data("hardware signature".utf8)

        let signature = try store.signature(for: message)

        #expect(publicKey.isValidSignature(signature, for: message))

        try store.deleteKey()
    }

    @Test("the key survives being looked up again, as a device identity must")
    func keyIsPersistent() throws {
        let created = try store.createKey()

        let reopened = SecureEnclaveKeyStore(applicationTag: Self.applicationTag)

        #expect(try reopened.publicKey() == created)

        try store.deleteKey()
    }

    /// Re-pairing deletes before it creates, so a create that silently replaced
    /// would orphan the public key the BFM has on file with nothing to notice it.
    @Test("a second create is refused rather than silently replacing the identity")
    func createRefusesToReplace() throws {
        try store.createKey()

        #expect(throws: DeviceKeyStoreError.keyAlreadyExists) { try store.createKey() }

        try store.deleteKey()
    }

    @Test("deletion is total and idempotent")
    func deletion() throws {
        try store.createKey()

        try store.deleteKey()
        try store.deleteKey()

        #expect(try store.publicKey() == nil)
        #expect(throws: DeviceKeyStoreError.keyNotFound) {
            try store.signature(for: Data())
        }
    }
}
