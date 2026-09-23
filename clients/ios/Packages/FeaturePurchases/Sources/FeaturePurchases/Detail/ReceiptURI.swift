internal enum ReceiptURI {
    private static let prefix = "pops://purchases/receipt/"

    internal static func sha256(from value: String) -> String? {
        guard value.hasPrefix(prefix) else { return nil }
        let sha256 = value.dropFirst(prefix.count)
        guard !sha256.isEmpty, !sha256.contains("/") else { return nil }
        return String(sha256)
    }
}
