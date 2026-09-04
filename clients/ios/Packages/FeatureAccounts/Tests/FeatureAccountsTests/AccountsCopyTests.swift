import AppCore
import Testing

@testable import FeatureAccounts

@Suite("Accounts copy")
internal struct AccountsCopyTests {
    @Test("the count line has no archived clause when nothing is archived")
    func countLineNoArchived() {
        #expect(AccountsCopy.countLine(active: 3, archived: 0) == "3 accounts")
    }

    @Test("the count line pluralises a single account")
    func countLineSingular() {
        #expect(AccountsCopy.countLine(active: 1, archived: 0) == "1 account")
    }

    @Test("the count line names both counts when something is archived")
    func countLineWithArchived() {
        #expect(AccountsCopy.countLine(active: 4, archived: 2) == "4 accounts · 2 archived")
    }

    @Test("every repository error has its own sentence")
    func everyErrorHasAMessage() {
        let errors: [RepositoryError] = [
            .unavailable, .unauthorized, .contractMismatch, .transport("x"), .dependencyNotBound,
        ]

        for error in errors {
            #expect(!AccountsCopy.message(for: error).isEmpty)
        }
    }

    @Test("unavailable and contract mismatch are worded differently")
    func distinctFailureWording() {
        #expect(
            AccountsCopy.message(for: .unavailable) != AccountsCopy.message(for: .contractMismatch))
    }
}
