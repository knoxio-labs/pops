import AppCore
import Foundation
import Testing

@testable import BFMClient

@Suite
internal struct BFMEgoChatStreamerCancellationTests {
    private actor FirstEvent {
        private let events: AsyncStream<Void>
        private let continuation: AsyncStream<Void>.Continuation
        private var event: EgoStreamEvent?

        init() {
            let pair = AsyncStream<Void>.makeStream(bufferingPolicy: .bufferingNewest(1))
            events = pair.stream
            continuation = pair.continuation
        }

        func record(_ event: EgoStreamEvent) {
            self.event = event
            continuation.yield(())
            continuation.finish()
        }

        func wait() async -> Bool {
            if event != nil { return true }
            for await _ in events {
                return true
            }
            return false
        }

        func value() -> EgoStreamEvent? {
            event
        }
    }

    private actor CancellationSignal {
        private let events: AsyncStream<Void>
        private let continuation: AsyncStream<Void>.Continuation
        private var signalled = false

        init() {
            let pair = AsyncStream<Void>.makeStream(bufferingPolicy: .bufferingNewest(1))
            events = pair.stream
            continuation = pair.continuation
        }

        func signal() {
            guard !signalled else { return }
            signalled = true
            continuation.yield(())
            continuation.finish()
        }

        func wait() async -> Bool {
            if signalled { return true }
            for await _ in events {
                return true
            }
            return false
        }
    }

    private actor CancellationAwareByteSource: BFMByteSource {
        private let cancellation = CancellationSignal()

        func open(_ request: URLRequest) async throws -> (
            HTTPURLResponse, AsyncThrowingStream<[UInt8], any Error>
        ) {
            guard let url = request.url,
                let response = HTTPURLResponse(
                    url: url,
                    statusCode: 200,
                    httpVersion: nil,
                    headerFields: nil)
            else {
                throw URLError(.badURL)
            }

            let cancellation = self.cancellation
            let bytes = AsyncThrowingStream<[UInt8], any Error> { continuation in
                continuation.yield(
                    Array("data: {\"type\":\"token\",\"text\":\"first\"}\n\n".utf8))
                continuation.onTermination = { @Sendable _ in
                    Task { await cancellation.signal() }
                }
            }
            return (response, bytes)
        }

        func waitForCancellation() async -> Bool {
            await cancellation.wait()
        }
    }

    @Test
    func cancellingConsumerCancelsTheByteSource() async throws {
        let source = CancellationAwareByteSource()
        let transport = BFMEgoByteTransport(
            baseURL: try #require(URL(string: "https://bfm.example")),
            authorizer: RecordingBFMStreamAuthorizer(accessToken: nil),
            source: source)
        let streamer = BFMEgoChatStreamer(transport: transport)
        let firstEvent = FirstEvent()
        let consumer = Task {
            do {
                for try await event in streamer.stream(
                    message: "hello", conversationId: nil, context: nil)
                {
                    await firstEvent.record(event)
                }
            } catch {
                // Consumer cancellation ends this stream.
            }
        }

        #expect(await Self.waitFor(firstEvent))
        #expect(await firstEvent.value() == .token("first"))
        consumer.cancel()
        #expect(await Self.waitFor(source))
        await consumer.value
    }

    private static func waitFor(_ recorder: FirstEvent) async -> Bool {
        await withTaskGroup(of: Bool.self) { group in
            group.addTask { await recorder.wait() }
            group.addTask {
                try? await Task.sleep(for: .seconds(5))
                return false
            }
            let result = await group.next() ?? false
            group.cancelAll()
            return result
        }
    }

    private static func waitFor(_ source: CancellationAwareByteSource) async -> Bool {
        await withTaskGroup(of: Bool.self) { group in
            group.addTask { await source.waitForCancellation() }
            group.addTask {
                try? await Task.sleep(for: .seconds(5))
                return false
            }
            let result = await group.next() ?? false
            group.cancelAll()
            return result
        }
    }
}
