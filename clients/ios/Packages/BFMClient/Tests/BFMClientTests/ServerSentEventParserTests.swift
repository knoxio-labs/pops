import Testing

@testable import BFMClient

@Suite
internal struct ServerSentEventParserTests {
    @Test
    func byteByByteInputMatchesOneChunkInput() {
        let input = Array(
            ": heartbeat\r\nevent: token\r\ndata: first\r\ndata: 🌙\r\n\r\nid: ignored\nretry: 10\ndata: second\n\n"
                .utf8)

        var oneChunkParser = ServerSentEventParser()
        let oneChunkEvents = oneChunkParser.feed(input) + oneChunkParser.finish()

        var byteParser = ServerSentEventParser()
        var byteEvents: [String] = []
        for byte in input {
            byteEvents.append(contentsOf: byteParser.feed([byte]))
        }
        byteEvents.append(contentsOf: byteParser.finish())

        #expect(byteEvents == oneChunkEvents)
        #expect(oneChunkEvents == ["first\n🌙", "second"])
    }

    @Test
    func splitMultibyteCharacterIsBufferedAcrossChunks() {
        let bytes = Array("data: 🧠\n\n".utf8)
        let firstChunkEnd = Array("data: ".utf8).count + 1
        var parser = ServerSentEventParser()

        let firstEvents = parser.feed(Array(bytes[..<firstChunkEnd]))
        let secondEvents = parser.feed(Array(bytes[firstChunkEnd...]))

        #expect(firstEvents.isEmpty)
        #expect(secondEvents == ["🧠"])
    }

    @Test
    func blankLinesDispatchMultilineDataAndIgnoreHeartbeatAndMetadata() {
        var parser = ServerSentEventParser()
        let input = Array(
            ": ping\n\nevent: token\nid: 4\nretry: 2000\n\ndata: first\ndata: second\n\ndata: third\n\n"
                .utf8)

        let events = parser.feed(input)

        #expect(events == ["first\nsecond", "third"])
        #expect(parser.finish().isEmpty)
    }

    @Test
    func finishFlushesAnUnterminatedTailOnlyWhenCalled() {
        var parser = ServerSentEventParser()

        #expect(parser.feed(Array("data: final payload".utf8)).isEmpty)
        #expect(parser.finish() == ["final payload"])
        #expect(parser.finish().isEmpty)
    }

    @Test
    func eventsWithoutDataAreIgnoredButAnEmptyDataFieldIsKept() {
        var parser = ServerSentEventParser()

        let events = parser.feed(Array("event: ping\n\nid\n\ndata:\n\n".utf8))

        #expect(events == [""])
    }
}
