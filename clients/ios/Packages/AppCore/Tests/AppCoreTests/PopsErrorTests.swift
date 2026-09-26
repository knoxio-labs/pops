import AppCore
import Foundation
import Testing

@Suite("POPS errors")
internal struct PopsErrorTests {
    @Test("the model round-trips its public wire representation")
    func codableRoundTrip() throws {
        let source = PopsError(
            code: "inventory.codes.name_required",
            message: "Name the item before asking for a code.",
            requestID: "01K123",
            retryable: false,
            kind: .client
        )

        let decoded = try JSONDecoder().decode(PopsError.self, from: JSONEncoder().encode(source))

        #expect(decoded == source)
        #expect(decoded.localizedDescription == source.message)
    }
}
