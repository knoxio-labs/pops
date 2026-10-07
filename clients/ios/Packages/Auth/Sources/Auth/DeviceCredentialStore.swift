import AppCore
import Foundation
import Synchronization

/// Everything a paired device is, and the one operation that has to treat it
/// as a unit.
///
/// Everything else in this package deals with the key, the tokens or the
/// identity on its own. Revocation deals with all three, and it is the only
/// path where a partial success is worse than a clean failure: the BFM has
/// answered `403`, this device is no longer trusted, and whatever is still on
/// disk is a credential nobody will ever honour but an attacker may still find
/// useful.
public struct DeviceCredentialStore: Sendable {
    public let keyStore: any DeviceKeyStore
    public let tokenStore: any TokenStore
    /// Who this device is and where its BFM lives — the part a cold launch
    /// cannot obtain any other way. Not a secret, and stored accordingly; see
    /// ``UserDefaultsPairedDeviceStore``.
    public let pairedDeviceStore: any PairedDeviceStore
    let mutationState: CredentialMutationState

    public init(
        keyStore: any DeviceKeyStore,
        tokenStore: any TokenStore,
        pairedDeviceStore: any PairedDeviceStore
    ) {
        self.keyStore = keyStore
        self.tokenStore = tokenStore
        self.pairedDeviceStore = pairedDeviceStore
        mutationState = CredentialMutationState()
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
        DeviceCredentialStore(
            keyStore: SecureEnclaveKeyStore(),
            tokenStore: KeychainTokenStore(),
            pairedDeviceStore: UserDefaultsPairedDeviceStore()
        )
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
    /// The identity goes last, and its failure is reported like the others. It
    /// is the only one that is not a credential — losing it costs a re-pair,
    /// not a compromise — but a device left holding an identity whose tokens
    /// are gone would restore a session on the next launch and then fail every
    /// request in it, which is a worse screen than the pairing one.
    ///
    /// - Throws: ``DeviceCredentialWipeError`` if any deletion failed, or
    ///   ``PairedDeviceStoreError/revisionExhausted`` before deleting anything
    ///   if its revision cannot advance. For a wipe error, the caller must treat
    ///   credentials as possibly present and retry, not assume nothing was deleted.
    public func wipe() throws {
        _ = try performWipe(ifRevision: nil)
    }

    internal func wipe(ifRevision expectedRevision: UInt64) throws -> Bool {
        try performWipe(ifRevision: expectedRevision)
    }

    internal func createPairingCandidate(expectedRevision: UInt64) throws -> DeviceKeyCandidate {
        try mutationState.withLock { revision in
            let persistedRevision: UInt64
            do {
                persistedRevision = try pairedDeviceStore.loadSnapshot()?.revision ?? 0
            } catch {
                throw CredentialMutationError.revisionUnreadable
            }
            let currentRevision = max(revision ?? 0, persistedRevision)
            revision = currentRevision
            guard currentRevision == expectedRevision else {
                throw CredentialMutationError.superseded
            }
            do {
                return try keyStore.createCandidateKey()
            } catch {
                throw CredentialMutationError.keyGenerationFailed
            }
        }
    }

    internal func currentRevision() throws -> UInt64 {
        try mutationState.withLock { revision in
            let persistedRevision = try pairedDeviceStore.loadSnapshot()?.revision ?? 0
            let currentRevision = max(revision ?? 0, persistedRevision)
            revision = currentRevision
            return currentRevision
        }
    }

    internal func tokenSnapshot() throws -> CredentialTokenSnapshot {
        try mutationState.withLock { revision in
            let persistedRevision = try pairedDeviceStore.loadSnapshot()?.revision ?? 0
            let currentRevision = max(revision ?? 0, persistedRevision)
            revision = currentRevision
            let tokens: DeviceTokens?
            do {
                tokens = try tokenStore.load()
            } catch TokenStoreError.corruptedPayload {
                throw CredentialSnapshotError.corruptedPayload(revision: currentRevision)
            }
            return CredentialTokenSnapshot(
                revision: currentRevision,
                tokens: tokens
            )
        }
    }

    internal func signature(for message: Data, ifRevision expectedRevision: UInt64) throws -> Data?
    {
        try mutationState.withLock { revision in
            let persistedRevision = try pairedDeviceStore.loadSnapshot()?.revision ?? 0
            let currentRevision = max(revision ?? 0, persistedRevision)
            revision = currentRevision
            guard currentRevision == expectedRevision else { return nil }
            return try keyStore.signature(for: message)
        }
    }

    internal func loadTokens() throws -> DeviceTokens? {
        try mutationState.withLock { _ in try tokenStore.load() }
    }

    internal func restoreSnapshot() throws -> (device: PairedDevice?, tokens: DeviceTokens?) {
        try mutationState.withLock { revision in
            let snapshot = try pairedDeviceStore.loadSnapshot()
            let persistedRevision = snapshot?.revision ?? 0
            revision = max(revision ?? 0, persistedRevision)
            return (snapshot?.device, try tokenStore.load())
        }
    }

    internal func commitPairing(
        candidate: DeviceKeyCandidate,
        tokens: DeviceTokens,
        device: PairedDevice,
        expectedRevision: UInt64
    ) throws -> UInt64 {
        try mutationState.withLock { revision in
            let previousSnapshot = try pairedDeviceStore.loadSnapshot()
            let previousRevision = max(revision ?? 0, previousSnapshot?.revision ?? 0)
            guard previousRevision == expectedRevision else {
                throw CredentialMutationError.superseded
            }
            let previousTokens = try tokenStore.load()
            let nextRevision = try Self.nextRevision(after: previousRevision)

            try tokenStore.save(tokens)
            do {
                try pairedDeviceStore.saveSnapshot(
                    PairedDeviceSnapshot(revision: nextRevision, device: device))
            } catch {
                guard !Self.restoreTokens(previousTokens, in: tokenStore) else {
                    throw CredentialMutationError.rollbackFailed
                }
                throw error
            }

            do {
                try keyStore.activateCandidate(candidate)
            } catch {
                let tokenRollbackFailed = Self.restoreTokens(previousTokens, in: tokenStore)
                let snapshotRollbackFailed = Self.restoreSnapshot(
                    previousSnapshot,
                    revision: previousRevision,
                    in: pairedDeviceStore
                )
                guard !tokenRollbackFailed, !snapshotRollbackFailed else {
                    throw CredentialMutationError.rollbackFailed
                }
                throw error
            }

            revision = nextRevision
            return nextRevision
        }
    }

    internal func saveTokens(
        _ tokens: DeviceTokens,
        ifRevision expectedRevision: UInt64
    ) throws -> Bool {
        try mutationState.withLock { revision in
            let persistedRevision = try pairedDeviceStore.loadSnapshot()?.revision ?? 0
            let currentRevision = max(revision ?? 0, persistedRevision)
            revision = currentRevision
            guard currentRevision == expectedRevision else { return false }
            try tokenStore.save(tokens)
            return true
        }
    }
}

internal final class CredentialMutationState: Sendable {
    private static let sharedLock = Mutex(())
    private let revision = Mutex<UInt64?>(nil)

    func withLock<Value: Sendable>(
        _ operation: (inout sending UInt64?) throws -> sending Value
    ) rethrows -> sending Value {
        try Self.sharedLock.withLock { _ in
            try revision.withLock(operation)
        }
    }
}

internal enum CredentialMutationError: Error, Equatable {
    case revisionUnreadable
    case keyGenerationFailed
    case superseded
    case rollbackFailed
}

internal struct CredentialTokenSnapshot: Sendable {
    internal let revision: UInt64
    internal let tokens: DeviceTokens?
}

internal enum CredentialSnapshotError: Error {
    case corruptedPayload(revision: UInt64)
}

extension DeviceCredentialStore {
    static func nextRevision(after revision: UInt64) throws -> UInt64 {
        let (next, overflow) = revision.addingReportingOverflow(1)
        guard !overflow else { throw PairedDeviceStoreError.revisionExhausted }
        return next
    }

    fileprivate static func restoreTokens(_ tokens: DeviceTokens?, in store: any TokenStore) -> Bool
    {
        do {
            if let tokens {
                try store.save(tokens)
            } else {
                try store.wipe()
            }
            return false
        } catch {
            return true
        }
    }

    fileprivate static func restoreSnapshot(
        _ snapshot: PairedDeviceSnapshot?,
        revision: UInt64,
        in store: any PairedDeviceStore
    ) -> Bool {
        do {
            try store.saveSnapshot(
                snapshot ?? PairedDeviceSnapshot(revision: revision, device: nil))
            return false
        } catch {
            return true
        }
    }
}

/// Raised when ``DeviceCredentialStore/wipe()`` could not remove everything.
///
/// Carries every underlying error because knowing *which* part survived decides
/// what the app does next, and because reporting only the first one hides the
/// others behind it.
public struct DeviceCredentialWipeError: Error {
    public let tokenStoreFailure: (any Error)?
    public let keyStoreFailure: (any Error)?
    public let pairedDeviceStoreFailure: (any Error)?

    /// Whether a token may still be on the device — the case that matters.
    public var tokensMayRemain: Bool { tokenStoreFailure != nil }
}

extension DeviceCredentialWipeError: CustomStringConvertible {
    public var description: String {
        let parts = [
            tokenStoreFailure.map { "tokens: \($0)" },
            keyStoreFailure.map { "key: \($0)" },
            pairedDeviceStoreFailure.map { "paired device: \($0)" },
        ].compactMap { $0 }
        return "credential wipe incomplete (\(parts.joined(separator: ", ")))"
    }
}
