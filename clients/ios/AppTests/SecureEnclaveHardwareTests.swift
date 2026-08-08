import Auth
import Foundation
import Testing

/// Whether the Secure Enclave suite below may run.
///
/// It is off by default, and that is not caution — there is nowhere in CI it
/// can pass. The simulator has no Secure Enclave, so `SecKeyCreateRandomKey`
/// with `kSecAttrTokenIDSecureEnclave` fails outright, and a Mac's Enclave is
/// not reachable from an unsigned test binary. Enabling it by default would turn
/// every run red, and the usual response to that — deleting the assertions, or
/// catching the error — leaves a suite that passes while testing nothing.
///
/// So the gate stays, and closing it is an environment problem rather than a
/// code one: an app build on a physical iPhone with `POPS_IOS_HARDWARE_TESTS=1`.
/// `mise run test:device` is that run, and it refuses to report success on a
/// run that skipped anything — a skipped suite inside a passing one is the
/// failure this gate would otherwise create.
private let hardwareTestsEnabled =
    ProcessInfo.processInfo.environment["POPS_IOS_HARDWARE_TESTS"] == "1"

/// ``SecureEnclaveKeyStore`` against a real Enclave.
///
/// In the app target rather than in `Packages/Auth` because the key is created
/// `kSecAttrIsPermanent` in the data-protection keychain, which needs the
/// process to carry a keychain-access-group entitlement — so even on a phone,
/// an unhosted package test bundle would fail on the keychain before it ever
/// reached the Enclave, and the failure would be unattributable. Here the
/// keychain half is known to work: `DataProtectionKeychainTests` asserts it in
/// the same lane, on every run.
///
/// Its own application tag, so a run cannot destroy the key of a genuinely
/// paired app on the same phone.
@Suite("Secure Enclave key store", .enabled(if: hardwareTestsEnabled), .serialized)
internal struct SecureEnclaveHardwareTests {
    private static let applicationTag = "com.knoxiolabs.pops.device-key.tests"

    private let store = SecureEnclaveKeyStore(applicationTag: applicationTag)

    init() throws {
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
