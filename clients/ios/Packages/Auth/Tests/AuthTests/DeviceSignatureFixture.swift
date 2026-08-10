import Foundation

/// The committed cross-language encoding vector.
///
/// Lives at `clients/ios/Contracts/`, outside this package, because the BFM
/// asserts against the same bytes. This side generates it — only CryptoKit can
/// produce a real P-256 signature — and the BFM vendors a copy. See
/// ``ContractsFixture`` for why it is read from disk rather than shipped as an
/// SPM resource.
internal struct DeviceSignatureFixture: ContractsFixture {
    let version: Int
    let curve: String
    let digest: String
    let publicKeyEncoding: String
    let signatureEncoding: String
    let transportEncoding: String
    let messageBase64: String
    let publicKeySpkiDerBase64: String
    let publicKeyX963Base64: String
    let signatureDerBase64: String
    let signatureRawBase64: String

    static let relativePath = "Contracts/device-signature-v1.json"

    var message: Data { Self.decodeBase64(messageBase64) }
    var publicKeySpkiDer: Data { Self.decodeBase64(publicKeySpkiDerBase64) }
    var publicKeyX963: Data { Self.decodeBase64(publicKeyX963Base64) }
    var signatureDer: Data { Self.decodeBase64(signatureDerBase64) }
    var signatureRaw: Data { Self.decodeBase64(signatureRawBase64) }
}
