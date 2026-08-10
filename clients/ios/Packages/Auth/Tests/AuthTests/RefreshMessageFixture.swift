import Foundation

/// The committed vector for the bytes a refresh request is signed over.
///
/// The mirror of ``DeviceSignatureFixture``: that one pins the *encodings* and
/// this side authors it, this one pins the *message* those encodings are
/// applied to and the BFM authors it — `refreshSignatureMessage()` there
/// defines the format, and that verifier is what rejects a wrong one. This
/// package holds a vendored copy at
/// `clients/ios/Contracts/refresh-message-v1.json`, and
/// `scripts/ci/check-refresh-message-fixture.mjs` fails the build if it drifts
/// from the pillar's.
internal struct RefreshMessageFixture: ContractsFixture {
    let version: Int
    let domain: String
    let nonce: String
    let refreshToken: String
    let refreshTokenSha256Hex: String
    let messageBase64: String

    static let relativePath = "Contracts/refresh-message-v1.json"

    var message: Data { Self.decodeBase64(messageBase64) }
}
