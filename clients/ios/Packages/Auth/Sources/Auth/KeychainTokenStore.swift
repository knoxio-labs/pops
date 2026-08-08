import Foundation
import Security

/// Keychain-backed ``TokenStore``.
///
/// ## One item, not two
///
/// Both tokens live in a single generic-password item as one encoded blob.
/// The obvious alternative — an item per token — was rejected because it makes
/// the failure this store exists to prevent reachable: two `SecItemDelete`
/// calls can partially fail, and the half that survives is the refresh token,
/// the one that is still worth stealing. There is no Keychain transaction to
/// wrap them in, so the fix is to have nothing to interleave. One item means
/// ``save(_:)`` and ``wipe()`` are each a single Security-framework call whose
/// outcome is binary.
///
/// ## Accessibility class
///
/// `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`, matching
/// ``SecureEnclaveKeyStore``. `ThisDeviceOnly` is the load-bearing half: it
/// keeps the pair out of iCloud Keychain and out of encrypted backups, so a
/// restore cannot bring a live refresh token up on different hardware while the
/// key that is supposed to accompany it stays behind — the one combination the
/// proof-of-possession design assumes cannot happen.
///
/// `kSecUseDataProtectionKeychain` is set explicitly so a macOS test host gets
/// the same data-protection keychain semantics as the phone rather than the
/// file-based keychain, which behaves differently enough to make a passing
/// host test meaningless.
public struct KeychainTokenStore: TokenStore {
    private let service: String
    private let account: String

    /// - Parameters:
    ///   - service: Keychain `kSecAttrService`. ``wipe()`` clears this service
    ///     wholesale, so it must not be shared with anything that should survive
    ///     revocation.
    ///   - account: Keychain `kSecAttrAccount` for the single token item.
    public init(
        service: String = "com.knoxiolabs.pops.auth",
        account: String = "device-tokens"
    ) {
        self.service = service
        self.account = account
    }

    public func load() throws -> DeviceTokens? {
        var query = itemQuery()
        query[kSecReturnData] = true
        query[kSecMatchLimit] = kSecMatchLimitOne

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        switch status {
        case errSecSuccess:
            guard let item, CFGetTypeID(item) == CFDataGetTypeID() else {
                throw TokenStoreError.corruptedPayload
            }
            let data = unsafeDowncast(item, to: CFData.self) as Data
            guard let tokens = try? JSONDecoder.tokenDecoder.decode(DeviceTokens.self, from: data)
            else {
                throw TokenStoreError.corruptedPayload
            }
            return tokens
        case errSecItemNotFound:
            return nil
        default:
            throw TokenStoreError.keychain(status)
        }
    }

    public func save(_ tokens: DeviceTokens) throws {
        // Encoding cannot fail for this shape — every field is a String or a
        // Date — but `try!` would turn a future field that can fail into a
        // crash on the pairing path, so it is surfaced as corruption instead.
        guard let payload = try? JSONEncoder.tokenEncoder.encode(tokens) else {
            throw TokenStoreError.corruptedPayload
        }

        let update = SecItemUpdate(
            itemQuery() as CFDictionary,
            [kSecValueData: payload] as CFDictionary
        )
        if update == errSecSuccess { return }
        guard update == errSecItemNotFound else { throw TokenStoreError.keychain(update) }

        var insert = itemQuery()
        insert[kSecValueData] = payload
        insert[kSecAttrAccessible] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let added = SecItemAdd(insert as CFDictionary, nil)
        guard added == errSecSuccess else { throw TokenStoreError.keychain(added) }
    }

    public func wipe() throws {
        // Scoped to the service rather than to `account`, so an item written by
        // an older build under a different account name is removed too. A wipe
        // that only removes what this build happens to know about is not a wipe.
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecUseDataProtectionKeychain: true,
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw TokenStoreError.keychain(status)
        }
    }

    private func itemQuery() -> [CFString: Any] {
        [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account,
            kSecAttrSynchronizable: false,
            kSecUseDataProtectionKeychain: true,
        ]
    }
}

extension JSONEncoder {
    fileprivate static var tokenEncoder: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }
}

extension JSONDecoder {
    fileprivate static var tokenDecoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}
