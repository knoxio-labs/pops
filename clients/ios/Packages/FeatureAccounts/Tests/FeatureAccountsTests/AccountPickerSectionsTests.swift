import AppCore
import Testing

@testable import FeatureAccounts

/// The picker's own split: active first, archived beneath — mirroring
/// `account-picker.tsx`'s `PickerList`, and its `matches` function's three
/// fields.
@Suite("Account picker sections")
internal struct AccountPickerSectionsTests {
    private let checking = Account.fake(id: "a1", name: "Everyday", institutionName: "ANZ")
    private let creditCard = Account.fake(
        id: "a2", name: "Amex", kind: .creditCard, institutionName: "Amex")
    private let archived = Account.fake(
        id: "a3", name: "Old ING", archived: true, institutionName: "ING")

    @Test("active accounts and archived accounts split into their own lists")
    func splitsActiveFromArchived() {
        let sections = AccountPickerSections.build(from: [checking, creditCard, archived])

        #expect(sections.active.map(\.id) == ["a1", "a2"])
        #expect(sections.archived.map(\.id) == ["a3"])
    }

    @Test("a query matches the account's name")
    func matchesName() {
        let sections = AccountPickerSections.build(from: [checking, creditCard], query: "amex")

        #expect(sections.active.map(\.id) == ["a2"])
    }

    @Test("a query matches the institution, which is the row's subtitle")
    func matchesSubtitle() {
        let sections = AccountPickerSections.build(from: [checking, creditCard], query: "anz")

        #expect(sections.active.map(\.id) == ["a1"])
    }

    @Test("a query matches the kind label")
    func matchesKindLabel() {
        let sections = AccountPickerSections.build(
            from: [checking, creditCard], query: "credit card")

        #expect(sections.active.map(\.id) == ["a2"])
    }

    @Test("matching is case-insensitive")
    func caseInsensitive() {
        let sections = AccountPickerSections.build(from: [checking], query: "EVERYDAY")

        #expect(sections.active.map(\.id) == ["a1"])
    }

    @Test("an archived account can still be found by search")
    func archivedAccountsAreSearchable() {
        let sections = AccountPickerSections.build(from: [checking, archived], query: "old ing")

        #expect(sections.archived.map(\.id) == ["a3"])
        #expect(sections.active.isEmpty)
    }

    @Test("no accounts at all is both lists empty")
    func emptyInput() {
        let sections = AccountPickerSections.build(from: [])

        #expect(sections.active.isEmpty)
        #expect(sections.archived.isEmpty)
    }
}
