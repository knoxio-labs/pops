import AppCore
import AppCoreFakes
import Testing

@testable import FeatureAccounts

/// The list's sectioning: Held and Owed by the sign of the balance, Archived
/// only when asked for — the exact test `accounts.tsx`'s `SECTIONS` runs, plus
/// the search filter POPS-2811 asks to be covered.
@Suite("Accounts sections")
internal struct AccountsSectionsTests {
    private let held = Account.fake(
        id: "held", name: "Everyday", balance: .init(minorUnits: 100, currencyCode: "AUD"))
    private let owed = Account.fake(
        id: "owed", name: "Amex", balance: .init(minorUnits: -100, currencyCode: "AUD"))
    private let zero = Account.fake(
        id: "zero", name: "Empty", balance: .init(minorUnits: 0, currencyCode: "AUD"))
    private let archived = Account.fake(
        id: "arch", name: "Old ING", balance: .init(minorUnits: 50, currencyCode: "AUD"),
        archived: true)

    @Test("a positive or zero balance sorts into Held")
    func heldSection() {
        let sections = AccountsSections.build(from: [held, zero])

        #expect(sections.held.map(\.id) == ["held", "zero"])
        #expect(sections.owed.isEmpty)
    }

    @Test("a negative balance sorts into Owed")
    func owedSection() {
        let sections = AccountsSections.build(from: [owed])

        #expect(sections.owed.map(\.id) == ["owed"])
        #expect(sections.held.isEmpty)
    }

    @Test("archived accounts are excluded from Held and Owed regardless of balance")
    func archivedExcludedFromActiveSections() {
        let sections = AccountsSections.build(from: [held, owed, archived], showArchived: true)

        #expect(!sections.held.contains { $0.id == "arch" })
        #expect(!sections.owed.contains { $0.id == "arch" })
        #expect(sections.archived.map(\.id) == ["arch"])
    }

    @Test("archived accounts are hidden entirely unless asked for")
    func archivedHiddenByDefault() {
        let sections = AccountsSections.build(from: [held, archived])

        #expect(sections.archived.isEmpty)
    }

    @Test("a query matches the name, case-insensitively")
    func queryMatchesName() {
        let sections = AccountsSections.build(from: [held, owed], query: "amex")

        #expect(sections.owed.map(\.id) == ["owed"])
        #expect(sections.held.isEmpty)
    }

    @Test("a query matches the kind label")
    func queryMatchesKindLabel() {
        let card = Account.fake(
            id: "card", name: "Zzz", kind: .creditCard,
            balance: .init(minorUnits: -1, currencyCode: "AUD"))

        let sections = AccountsSections.build(from: [held, card], query: "credit")

        #expect(sections.owed.map(\.id) == ["card"])
    }

    @Test("a query matching nothing empties every section")
    func queryMatchingNothing() {
        let sections = AccountsSections.build(from: [held, owed], query: "nonexistent")

        #expect(sections.isEmpty)
    }

    @Test("whitespace-only query behaves as no query at all")
    func whitespaceQueryIsNoQuery() {
        let sections = AccountsSections.build(from: [held], query: "   ")

        #expect(sections.held.map(\.id) == ["held"])
    }
}
