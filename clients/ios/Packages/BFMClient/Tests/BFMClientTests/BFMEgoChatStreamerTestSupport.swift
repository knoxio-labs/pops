import AppCore
import Foundation
import Testing

@testable import BFMClient

internal struct BFMEgoChatStreamerTestSetup {
    internal let streamer: BFMEgoChatStreamer
    internal let source: ScriptedBFMByteSource
}

internal enum BFMEgoChatStreamerTestSupport {
    internal static func setup(statusCode: Int, body: String) throws
        -> BFMEgoChatStreamerTestSetup
    {
        let source = ScriptedBFMByteSource(replies: [
            .init(statusCode: statusCode, body: Data(body.utf8))
        ])
        let transport = BFMEgoByteTransport(
            baseURL: try #require(URL(string: "https://bfm.example")),
            authorizer: RecordingBFMStreamAuthorizer(accessToken: nil),
            source: source)
        return BFMEgoChatStreamerTestSetup(
            streamer: BFMEgoChatStreamer(transport: transport), source: source)
    }

    internal static func frame(_ payload: String) -> String {
        "data: \(payload)\n\n"
    }

    internal static func collect(
        _ stream: AsyncThrowingStream<EgoStreamEvent, any Error>
    ) async throws -> [EgoStreamEvent] {
        var events: [EgoStreamEvent] = []
        for try await event in stream {
            events.append(event)
        }
        return events
    }
}
