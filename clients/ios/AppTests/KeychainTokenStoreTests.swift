import Auth
import Foundation
import Security
import Testing

/// `KeychainTokenStore` against a real Keychain, in the only lane that has one.
///
/// `Packages/Auth`'s own suites cannot run this type at all: the data-protection
/// keychain needs the process to carry a keychain-access-group entitlement, and
/// neither a `swift test` binary nor an unhosted `xcodebuild test` bundle has
/// one — both get `errSecMissingEntitlement` (-34018). Hosted by the app it
/// answers. `DataProtectionKeychainTests` asserts that environment on its own;
/// this suite assumes it and asserts the type.
///
/// What the fake-backed suites in `Packages/Auth` structurally cannot reach, and
/// what is therefore the point of this file: the accessibility class the item is
/// really written with, whether anything here is synchronizable, the
/// `SecItemUpdate`-then-`SecItemAdd` branch in ``KeychainTokenStore/save(_:)``,
/// and whether ``KeychainTokenStore/wipe()`` removes what its documentation
/// claims it removes.
///
/// The attributes are read back out of the Keychain rather than off the source,
/// because a downgrade here has no symptom. An item written
/// `kSecAttrAccessibleAfterFirstUnlock`, or written synchronizable, stores and
/// loads exactly as well as a correct one — it is only wrong on a locked phone
/// and on somebody else's hardware.
@Suite("KeychainTokenStore", .serialized)
internal struct KeychainTokenStoreTests {
    /// Its own service and account. ``KeychainTokenStore/wipe()`` clears a whole
    /// service, so borrowing the app's would mean a test run signing out a
    /// genuinely paired app that happens to share the device.
    private static let service = "com.knoxiolabs.pops.auth.app-tests"
    private static let account = "device-tokens"

    private let store = KeychainTokenStore(service: service, account: account)

    init() throws {
        try store.wipe()
    }

    private static func tokens(access: String, refresh: String) -> DeviceTokens {
        DeviceTokens(
            accessToken: access,
            refreshToken: refresh,
            accessTokenExpiresAt: Date(timeIntervalSince1970: 1_786_000_000)
        )
    }

    /// Every item under this suite's service, as the Keychain itself reports it.
    ///
    /// `kSecMatchLimitAll` because the count is an assertion in its own right:
    /// an update and a duplicate insert are indistinguishable from a single
    /// `load()`, which returns one item either way.
    private func storedItems(synchronizable: Any = kSecAttrSynchronizableAny) throws
        -> [[String: Any]]
    {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.service,
            kSecAttrSynchronizable as String: synchronizable,
            kSecUseDataProtectionKeychain as String: true,
            kSecReturnAttributes as String: true,
            kSecMatchLimit as String: kSecMatchLimitAll,
        ]

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return [] }
        try #require(status == errSecSuccess, "SecItemCopyMatching returned \(status)")
        return try #require(result as? [[String: Any]], "the Keychain returned no attribute list")
    }

    private func accessibilityOfStoredItem() throws -> String {
        let item = try #require(try storedItems().first, "no item under \(Self.service)")
        return try #require(
            item[kSecAttrAccessible as String] as? String,
            "the stored item reports no accessibility class at all"
        )
    }

    @Test("a pair round-trips through the real Keychain")
    func saveThenLoad() throws {
        let saved = Self.tokens(access: "a", refresh: "r")

        try store.save(saved)

        #expect(try store.load() == saved)
    }

    @Test("an unpaired device reads as nil rather than as an error")
    func loadWithNothingStored() throws {
        #expect(try store.load() == nil)
    }

    /// The downgrade this suite exists for. `WhenUnlocked` is the access window;
    /// `ThisDeviceOnly` is what keeps the pair out of iCloud Keychain and out of
    /// encrypted backups, so a restore cannot bring a live refresh token up on
    /// hardware whose Enclave key stayed behind.
    @Test("the item is written WhenUnlockedThisDeviceOnly")
    func addUsesTheDeclaredAccessibilityClass() throws {
        try store.save(Self.tokens(access: "a", refresh: "r"))

        #expect(
            try accessibilityOfStoredItem()
                == kSecAttrAccessibleWhenUnlockedThisDeviceOnly as String,
            """
            The token item is not WhenUnlockedThisDeviceOnly. A weaker class reads and \
            writes identically and is only wrong on a locked phone; anything without \
            ThisDeviceOnly rides iCloud Keychain and encrypted backups to other hardware.
            """
        )
    }

    /// `save(_:)` sets the accessibility class on the insert branch only —
    /// `SecItemUpdate` is handed `kSecValueData` and nothing else. Whether the
    /// class survives that is a property of the Keychain, not of this code, so
    /// it is asserted rather than assumed.
    @Test("the update branch does not drop the accessibility class the insert set")
    func updateKeepsTheAccessibilityClass() throws {
        try store.save(Self.tokens(access: "first", refresh: "first-r"))

        try store.save(Self.tokens(access: "second", refresh: "second-r"))

        #expect(
            try accessibilityOfStoredItem()
                == kSecAttrAccessibleWhenUnlockedThisDeviceOnly as String
        )
    }

    @Test("nothing this store writes is synchronizable")
    func nothingSyncs() throws {
        try store.save(Self.tokens(access: "a", refresh: "r"))

        #expect(try storedItems().count == 1)
        #expect(
            try storedItems(synchronizable: true).isEmpty,
            "a synchronizable token item is one iCloud Keychain will carry to another device"
        )
    }

    /// The `SecItemUpdate`-then-`SecItemAdd` branch, which a first save never
    /// reaches. Counting items is the assertion: a duplicate insert would leave
    /// two, and `load()` would still hand back one of them.
    @Test("saving twice updates the one item rather than adding a second")
    func saveTwiceUpdatesInPlace() throws {
        let second = Self.tokens(access: "second", refresh: "second-r")
        try store.save(Self.tokens(access: "first", refresh: "first-r"))

        try store.save(second)

        #expect(try storedItems().count == 1)
        #expect(try store.load() == second)
    }

    @Test("a wipe leaves no item behind, not merely no readable pair")
    func wipeIsTotal() throws {
        try store.save(Self.tokens(access: "a", refresh: "r"))

        try store.wipe()

        #expect(try store.load() == nil)
        #expect(try storedItems().isEmpty)
    }

    /// Revocation recovery calls this after a `403`, so it must not fail merely
    /// because the first attempt already succeeded.
    @Test("wiping twice succeeds")
    func wipeIsIdempotent() throws {
        try store.save(Self.tokens(access: "a", refresh: "r"))

        try store.wipe()

        #expect(throws: Never.self) { try store.wipe() }
    }

    /// `wipe()` is scoped to the service and deliberately not to the account, so
    /// an item an older build filed under a different account name goes too. A
    /// wipe that only removes what this build knows about is not a wipe.
    @Test("a wipe clears the service, not just this build's account name")
    func wipeIsScopedToTheService() throws {
        let legacy: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.service,
            kSecAttrAccount as String: "device-tokens-v0",
            kSecUseDataProtectionKeychain as String: true,
            kSecValueData as String: Data("legacy pair".utf8),
        ]
        #expect(SecItemAdd(legacy as CFDictionary, nil) == errSecSuccess)
        try store.save(Self.tokens(access: "a", refresh: "r"))

        try store.wipe()

        #expect(try storedItems().isEmpty)
    }

    /// A blob that is present but undecodable — a downgrade, a truncated write —
    /// is reported rather than crashed on, because the pairing path treats it as
    /// unpaired and re-pairs.
    @Test("a stored blob that is not a token pair reports corruption")
    func corruptedPayload() throws {
        try store.save(Self.tokens(access: "a", refresh: "r"))
        let overwrite: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.service,
            kSecAttrAccount as String: Self.account,
            kSecUseDataProtectionKeychain as String: true,
        ]
        #expect(
            SecItemUpdate(
                overwrite as CFDictionary,
                [kSecValueData as String: Data("not a token pair".utf8)] as CFDictionary
            ) == errSecSuccess
        )

        #expect(throws: TokenStoreError.corruptedPayload) { try store.load() }
    }
}
