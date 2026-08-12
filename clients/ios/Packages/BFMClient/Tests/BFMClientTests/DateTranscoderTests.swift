import Foundation
import Testing

@testable import BFMClient

/// How a `format: date-time` field is read, and why it is not the runtime's
/// default.
@Suite("BFMDateTranscoder")
internal struct DateTranscoderTests {
    private let transcoder = BFMDateTranscoder()

    @Test("reads the milliseconds every TypeScript pillar emits")
    func readsFractionalSeconds() throws {
        // The shape `new Date().toISOString()` produces, which is what the BFM
        // sends for `device.lastSeenAt`. The runtime's default transcoder
        // rejects exactly this, and the whole bootstrap response with it.
        let parsed = try transcoder.decode("2026-08-12T01:38:32.095Z")

        #expect(parsed.timeIntervalSince1970 == 1_786_498_712.095)
    }

    @Test("still reads a whole-second instant")
    func readsWholeSeconds() throws {
        let parsed = try transcoder.decode("2026-08-12T01:38:32Z")

        #expect(parsed.timeIntervalSince1970 == 1_786_498_712)
    }

    @Test("reads an offset that is not Zulu")
    func readsAnOffset() throws {
        let zulu = try transcoder.decode("2026-08-12T01:38:32Z")
        let offset = try transcoder.decode("2026-08-12T11:38:32+10:00")

        #expect(zulu == offset)
    }

    @Test("refuses what is not an instant, naming what it was given")
    func refusesNonsense() {
        // Absence of a date is a failure, not a default. A transcoder that
        // answered `Date()` for garbage would put today's date on screen and
        // call it the server's.
        for raw in ["", "yesterday", "2026-08-12", "2026-08-12 01:38:32"] {
            #expect(throws: BFMDateDecodingError.self) { try transcoder.decode(raw) }
        }
    }

    @Test("says which value it could not read")
    func namesTheValue() {
        #expect(BFMDateDecodingError(raw: "soon").description.contains("soon"))
    }

    @Test("round-trips what it parsed")
    func roundTrips() throws {
        let parsed = try transcoder.decode("2026-08-12T01:38:32.095Z")
        let encoded = try transcoder.encode(parsed)

        #expect(try transcoder.decode(encoded) == parsed)
    }
}
