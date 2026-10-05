import Foundation

/// Incrementally parses the data payloads carried by an Ego server-sent event stream.
internal struct ServerSentEventParser {
    private var lineBytes: [UInt8] = []
    private var dataLines: [String] = []
    private var hasDataField = false

    /// Feeds an arbitrary byte chunk and returns events terminated by a blank line.
    internal mutating func feed(_ chunk: [UInt8]) -> [String] {
        var events: [String] = []

        for byte in chunk {
            if byte == 0x0A {
                events.append(contentsOf: consumeLine(terminatedByLineFeed: true))
            } else {
                lineBytes.append(byte)
            }
        }

        return events
    }

    /// Flushes the final unterminated line and any event that was not blank-line terminated.
    internal mutating func finish() -> [String] {
        var events: [String] = []
        if !lineBytes.isEmpty {
            events.append(contentsOf: consumeLine(terminatedByLineFeed: false))
        }
        events.append(contentsOf: dispatchEvent())
        return events
    }

    private mutating func consumeLine(terminatedByLineFeed: Bool) -> [String] {
        var line = lineBytes
        lineBytes.removeAll(keepingCapacity: true)

        if terminatedByLineFeed, line.last == 0x0D {
            line.removeLast()
        }

        guard !line.isEmpty else {
            return dispatchEvent()
        }
        guard line.first != 0x3A else {
            return []
        }

        let colon = line.firstIndex(of: 0x3A)
        let fieldEnd = colon ?? line.endIndex
        guard let field = String(bytes: line[..<fieldEnd], encoding: .utf8) else {
            return []
        }
        guard field == "data" else {
            return []
        }

        var valueStart = colon.map { line.index(after: $0) } ?? line.endIndex
        if valueStart < line.endIndex, line[valueStart] == 0x20 {
            valueStart = line.index(after: valueStart)
        }
        guard let value = String(bytes: line[valueStart..<line.endIndex], encoding: .utf8) else {
            return []
        }
        dataLines.append(value)
        hasDataField = true
        return []
    }

    private mutating func dispatchEvent() -> [String] {
        guard hasDataField else {
            return []
        }

        let payload = dataLines.joined(separator: "\n")
        dataLines.removeAll(keepingCapacity: true)
        hasDataField = false
        return [payload]
    }
}
