import AppCore
import HTTPTypes
import OpenAPIRuntime
import Testing

@testable import BFMClient

@Suite("Trips Retry-After source values")
internal struct TripsRetryAfterTests {
    @Test(
        "delta seconds retain zero and the representable upper boundary, rejecting invented spellings"
    )
    internal func deltaSeconds() {
        #expect(BFMRetryAfter.seconds(" 37 ") == 37)
        #expect(BFMRetryAfter.seconds("0") == 0)
        #expect(BFMRetryAfter.seconds(String(Int.max)) == Int.max)
        for value in [nil, "", " ", "+10", "-5", "12.5", "0x10", "10,20", String(Int.max) + "0"] {
            #expect(BFMRetryAfter.seconds(value) == nil)
        }
    }

    @Test("all three HTTP-date forms are supported without accepting arbitrary date-like strings")
    internal func httpDates() throws {
        let now = try #require(ISO8601Instant.parse("1994-11-06T08:49:30Z"))
        for value in [
            "Sun, 06 Nov 1994 08:49:37 GMT", "Sunday, 06-Nov-94 08:49:37 GMT",
            "Sun Nov  6 08:49:37 1994",
        ] { #expect(BFMRetryAfter.seconds(value, now: now) == 7) }
        #expect(BFMRetryAfter.seconds("Sun, 06 Nov 1994 08:49:00 GMT", now: now) == 0)
        #expect(BFMRetryAfter.seconds("Sun, 31 Feb 1994 08:49:37 GMT", now: now) == nil)
        #expect(BFMRetryAfter.seconds("1994-11-06T08:49:37Z", now: now) == nil)
    }

    @Test(
        "typed 429 mapping uses valid header values and preserves unknown delay for malformed or absent values"
    )
    internal func headerMapping() async throws {
        for header in ["37", "not a date", " ", nil] {
            let transport = StubTransport { _, _ in
                var response = HTTPResponse(status: .tooManyRequests)
                response.headerFields[.retryAfter] = header
                return (response, HTTPBody("unreadable upstream error"))
            }
            let repository = try BFMTripsRepository.stubbed(transport)
            await #expect(
                throws: RepositoryError.rateLimited(retryAfterSeconds: header == "37" ? 37 : nil)
            ) {
                try await repository.trips()
            }
        }
    }
}
