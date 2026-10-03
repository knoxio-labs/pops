import Foundation
import Testing

@testable import BFMClient

@Suite
internal struct BFMURLSessionByteSourceTests {
    private actor FirstByteChunk {
        private let events: AsyncStream<[UInt8]>
        private let continuation: AsyncStream<[UInt8]>.Continuation

        init() {
            let pair = AsyncStream<[UInt8]>.makeStream(bufferingPolicy: .bufferingNewest(1))
            events = pair.stream
            continuation = pair.continuation
        }

        func record(_ chunk: [UInt8]) {
            continuation.yield(chunk)
            continuation.finish()
        }

        func wait() async -> [UInt8]? {
            for await chunk in events {
                return chunk
            }
            return nil
        }
    }

    @Test
    func chunksBodyAndFlushesFinalPartialChunk() async throws {
        let body = Data((0..<8_209).map { UInt8($0 % 251) })
        let scenario = EgoURLSessionByteSourceScenario(body: body, finishes: true)
        let (session, request) = try Self.urlSessionRequest(scenario: scenario)
        defer { session.invalidateAndCancel() }

        let (response, bytes) = try await URLSessionByteSource(session: session).open(request)

        var chunks: [[UInt8]] = []
        for try await chunk in bytes {
            chunks.append(chunk)
        }
        #expect(response.statusCode == 200)
        #expect(chunks.map(\.count) == [4096, 4096, 17])
        #expect(Data(chunks.flatMap { $0 }) == body)
    }

    @Test
    func cancelsRequestWhenConsumerStops() async throws {
        let scenario = EgoURLSessionByteSourceScenario(
            body: Data(repeating: 0x61, count: 4096), finishes: false)
        let (session, request) = try Self.urlSessionRequest(scenario: scenario)
        defer { session.invalidateAndCancel() }

        let (_, bytes) = try await URLSessionByteSource(session: session).open(request)
        let firstChunk = FirstByteChunk()
        let consumer = Task {
            do {
                for try await chunk in bytes {
                    await firstChunk.record(chunk)
                    try Task.checkCancellation()
                }
            } catch {
                // The consumer intentionally cancels after receiving its first chunk.
            }
        }

        let chunk = await Self.firstChunk(from: firstChunk)
        #expect(chunk?.count == 4096)
        #expect(chunk == Array(repeating: 0x61, count: 4096))

        consumer.cancel()
        #expect(await Self.waitForCancellation(scenario.cancellation))
        await consumer.value
    }

    private static func urlSessionRequest(
        scenario: EgoURLSessionByteSourceScenario
    ) throws -> (URLSession, URLRequest) {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [EgoURLSessionByteSourceURLProtocol.self]
        let session = URLSession(configuration: configuration)
        let request = scenario.request(
            for: try #require(URL(string: "https://bfm.example/stream")))
        return (session, request)
    }

    private static func firstChunk(from recorder: FirstByteChunk) async -> [UInt8]? {
        await withTaskGroup(of: [UInt8]?.self) { group in
            group.addTask { await recorder.wait() }
            group.addTask {
                try? await Task.sleep(for: .seconds(5))
                return nil
            }
            guard let result = await group.next() else {
                group.cancelAll()
                return nil
            }
            group.cancelAll()
            return result
        }
    }

    private static func waitForCancellation(
        _ cancellation: EgoURLSessionByteSourceCancellation
    ) async -> Bool {
        await withTaskGroup(of: Bool.self) { group in
            group.addTask {
                await cancellation.waitForCancellation()
                return true
            }
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
