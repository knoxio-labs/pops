import OpenAPIRuntime
import Testing

@testable import Auth

/// The four shapes a request body can take, asserted directly.
///
/// `AuthenticatingMiddlewareConcurrencyTests` covers the two that a real
/// request produces today, through the middleware. This suite covers all of
/// them at the boundary that decides, because the interesting cases are the
/// ones no `/mobile` route sends yet: the cap, and the body that cannot be
/// replayed at all. Reaching those through the middleware would mean
/// constructing a request no contract describes.
@Suite("ReplayableBody")
internal struct ReplayableBodyTests {
    /// A body that can only be read once, which is what the classification is
    /// about — `HTTPBody` built from a stream reports `.single`.
    private func singlePass(byteCount: Int, length: HTTPBody.Length) -> HTTPBody {
        let bytes = Array(repeating: UInt8(0x5A), count: byteCount)
        let stream = AsyncStream<ArraySlice<UInt8>> { continuation in
            continuation.yield(ArraySlice(bytes))
            continuation.finish()
        }
        return HTTPBody(stream, length: length)
    }

    private func collect(_ body: HTTPBody?) async throws -> [UInt8]? {
        guard let body else { return nil }
        return try await [UInt8](collecting: body, upTo: 4 << 20)
    }

    @Test("no body stays no body, on every attempt")
    func absentBodyIsReplayable() async throws {
        let replayable = try await ReplayableBody(capturing: nil)

        #expect(replayable.isReplayable)
        #expect(replayable.body() == nil)
        #expect(replayable.body() == nil)
    }

    /// The common path: everything the generated client builds from encoded
    /// JSON reports `.multiple`, so it is handed back untouched and costs no
    /// copy.
    @Test("a re-iterable body is passed through and can be read twice")
    func reiterableBodyIsHandedBackAsIs() async throws {
        let payload = Array(#"{"deviceToken":"apns"}"#.utf8)
        let body = HTTPBody(payload)
        #expect(body.iterationBehavior == .multiple)

        let replayable = try await ReplayableBody(capturing: body)

        #expect(replayable.isReplayable)
        #expect(try await collect(replayable.body()) == payload)
        #expect(try await collect(replayable.body()) == payload)
    }

    @Test("a single-pass body of known, small length is buffered and replayed")
    func smallSinglePassBodyIsBuffered() async throws {
        let body = singlePass(byteCount: 32, length: .known(32))
        #expect(body.iterationBehavior == .single)

        let replayable = try await ReplayableBody(capturing: body)

        #expect(replayable.isReplayable)
        let first = try await collect(replayable.body())
        let second = try await collect(replayable.body())
        #expect(first == second)
        #expect(first?.count == 32)
    }

    /// The boundary. Off by one here would mean a body of exactly the cap being
    /// classified as unbuffereable, which is a `401` that escalates instead of
    /// retrying — and only ever on a payload of one specific size.
    @Test("a single-pass body of exactly the cap is still buffered")
    func bodyAtTheCapIsBuffered() async throws {
        let cap = ReplayableBody.maximumBufferedBytes
        let body = singlePass(byteCount: cap, length: .known(Int64(cap)))

        let replayable = try await ReplayableBody(capturing: body)

        #expect(replayable.isReplayable)
        #expect(try await collect(replayable.body())?.count == cap)
    }

    @Test("a single-pass body past the cap is not replayable")
    func bodyPastTheCapIsOneShot() async throws {
        let cap = ReplayableBody.maximumBufferedBytes
        let body = singlePass(byteCount: 8, length: .known(Int64(cap) + 1))

        let replayable = try await ReplayableBody(capturing: body)

        #expect(!replayable.isReplayable)
    }

    /// An unbounded upload. Buffering it would mean holding an arbitrary amount
    /// in memory to make a retry possible, so it is classified honestly instead
    /// — the middleware escalates rather than sending a truncated second copy.
    @Test("a single-pass body of unknown length is not replayable")
    func unboundedBodyIsOneShot() async throws {
        let replayable = try await ReplayableBody(
            capturing: singlePass(byteCount: 8, length: .unknown)
        )

        #expect(!replayable.isReplayable)
    }

    /// It is still handed over for the one attempt that is made. Refusing to
    /// replay must not become refusing to send.
    @Test("a body that cannot be replayed is still sent once")
    func oneShotBodyIsStillDelivered() async throws {
        let replayable = try await ReplayableBody(
            capturing: singlePass(byteCount: 8, length: .unknown)
        )

        #expect(try await collect(replayable.body())?.count == 8)
    }
}
