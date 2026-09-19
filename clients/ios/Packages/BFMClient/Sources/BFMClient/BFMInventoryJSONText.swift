/// Renders an `OpenAPIValueContainer`'s unwrapped value as JSON text, for a
/// conflict's `mine`/`theirs` — a repair screen shows these side by side for
/// a person to compare, so text that round-trips exactly what the server sent
/// is what the screen needs, not a value decoded into this app's own types.
internal enum BFMInventoryJSONText {
    internal static func describe(_ value: (any Sendable)?) -> String {
        switch value {
        case nil: "null"
        case let value as String: "\"\(value)\""
        case let value as Bool: value ? "true" : "false"
        case let value as Int: String(value)
        case let value as Double: String(value)
        case let value as [(any Sendable)?]:
            "[" + value.map(describe).joined(separator: ",") + "]"
        case let value as [String: (any Sendable)?]:
            "{"
                + value.sorted { $0.key < $1.key }.map { "\"\($0.key)\":\(describe($0.value))" }
                .joined(separator: ",") + "}"
        default: "null"
        }
    }
}
