import Foundation
import Testing

@testable import Auth

/// Whether the two hardware-backed suites in this file may run.
///
/// They are off by default, and that is not caution — they cannot pass
/// anywhere else:
///
/// - ``SecureEnclaveKeyStore`` needs a Secure Enclave. The simulator has none,
///   so `SecKeyCreateRandomKey` fails outright, and a Mac's Enclave is not
///   reachable from an unsigned `swift test` binary.
/// - ``KeychainTokenStore`` uses the data-protection keychain, which requires
///   the process to carry a keychain-access-group entitlement. A `swift test`
///   binary carries none and gets `errSecMissingEntitlement`.
///
/// Enabling them by default would therefore turn every CI run and every local
/// `swift test` red, and the usual response to that — deleting the assertions
/// or catching the error — would leave a suite that passes while testing
/// nothing. Running them means an app build on a real device with
/// `POPS_IOS_HARDWARE_TESTS=1` in the scheme's environment.
///
/// The gap this leaves is real and is tracked rather than papered over; see the
/// package README.
private let hardwareTestsEnabled =
    ProcessInfo.processInfo.environment["POPS_IOS_HARDWARE_TESTS"] == "1"

/// Runs only on a real device. Uses its own application tag so a test run
/// cannot destroy the key of a genuinely paired app on the same phone.
@Suite("secure enclave key store", .enabled(if: hardwareTestsEnabled), .serialized)
internal struct SecureEnclaveHardwareTests {
    let store = SecureEnclaveKeyStore(applicationTag: "com.knoxiolabs.pops.device-key.tests")

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

        let reopened = SecureEnclaveKeyStore(
            applicationTag: "com.knoxiolabs.pops.device-key.tests"
        )

        #expect(try reopened.publicKey() == created)

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

/// Runs only where the data-protection keychain is available. Uses its own
/// service, which matters more than usual here: ``KeychainTokenStore/wipe()``
/// clears its whole service.
@Suite("keychain token store", .enabled(if: hardwareTestsEnabled), .serialized)
internal struct KeychainTokenStoreHardwareTests {
    let store = KeychainTokenStore(service: "com.knoxiolabs.pops.auth.tests")

    init() throws {
        try store.wipe()
    }

    static func tokens(access: String, refresh: String) -> DeviceTokens {
        DeviceTokens(
            accessToken: access,
            refreshToken: refresh,
            accessTokenExpiresAt: Date(timeIntervalSince1970: 1_786_000_000)
        )
    }

    @Test("a pair round-trips through the keychain")
    func saveThenLoad() throws {
        let saved = Self.tokens(access: "a", refresh: "r")

        try store.save(saved)

        #expect(try store.load() == saved)

        try store.wipe()
    }

    /// Exercises the `SecItemUpdate` branch, which the first save never reaches.
    @Test("saving twice updates in place rather than duplicating the item")
    func saveTwiceUpdates() throws {
        try store.save(Self.tokens(access: "first", refresh: "first-r"))

        try store.save(Self.tokens(access: "second", refresh: "second-r"))

        #expect(try store.load()?.accessToken == "second")

        try store.wipe()
    }

    @Test("a wipe leaves nothing behind")
    func wipeIsTotal() throws {
        try store.save(Self.tokens(access: "a", refresh: "r"))

        try store.wipe()

        #expect(try store.load() == nil)
    }
}
