import AppCore
import Testing

@testable import DesignPlayground

/// A design state's name is prose, so nothing stops it promising a condition
/// its fixture cannot produce — and the account surface shipped with exactly
/// that: a state called "Never checked" whose fixture was `.cash`, which is
/// not checkpointable, so it drew "Never counted" instead.
///
/// `provenance` has three branches and the fixtures have to reach all three,
/// or a reviewer is looking at one of them twice under different names.
@Suite("Account provenance fixtures")
internal struct AccountProvenanceTests {
    @Test("a dated balance says when it was read")
    func datedBalanceNamesItsDate() {
        #expect(AccountPresentation.provenance(Fixtures.everyday).hasPrefix("As of "))
    }

    @Test("the never-checked fixture is checkpointable and undated")
    func neverCheckedReachesItsBranch() {
        #expect(Fixtures.unchecked.kind.isCheckpointable)
        #expect(Fixtures.unchecked.balanceAsOf == nil)
        #expect(AccountPresentation.provenance(Fixtures.unchecked) == "Never checked against the bank")
    }

    @Test("the never-counted fixture is not checkpointable")
    func neverCountedReachesItsBranch() {
        #expect(!Fixtures.euros.kind.isCheckpointable)
        #expect(Fixtures.euros.balanceAsOf == nil)
        #expect(AccountPresentation.provenance(Fixtures.euros) == "Never counted")
    }
}
