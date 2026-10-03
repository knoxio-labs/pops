import AppCore
import Foundation

/// Opens and decodes Ego chat and batch-resume event streams.
internal struct BFMEgoChatStreamer: Sendable {
    private static let operation = "mobileEgo.chatStream"

    private let transport: BFMEgoByteTransport

    internal init(transport: BFMEgoByteTransport) {
        self.transport = transport
    }

    internal func stream(
        message: String,
        conversationId: String?,
        context: EgoAppContext?
    ) -> AsyncThrowingStream<EgoStreamEvent, any Error> {
        do {
            return events(
                for: try BFMEgoWire.chatBody(
                    message: message,
                    conversationId: conversationId,
                    context: context))
        } catch {
            return Self.failedStream(error)
        }
    }

    internal func resume(
        conversationId: String,
        batchId: String
    ) -> AsyncThrowingStream<EgoStreamEvent, any Error> {
        do {
            return events(
                for: try BFMEgoWire.resumeBody(
                    conversationId: conversationId,
                    batchId: batchId))
        } catch {
            return Self.failedStream(error)
        }
    }

    private func events(for body: Data) -> AsyncThrowingStream<EgoStreamEvent, any Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    let opening = try await transport.open(body: body)
                    try Task.checkCancellation()

                    switch opening {
                    case .streaming(let bytes):
                        var parser = ServerSentEventParser()
                        for try await chunk in bytes {
                            try Task.checkCancellation()
                            if try Self.yieldEvents(
                                from: parser.feed(chunk),
                                to: continuation)
                            {
                                return
                            }
                        }

                        try Task.checkCancellation()
                        if try Self.yieldEvents(from: parser.finish(), to: continuation) {
                            return
                        }
                        continuation.finish(
                            throwing: RepositoryError.transport(
                                "\(Self.operation): stream ended early"))
                    case .rejected(let status, _, let body):
                        continuation.finish(
                            throwing: Self.rejectionError(status: status, body: body))
                    }
                } catch {
                    continuation.finish(throwing: error)
                }
            }

            continuation.onTermination = { @Sendable _ in
                task.cancel()
            }
        }
    }

    private static func yieldEvents(
        from payloads: [String],
        to continuation: AsyncThrowingStream<EgoStreamEvent, any Error>.Continuation
    ) throws -> Bool {
        for payload in payloads {
            guard let event = try BFMEgoWire.event(fromFramePayload: payload) else {
                continue
            }
            if case .terminated = continuation.yield(event) {
                return true
            }
            switch event {
            case .done, .failed:
                continuation.finish()
                return true
            case .token, .tool, .part, .navigate:
                break
            }
        }
        return false
    }

    private static func rejectionError(status: Int, body: Data) -> RepositoryError {
        switch status {
        case 401, 403:
            return .unauthorized
        case 502, 503:
            guard let failure = try? JSONDecoder().decode(BFMEgoUpstreamFailure.self, from: body),
                !failure.code.isEmpty
            else {
                return .unavailable
            }
            return BFMRepositoryFailure.upstreamFailure(failure.code, operation: operation)
        case 429:
            return .transport("\(operation): rate limited")
        default:
            return .transport("\(operation): HTTP \(status)")
        }
    }

    private static func failedStream(
        _ error: any Error
    ) -> AsyncThrowingStream<EgoStreamEvent, any Error> {
        AsyncThrowingStream { continuation in
            continuation.finish(throwing: error)
        }
    }
}

private struct BFMEgoUpstreamFailure: Decodable {
    let code: String
}
