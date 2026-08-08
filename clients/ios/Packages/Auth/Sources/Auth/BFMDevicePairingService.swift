import AppCore
import BFMClient
import Foundation

/// Pairing, as the three steps that have to happen in order and the cleanup
/// that has to happen when one of them does not.
///
/// The ordering is the design. A key is created before the code is spent
/// because the BFM needs the public half to pair against; the tokens are stored
/// after the exchange because they do not exist until then. That leaves two
/// windows where this device can be left holding half an identity, and both are
/// closed below rather than left to the caller — a retry that pairs a second
/// key orphans the first on the server, where only the operator can see it and
/// only the operator can remove it.
public struct BFMDevicePairingService: DevicePairingService {
    private let credentialStore: DeviceCredentialStore
    private let exchange: @Sendable (URL) -> any DevicePairingExchange
    private let now: @Sendable () -> Date

    /// - Parameters:
    ///   - credentialStore: Where the key and the tokens live.
    ///   - exchange: Built per attempt rather than held, because the base URL
    ///     arrives with the pairing code — a device learns where its BFM is by
    ///     pairing, so there is no client to construct before then.
    ///   - now: Read once, to turn the server's `expiresIn` duration into a
    ///     deadline. Injected so the token's expiry is assertable.
    public init(
        credentialStore: DeviceCredentialStore,
        exchange: @escaping @Sendable (URL) -> any DevicePairingExchange = {
            BFMHTTPClient(baseURL: $0)
        },
        now: @escaping @Sendable () -> Date = Date.init
    ) {
        self.credentialStore = credentialStore
        self.exchange = exchange
        self.now = now
    }

    public func pair(_ request: PairingRequest) async throws -> PairedDevice {
        try discardAnyPreviousIdentity()

        let publicKey = try createDeviceKey()

        let issued: IssuedDeviceCredentials
        do {
            issued = try await exchange(request.baseURL).pairDevice(
                code: request.code,
                publicKeyBase64DER: publicKey.base64EncodedDER,
                deviceName: request.deviceName,
                deviceModel: request.deviceModel
            )
        } catch {
            discardDeviceKey()
            throw Self.pairingError(for: error)
        }

        do {
            try credentialStore.tokenStore.save(
                DeviceTokens(
                    accessToken: issued.accessToken,
                    refreshToken: issued.refreshToken,
                    accessTokenExpiresAt: now()
                        .addingTimeInterval(TimeInterval(issued.expiresInSeconds))
                )
            )
        } catch {
            // The one failure that leaves a device registered on the server.
            // The key goes because it can no longer be used for anything; the
            // device row cannot, and the recovery is for the operator to revoke
            // it — which is why this is its own error rather than a retryable one.
            discardDeviceKey()
            throw PairingError.credentialStorageFailed
        }

        return PairedDevice(id: issued.deviceId, baseURL: request.baseURL)
    }
}

extension BFMDevicePairingService {
    /// Clears whatever a previous identity left behind, before anything new is
    /// created.
    ///
    /// Not merely defensive. `createKey()` throws rather than replacing, so a
    /// key stranded by an attempt that died between creating it and cleaning it
    /// up — a crash, a task cancelled mid-request — would make every later
    /// pairing attempt fail as a key-generation error with no way out from
    /// inside the app. Pairing is where a device's identity is replaced
    /// wholesale, so replacing it wholesale is also the honest semantic.
    private func discardAnyPreviousIdentity() throws {
        do {
            try credentialStore.wipe()
        } catch {
            throw PairingError.credentialStorageFailed
        }
    }

    private func createDeviceKey() throws -> DevicePublicKey {
        do {
            return try credentialStore.keyStore.createKey()
        } catch {
            throw PairingError.keyGenerationFailed
        }
    }

    /// Best effort, and deliberately silent. Every caller is already throwing
    /// the error that explains the failure, and replacing it with a cleanup
    /// error would hide the cause behind the tidying. What a failure here
    /// leaves behind is an Enclave key the BFM has never seen, which
    /// authenticates nothing.
    private func discardDeviceKey() {
        try? credentialStore.keyStore.deleteKey()
    }

    /// Maps by exclusion rather than by naming the error a dead network
    /// produces, because there is no single such error to name: the generated
    /// client wraps whatever the transport threw in an `OpenAPIRuntime`
    /// `ClientError`, so matching on `URLError` would match nothing and send
    /// every offline attempt down the default branch anyway.
    ///
    /// An undocumented status is folded into `unreachable` on purpose. A 502
    /// from a reverse proxy or a 500 from the BFM is not something the person
    /// holding the phone can act on any differently from a dead network, and
    /// inventing a fifth thing to say about it would be a distinction with no
    /// different recovery behind it.
    private static func pairingError(for error: any Error) -> PairingError {
        switch error as? BFMClientError {
        case .pairingRefused(.codeRejected):
            return .codeRejected
        case .pairingRefused(.invalidRequest):
            return .invalidRequest
        case .pairingRefused(.rateLimited(let retryAfterSeconds)):
            return .rateLimited(retryAfterSeconds: retryAfterSeconds)
        case .undocumentedResponse, .none:
            return .unreachable
        }
    }
}
