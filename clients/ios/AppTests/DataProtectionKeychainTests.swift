import Foundation
import Security
import Testing

/// That the data-protection keychain is reachable from here at all.
///
/// This is a claim about the *environment*, not about any type in `Auth`.
/// `KeychainTokenStoreTests` is the suite that exercises the type, and it lives
/// here because a `swift test` binary carries no keychain-access-group
/// entitlement and gets `errSecMissingEntitlement` (-34018) for its trouble.
/// That suite would fail for two quite different reasons — a wrong query and an
/// unentitled process — and this one separates them, so a red run points at the
/// code rather than at the harness.
///
/// It fails loudly if this target ever stops being hosted by the app. An
/// unhosted test bundle runs in a bare `xctest` process with the same absent
/// entitlement as `swift test`, and the whole point of the app target
/// disappears without any other symptom.
@Suite("Data-protection keychain", .serialized)
internal struct DataProtectionKeychainTests {
    /// Its own service, so a run cannot touch the credentials of a genuinely
    /// paired app that happens to share the device — the same discipline the
    /// hardware suites in `Auth` use, for the same reason.
    private static let service = "com.knoxiolabs.pops.app-test-target.keychain-probe"
    private static let account = "reachability"

    private var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.service,
            kSecAttrAccount as String: Self.account,
            // The flag under test. Without it the call falls back to the file-
            // based keychain, which needs no entitlement and would make this
            // suite pass in exactly the environment it exists to reject.
            kSecUseDataProtectionKeychain as String: true,
        ]
    }

    private func delete() -> OSStatus {
        SecItemDelete(baseQuery as CFDictionary)
    }

    @Test("an item round-trips through the data-protection keychain")
    func roundTrip() throws {
        _ = delete()
        defer { _ = delete() }

        let secret = Data("entitlement probe".utf8)
        var insert = baseQuery
        insert[kSecValueData as String] = secret
        insert[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock

        let added = SecItemAdd(insert as CFDictionary, nil)
        #expect(
            added == errSecSuccess,
            """
            SecItemAdd returned \(added). -34018 (errSecMissingEntitlement) means these \
            tests are not running inside an entitled app process — check that PopsTests \
            is still hosted by the Pops target.
            """
        )

        var read = baseQuery
        read[kSecReturnData as String] = true
        read[kSecMatchLimit as String] = kSecMatchLimitOne

        var found: CFTypeRef?
        let status = SecItemCopyMatching(read as CFDictionary, &found)
        #expect(status == errSecSuccess, "SecItemCopyMatching returned \(status)")
        #expect(found as? Data == secret)
    }

    /// Deleting what is not there has to be distinguishable from being unable
    /// to reach the keychain, because `wipe()` in `Auth` treats one of those as
    /// success and the other as an error worth propagating.
    @Test("deleting an absent item reports absence, not a permission failure")
    func deleteReportsAbsence() {
        _ = delete()

        #expect(delete() == errSecItemNotFound)
    }
}
