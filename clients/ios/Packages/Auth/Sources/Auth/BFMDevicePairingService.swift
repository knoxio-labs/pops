import AppCore
import BFMClient
import Foundation

/// Exchanges a code against a staged key, then activates the returned identity
/// as one credential-store transaction. A refusal or interrupted exchange
/// leaves the current identity selected and removes only the staged key.
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
        let revision = try pairingRevision()
        let candidate = try candidateKey(expectedRevision: revision)
        var activated = false
        defer {
            if !activated { try? credentialStore.keyStore.discardCandidate(candidate) }
        }

        let issued = try await issueCredentials(for: request, candidate: candidate)
        let device = PairedDevice(id: issued.deviceId, baseURL: request.baseURL)
        let tokens = DeviceTokens(
            accessToken: issued.accessToken,
            refreshToken: issued.refreshToken,
            accessTokenExpiresAt: now()
                .addingTimeInterval(TimeInterval(issued.expiresInSeconds))
        )
        let committedRevision = try activate(
            candidate,
            tokens: tokens,
            device: device,
            expectedRevision: revision
        )
        activated = true
        return PairedDevice(
            id: device.id,
            baseURL: device.baseURL,
            credentialRevision: committedRevision
        )
    }

    private func pairingRevision() throws -> UInt64 {
        do {
            return try credentialStore.currentRevision()
        } catch {
            throw PairingError.credentialStorageFailed
        }
    }

    private func candidateKey(expectedRevision: UInt64) throws -> DeviceKeyCandidate {
        do {
            return try credentialStore.createPairingCandidate(expectedRevision: expectedRevision)
        } catch {
            if error as? CredentialMutationError == .keyGenerationFailed {
                throw PairingError.keyGenerationFailed
            }
            throw PairingError.credentialStorageFailed
        }
    }

    private func issueCredentials(
        for request: PairingRequest,
        candidate: DeviceKeyCandidate
    ) async throws -> IssuedDeviceCredentials {
        do {
            return try await exchange(request.baseURL).pairDevice(
                code: request.code,
                publicKeyBase64DER: candidate.publicKey.base64EncodedDER,
                deviceName: request.deviceName,
                deviceModel: request.deviceModel
            )
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw Self.pairingError(for: error)
        }
    }

    private func activate(
        _ candidate: DeviceKeyCandidate,
        tokens: DeviceTokens,
        device: PairedDevice,
        expectedRevision: UInt64
    ) throws -> UInt64 {
        do {
            return try credentialStore.commitPairing(
                candidate: candidate,
                tokens: tokens,
                device: device,
                expectedRevision: expectedRevision
            )
        } catch {
            throw PairingError.credentialStorageFailed
        }
    }

    private static func pairingError(for error: any Error) -> PairingError {
        switch error as? BFMClientError {
        case .pairingRefused(.codeRejected):
            return .codeRejected
        case .pairingRefused(.invalidRequest):
            return .invalidRequest
        case .pairingRefused(.rateLimited(let retryAfterSeconds)):
            return .rateLimited(retryAfterSeconds: retryAfterSeconds)
        case .undocumentedResponse, .transportFailure, .refreshRefused, .none:
            return .unreachable
        }
    }
}
