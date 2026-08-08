import Foundation

/// The two halves of the device's identity, and the one operation that has to
/// treat them as a unit.
///
/// Everything else in this package deals with the key or the tokens. Revocation
/// deals with both, and it is the only path where a partial success is worse
/// than a clean failure: the BFM has answered `403`, this device is no longer
/// trusted, and whatever is still on disk is a credential nobody will ever
/// honour but an attacker may still find useful.
public struct DeviceCredentialStore: Sendable {
    public let keyStore: any DeviceKeyStore
    public let tokenStore: any TokenStore

    public init(keyStore: any DeviceKeyStore, tokenStore: any TokenStore) {
        self.keyStore = keyStore
        self.tokenStore = tokenStore
    }

    /// The production wiring: Secure Enclave key, Keychain tokens.
    ///
    /// Unavailable on macOS deliberately. The package declares macOS so
    /// `swift test` can run the fake-backed suites on a host, and that made
    /// this factory reachable from a process where neither store can work — an
    /// unsigned test binary carries no keychain-access-group entitlement, and
    /// both stores need one: `KeychainTokenStore` to write the data-protection
    /// keychain, `SecureEnclaveKeyStore` to persist its key as
    /// `kSecAttrIsPermanent`. Host tooling that reaches for it gets a compile
    /// error rather than a runtime `errSecMissingEntitlement` it will be
    /// tempted to catch. Construct the stores directly if you genuinely mean
    /// to.
    @available(macOS, unavailable)
    public static func live() -> DeviceCredentialStore {
        DeviceCredentialStore(keyStore: SecureEnclaveKeyStore(), tokenStore: KeychainTokenStore())
    }

    /// Destroys every stored credential, on revocation or on sign-out.
    ///
    /// Tokens go first because they are the bearer half: a refresh token is
    /// usable by whoever holds it plus this device, whereas the Enclave key
    /// alone authenticates nothing. If the key deletion then fails, the device
    /// is left with an orphaned key and no way to use it, which is inert.
    ///
    /// Both deletions are attempted regardless of the first one's outcome, and
    /// the error is only raised afterwards. Returning early on the first
    /// failure is what leaves the other credential behind — the exact outcome
    /// this method exists to rule out.
    ///
    /// - Throws: ``DeviceCredentialWipeError`` if either deletion failed. The
    ///   caller must treat a throw as "credentials may still be present" and
    ///   retry, but callers must not treat it as "nothing was deleted".
    public func wipe() throws {
        var tokenFailure: (any Error)?
        var keyFailure: (any Error)?

        do { try tokenStore.wipe() } catch { tokenFailure = error }
        do { try keyStore.deleteKey() } catch { keyFailure = error }

        if tokenFailure != nil || keyFailure != nil {
            throw DeviceCredentialWipeError(
                tokenStoreFailure: tokenFailure,
                keyStoreFailure: keyFailure
            )
        }
    }
}

/// Raised when ``DeviceCredentialStore/wipe()`` could not remove everything.
///
/// Carries both underlying errors because knowing *which* half survived decides
/// what the app does next, and because reporting only the first one hides a
/// second failure behind it.
public struct DeviceCredentialWipeError: Error {
    public let tokenStoreFailure: (any Error)?
    public let keyStoreFailure: (any Error)?

    /// Whether a token may still be on the device — the case that matters.
    public var tokensMayRemain: Bool { tokenStoreFailure != nil }
}

extension DeviceCredentialWipeError: CustomStringConvertible {
    public var description: String {
        let parts = [
            tokenStoreFailure.map { "tokens: \($0)" },
            keyStoreFailure.map { "key: \($0)" },
        ].compactMap { $0 }
        return "credential wipe incomplete (\(parts.joined(separator: ", ")))"
    }
}
