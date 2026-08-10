import Auth
import BFMClient
import Foundation
import Synchronization

/// A ``DevicePairingExchange`` that answers from a script and remembers what it
/// was asked.
///
/// A `Mutex` rather than an actor so a synchronous assertion can read it after
/// the call, and because the protocol's only method is already `async`.
internal final class ScriptedPairingExchange: DevicePairingExchange {
    internal struct Call: Sendable, Equatable {
        internal let code: String
        internal let publicKeyBase64DER: String
        internal let deviceName: String
        internal let deviceModel: String
    }

    private let outcome: Mutex<Result<IssuedDeviceCredentials, any Error>>
    private let recorded = Mutex<[Call]>([])

    internal init(_ outcome: Result<IssuedDeviceCredentials, any Error> = .success(.stub())) {
        self.outcome = Mutex(outcome)
    }

    internal var calls: [Call] { recorded.withLock { $0 } }

    internal func pairDevice(
        code: String,
        publicKeyBase64DER: String,
        deviceName: String,
        deviceModel: String
    ) async throws -> IssuedDeviceCredentials {
        recorded.withLock {
            $0.append(
                Call(
                    code: code,
                    publicKeyBase64DER: publicKeyBase64DER,
                    deviceName: deviceName,
                    deviceModel: deviceModel
                )
            )
        }
        return try outcome.withLock { $0 }.get()
    }
}

extension IssuedDeviceCredentials {
    internal static func stub(
        deviceId: String = "6ba7b810-9dad-41d1-80b4-00c04fd430c8",
        accessToken: String = "access-token",
        refreshToken: String = "refresh-token",
        expiresInSeconds: Int = 900
    ) -> IssuedDeviceCredentials {
        IssuedDeviceCredentials(
            deviceId: deviceId,
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresInSeconds: expiresInSeconds
        )
    }
}

/// A key store that fails whichever operation a test names, and delegates the
/// rest to a real in-memory one.
///
/// Wrapping rather than reimplementing: a hand-written stub would let a test
/// pass against behaviour ``InMemoryKeyStore`` does not have, and the point of
/// these tests is what the service does around a store that behaves.
internal final class FailingKeyStore: DeviceKeyStore {
    internal enum Operation: Sendable {
        case create
        case delete
    }

    private let wrapped: any DeviceKeyStore
    private let failing: Set<Operation>

    internal init(wrapping wrapped: any DeviceKeyStore, failing: Set<Operation>) {
        self.wrapped = wrapped
        self.failing = failing
    }

    @discardableResult
    internal func createKey() throws -> DevicePublicKey {
        guard !failing.contains(.create) else {
            throw DeviceKeyStoreError.secureEnclaveUnavailable(code: -26275)
        }
        return try wrapped.createKey()
    }

    internal func publicKey() throws -> DevicePublicKey? { try wrapped.publicKey() }

    internal func signature(for message: Data) throws -> Data {
        try wrapped.signature(for: message)
    }

    internal func deleteKey() throws {
        guard !failing.contains(.delete) else {
            throw DeviceKeyStoreError.keychain(errSecInternalError)
        }
        try wrapped.deleteKey()
    }
}

/// A token store whose `save` or `wipe` fails, wrapping a real one.
internal final class FailingTokenStore: TokenStore {
    internal enum Operation: Sendable {
        case save
        case wipe
    }

    private let wrapped: any TokenStore
    private let failing: Set<Operation>

    internal init(wrapping wrapped: any TokenStore, failing: Set<Operation>) {
        self.wrapped = wrapped
        self.failing = failing
    }

    internal func load() throws -> DeviceTokens? { try wrapped.load() }

    internal func save(_ tokens: DeviceTokens) throws {
        guard !failing.contains(.save) else { throw TokenStoreError.keychain(errSecInternalError) }
        try wrapped.save(tokens)
    }

    internal func wipe() throws {
        guard !failing.contains(.wipe) else { throw TokenStoreError.keychain(errSecInternalError) }
        try wrapped.wipe()
    }
}
