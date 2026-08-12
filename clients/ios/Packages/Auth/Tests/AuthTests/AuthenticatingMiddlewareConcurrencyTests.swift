import AuthTestSupport
import HTTPTypes
import OpenAPIRuntime
import Testing

/// What the middleware does when more than one request is in the air, and what
/// it does with a request that carries a body.
///
/// Both belong together because both are about the same mistake: assuming a
/// request is a single event that happens once. It is not — under load there
/// are twenty of them holding one credential, and with a body there are two
/// attempts that each need their own copy of it.
@Suite("AuthenticatingMiddleware under load")
internal struct AuthenticatingMiddlewareConcurrencyTests {
    /// The ticket's headline case, and the one that is easy to write so that it
    /// cannot fail.
    ///
    /// Two devices hold it in place. A barrier keeps every request at the
    /// transport until all twenty are there, so all twenty hold a `401` against
    /// the same token at the same instant. Then a gate keeps the one rotation
    /// open until the token store has been read `2 × requests + 1` times —
    /// once per request before it was sent, once per request on the way into
    /// the refresher, once by the rotation itself — so the rotation provably
    /// cannot have completed before the last caller arrived. The wait for that
    /// count is exact rather than polled, and bounded by a deadline rather
    /// than a scheduling-turn budget: see
    /// ``CountingTokenStore/waitForReads(atLeast:)`` and
    /// ``withDeadline(seconds:_:)``.
    ///
    /// Without the gate this test passes against an implementation with no
    /// single-flight at all, because each late caller finds a token newer than
    /// the one it holds and returns without refreshing. That is correct
    /// behaviour, and asserting it here would have proved the wrong thing.
    @Test("twenty concurrent 401s trigger exactly one refresh")
    func twentyConcurrentRejectionsRefreshOnce() async throws {
        let requests = 20
        let barrier = Barrier(count: requests)
        let gate = Gate()
        let counted = CountingTokenStore(InMemoryTokenStore(initial: .stub()))
        let fixture = try MiddlewareFixture(
            exchange: ScriptedRefreshExchange(beforeRefresh: { await gate.wait() }),
            tokenStore: counted
        )
        let transport = RecordingTransport.rejecting(
            "access-1",
            onArrival: { await barrier.arriveAndWait() }
        )

        try await withThrowingTaskGroup(of: HTTPResponse.self) { group in
            for index in 0..<requests {
                group.addTask {
                    try await fixture.send(
                        .mobile("/mobile/finance/transactions?p=\(index)"),
                        through: transport
                    )
                }
            }
            // The gate opens unconditionally, deadline or not: every one of the
            // twenty tasks above is parked behind it via the exchange, and a
            // gate left shut is twenty tasks the `for try await` below can never
            // finish awaiting. A failed wait must still fail the test — it just
            // cannot do that by skipping the open.
            var readsFailure: (any Error)?
            do {
                try await withDeadline { try await counted.waitForReads(atLeast: 2 * requests + 1) }
            } catch {
                readsFailure = error
            }
            await gate.open()
            if let readsFailure { throw readsFailure }

            for try await response in group { #expect(response.status == .ok) }
        }

        // The barrier releases itself rather than hanging when it is not
        // satisfied, so "every request held a 401 at once" has to be asserted
        // rather than assumed — without this the suite would still pass having
        // synchronised nothing, which is the one way this test could lie.
        #expect(
            await barrier.gaveUpWaiting == false,
            "the barrier released before every request arrived"
        )
        #expect(fixture.exchange.spends.count == 1)
        #expect(fixture.exchange.challengeCount == 1)
        #expect(transport.attempts.count == requests * 2)
        #expect(fixture.session.events.isEmpty)
    }

    /// Two requests whose tokens expire while both are in the air. Neither may
    /// be held up by the other's refresh, and neither may deadlock waiting for
    /// it: the gate is opened only once both have reached the transport, so a
    /// middleware that serialised them would never get there.
    @Test("a token expiring under two in-flight requests deadlocks neither")
    func expiryUnderConcurrentRequestsDoesNotDeadlock() async throws {
        let fixture = try MiddlewareFixture()
        let gate = Gate()
        let transport = RecordingTransport { request in
            guard request.headerFields[.authorization] == "Bearer access-1" else { return .ok }
            await gate.wait()
            return .unauthorized
        }

        try await withThrowingTaskGroup(of: HTTPResponse.self) { group in
            group.addTask { try await fixture.send(through: transport) }
            group.addTask {
                try await fixture.send(.mobile("/mobile/bootstrap?second"), through: transport)
            }
            let bothArrived = await waitUntil("both requests to reach the transport") {
                transport.attempts.count == 2
            }
            await gate.open()
            #expect(bothArrived, "a request never reached the transport")

            for try await response in group { #expect(response.status == .ok) }
        }

        #expect(fixture.exchange.spends.count == 1)
    }

    // MARK: - Bodies

    @Test("a retried request carries the same body as the first attempt")
    func replaysTheRequestBody() async throws {
        let fixture = try MiddlewareFixture()
        let transport = RecordingTransport.rejecting("access-1")
        let payload = Array(#"{"deviceToken":"apns"}"#.utf8)

        _ = try await fixture.send(body: HTTPBody(payload), through: transport)

        #expect(transport.attempts.count == 2)
        #expect(transport.attempts.allSatisfy { $0.body == payload })
    }

    /// A body that cannot be replayed is not replayed, and the `401` is
    /// returned as it stands. A retry that silently sent nothing would reach
    /// the BFM as a malformed request and be reported to the user as one — a
    /// defect that would only ever appear on a route with a body, of which
    /// there are none yet.
    @Test("a body that cannot be replayed escalates instead of being truncated")
    func doesNotRetryAnUnreplayableBody() async throws {
        let fixture = try MiddlewareFixture()
        let transport = RecordingTransport { _ in .unauthorized }
        let stream = AsyncStream<ArraySlice<UInt8>> { continuation in
            continuation.yield(ArraySlice(Array(repeating: UInt8(0x41), count: 8)))
            continuation.finish()
        }

        let response = try await fixture.send(
            body: HTTPBody(stream, length: .unknown),
            through: transport
        )

        #expect(response.status == .unauthorized)
        #expect(transport.attempts.count == 1)
        #expect(fixture.exchange.challengeCount == 0)
    }

    /// The middle case: single-pass, but small and of known length, so it is
    /// buffered and the retry is a genuine replay.
    @Test("a single-pass body of known length is buffered and replayed")
    func buffersASinglePassBody() async throws {
        let fixture = try MiddlewareFixture()
        let transport = RecordingTransport.rejecting("access-1")
        let payload = Array(repeating: UInt8(0x42), count: 32)
        let stream = AsyncStream<ArraySlice<UInt8>> { continuation in
            continuation.yield(ArraySlice(payload))
            continuation.finish()
        }

        _ = try await fixture.send(
            body: HTTPBody(stream, length: .known(Int64(payload.count))),
            through: transport
        )

        #expect(transport.attempts.count == 2)
        #expect(transport.attempts.allSatisfy { $0.body == payload })
    }
}
