/// The purchase records the phone can read.
public protocol PurchasesRepository: Sendable {
    /// Reads one page after an opaque cursor, or the first page when it is nil.
    func purchases(after cursor: String?) async throws -> PurchasePage
}
