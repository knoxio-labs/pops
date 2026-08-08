import Foundation

/// The committed cross-language encoding vector.
///
/// Lives at `clients/ios/Contracts/`, outside this package, because the BFM
/// asserts against the same bytes and neither side may own a private copy. It
/// is found through `#filePath` rather than shipped as an SPM resource for the
/// same reason: a resource would be a copy inside the package, and a copy is
/// the thing this fixture exists to prevent.
struct DeviceSignatureFixture: Decodable {
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

    /// Walks up from this source file until the fixture appears, rather than
    /// counting directory levels — moving this file would otherwise break the
    /// lookup with a "no such file" that says nothing about why.
    static let url: URL = {
        var directory = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        while directory.path != "/" {
            let candidate = directory.appendingPathComponent(relativePath)
            if FileManager.default.fileExists(atPath: candidate.path) { return candidate }
            directory.deleteLastPathComponent()
        }
        fatalError("no \(relativePath) above \(#filePath)")
    }()

    static func load() throws -> DeviceSignatureFixture {
        try JSONDecoder().decode(DeviceSignatureFixture.self, from: Data(contentsOf: url))
    }

    var message: Data { Self.decode(messageBase64) }
    var publicKeySpkiDer: Data { Self.decode(publicKeySpkiDerBase64) }
    var publicKeyX963: Data { Self.decode(publicKeyX963Base64) }
    var signatureDer: Data { Self.decode(signatureDerBase64) }
    var signatureRaw: Data { Self.decode(signatureRawBase64) }

    private static func decode(_ base64: String) -> Data {
        guard let data = Data(base64Encoded: base64) else {
            fatalError("fixture field is not valid base64 — regenerate \(url.path)")
        }
        return data
    }
}
