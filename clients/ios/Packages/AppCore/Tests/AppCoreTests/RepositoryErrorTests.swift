import AppCore
import Testing

@Suite("Repository errors")
internal struct RepositoryErrorTests {
    @Test(
        "conflicts preserve their reason and remain distinct from every transport diagnostic",
        arguments: ["purchase_locked", "purchase_stale", "", "offline"])
    func conflictIdentity(transportDiagnostic: String) {
        #expect(RepositoryError.conflict("purchase_locked") != .conflict("purchase_stale"))
        #expect(RepositoryError.conflict("purchase_locked") != .transport(transportDiagnostic))
    }
}
