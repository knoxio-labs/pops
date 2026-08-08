import CryptoKit
import Foundation
import Testing

@testable import Auth
@testable import AuthTestSupport

/// The Swift half of the cross-language encoding assertion. The Node half is
/// `scripts/ci/check-device-signature-fixture.mjs`, and both read the same file.
///
/// These tests are the reason the pairing integration is not allowed to fail as
/// an unexplained 401: every encoding either end could get wrong is compared
/// against bytes that are known to verify under `node:crypto`.
@Suite("device signature encoding contract")
internal struct DeviceSignatureFixtureTests {
    let fixture: DeviceSignatureFixture

    init() throws {
        fixture = try DeviceSignatureFixture.load()
    }

    @Test("the fixture declares the contract this module implements")
    func metadataMatchesContract() {
        #expect(fixture.version == DeviceSignatureContract.version)
        #expect(fixture.curve == DeviceSignatureContract.curve)
        #expect(fixture.digest == DeviceSignatureContract.digest)
        #expect(fixture.publicKeyEncoding == DeviceSignatureContract.publicKeyEncoding)
        #expect(fixture.signatureEncoding == DeviceSignatureContract.signatureEncoding)
        #expect(fixture.transportEncoding == DeviceSignatureContract.transportEncoding)
    }

    /// The acceptance criterion this ticket exists for: the app must hand the
    /// BFM exactly these bytes. `SecKeyCopyExternalRepresentation` gives X9.63
    /// and the BFM parses SPKI, so this asserts the conversion in between.
    @Test("X9.63 from the Enclave converts to exactly the SPKI the BFM stores")
    func x963ConvertsToTheExpectedSPKI() throws {
        let key = try DevicePublicKey(x963Representation: fixture.publicKeyX963)

        #expect(key.derRepresentation == fixture.publicKeySpkiDer)
        #expect(key.base64EncodedDER == fixture.publicKeySpkiDerBase64)
    }

    @Test("the SPKI encoding round-trips back to the Enclave's bytes")
    func spkiRoundTripsToX963() throws {
        let key = try DevicePublicKey(derRepresentation: fixture.publicKeySpkiDer)

        #expect(key.x963Representation == fixture.publicKeyX963)
    }

    @Test("an SPKI key is not accepted as an X9.63 point, or the two would be interchangeable")
    func encodingsAreNotInterchangeable() {
        #expect(throws: DeviceKeyStoreError.malformedPublicKey) {
            try DevicePublicKey(x963Representation: fixture.publicKeySpkiDer)
        }
        #expect(throws: DeviceKeyStoreError.malformedPublicKey) {
            try DevicePublicKey(derRepresentation: fixture.publicKeyX963)
        }
    }

    @Test("the committed DER signature verifies against the committed key")
    func committedSignatureVerifies() throws {
        let key = try DevicePublicKey(derRepresentation: fixture.publicKeySpkiDer)

        #expect(key.isValidSignature(fixture.signatureDer, for: fixture.message))
    }

    /// Without this, "the DER signature verifies" would also pass against a
    /// verifier that accepted anything.
    @Test("a modified message does not verify")
    func tamperedMessageFails() throws {
        let key = try DevicePublicKey(derRepresentation: fixture.publicKeySpkiDer)
        let tampered = fixture.message + Data("!".utf8)

        #expect(!key.isValidSignature(fixture.signatureDer, for: tampered))
    }

    @Test("the raw r‖s encoding is rejected where DER is expected")
    func rawSignatureIsRejectedAsDER() throws {
        let key = try DevicePublicKey(derRepresentation: fixture.publicKeySpkiDer)

        #expect(!key.isValidSignature(fixture.signatureRaw, for: fixture.message))
    }

    /// Proves the negative control above is a control and not a coincidence:
    /// the raw bytes are the same signature, just encoded the other way. If
    /// they were an unrelated blob, "DER-only" would be untested.
    @Test("the raw and DER forms are the same signature")
    func rawAndDERAreTheSameSignature() throws {
        let fromRaw = try P256.Signing.ECDSASignature(rawRepresentation: fixture.signatureRaw)
        let fromDER = try P256.Signing.ECDSASignature(derRepresentation: fixture.signatureDer)

        #expect(fromRaw.derRepresentation == fixture.signatureDer)
        #expect(fromDER.rawRepresentation == fixture.signatureRaw)
        #expect(fixture.signatureRaw.count == 64)
    }

    /// The fixture pins encodings; this pins that the live signing path still
    /// produces them. A change to `signature(for:)` that started emitting raw
    /// bytes would pass every test above and fail here.
    @Test("a freshly signed message uses the same encodings as the fixture")
    func liveSigningMatchesTheContract() throws {
        let store = InMemoryKeyStore()
        let publicKey = try store.createKey()
        let message = Data("a message signed right now".utf8)

        let signature = try store.signature(for: message)

        #expect(publicKey.derRepresentation.count == fixture.publicKeySpkiDer.count)
        #expect(publicKey.x963Representation.count == 65)
        #expect(publicKey.isValidSignature(signature, for: message))
        #expect(throws: Never.self) {
            try P256.Signing.ECDSASignature(derRepresentation: signature)
        }
    }
}
