import Auth
import Foundation
import Synchronization

/// A ``TokenStore`` that keeps the pair in memory.
///
/// Mirrors ``KeychainTokenStore``'s whole-pair contract exactly, including the
/// property that matters: there is no way to write or remove one token without
/// the other, so a test that passes here is testing the same shape the real
/// store implements.
///
/// Ships in `AuthTestSupport` for the same reason as ``InMemoryKeyStore`` —
/// tokens held here survive nothing and protect nothing.
public final class InMemoryTokenStore: TokenStore {
    private let tokens = Mutex<DeviceTokens?>(nil)

    public init(initial: DeviceTokens? = nil) {
        tokens.withLock { $0 = initial }
    }

    public func load() throws -> DeviceTokens? {
        tokens.withLock { $0 }
    }

    public func save(_ newTokens: DeviceTokens) throws {
        tokens.withLock { $0 = newTokens }
    }

    public func wipe() throws {
        tokens.withLock { $0 = nil }
    }
}
