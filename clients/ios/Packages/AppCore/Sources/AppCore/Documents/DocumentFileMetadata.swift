/// Recorded file-response headers; missing size, MIME type or name remain unknown.
public struct DocumentFileMetadata: Hashable, Sendable {
    public let byteCount: Int?
    public let contentType: String?
    public let fileName: String?

    /// Creates the value from actual response headers without guessing from a title or extension.
    public init(byteCount: Int?, contentType: String?, fileName: String?) {
        self.byteCount = byteCount
        self.contentType = contentType
        self.fileName = fileName
    }
}
