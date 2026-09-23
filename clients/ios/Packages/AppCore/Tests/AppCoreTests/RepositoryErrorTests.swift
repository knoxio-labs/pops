import AppCore
import Testing

@Suite("Repository errors")
internal struct RepositoryErrorTests {
    @Test("conflicts preserve their reason and remain distinct from transport failures")
    func conflictIdentity() {
        #expect(RepositoryError.conflict("purchase_locked") != .conflict("purchase_stale"))
        #expect(RepositoryError.conflict("purchase_locked") != .transport("purchase_locked"))
    }
}
