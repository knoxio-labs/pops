import Foundation
import Synchronization

/// A single read-context lifetime. Retirement is irreversible even if the same pairing is selected again.
public final class TripOfflineReadContext: Sendable {
    private let active = Mutex(true)
    @MainActor private let isCurrent: @MainActor @Sendable () throws -> Bool

    /// The app checks both its rendered session and the persisted pairing at every point of use.
    @MainActor
    public init(isCurrent: @escaping @MainActor @Sendable () throws -> Bool) {
        self.isCurrent = isCurrent
    }

    /// Retires pending reads synchronously from the existing session observation boundary.
    public func retire() {
        active.withLock { $0 = false }
    }

    /// Rejects retired contexts, replacement pairings and revoked credentials before any cache adoption.
    @MainActor
    public func assertCurrent() throws {
        guard active.withLock({ $0 }), try isCurrent() else {
            throw TripDocumentOfflineError.ownerChanged
        }
    }
}

/// Exact resources whose failed verification must not be replaced by a successful stale read.
public enum TripOfflineReadResource: Codable, Hashable, Sendable {
    case catalogue
    case trip(Int)
    case document(Int)
    case file(Int)
}

/// Records whether this particular read reached its owner or used an explicitly last-verified value.
public enum TripOfflineReadProvenance: Hashable, Sendable {
    case remote(verifiedAt: Date)
    case lastVerified(verifiedAt: Date)
}
