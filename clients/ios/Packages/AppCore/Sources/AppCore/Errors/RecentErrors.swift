/// The device-local ring buffer of failures available to support diagnostics.
public struct RecentErrors: Codable, Hashable, Sendable {
    /// The maximum number of retained failures.
    public static let limit = 50

    /// Newest failure first.
    public private(set) var entries: [PresentedError]

    /// Creates a bounded history, dropping the oldest supplied entries.
    public init(_ entries: [PresentedError] = []) {
        self.entries = Array(entries.prefix(Self.limit))
    }

    /// Inserts a failure as the newest entry and preserves the 50-entry bound.
    public mutating func record(_ error: PresentedError) {
        entries.insert(error, at: 0)
        if entries.count > Self.limit {
            entries.removeLast(entries.count - Self.limit)
        }
    }
}
