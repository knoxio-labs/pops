import SwiftUI
import Testing

@testable import FeaturePurchases

@MainActor
@Suite("Receipt draft record select")
internal struct ReceiptDraftRecordSelectTests {
    @Test("typing again during the debounce searches only the settled query")
    func debounce() async {
        let model = ReceiptDraftRecordSearch()
        let calls = SearchCalls()
        let firstWait = SearchGate()
        let secondWait = SearchGate()
        let first = Task {
            await model.update(
                query: "w",
                search: { query in await calls.search(query) },
                wait: firstWait.wait)
        }
        await firstWait.waitUntilEntered()

        first.cancel()
        let second = Task {
            await model.update(
                query: "wo",
                search: { query in await calls.search(query) },
                wait: secondWait.wait)
        }
        await secondWait.waitUntilEntered()
        await firstWait.open()
        await secondWait.open()
        await first.value
        await second.value

        #expect(await calls.queries == ["wo"])
    }

    @Test("an empty query shows the selected preview without searching")
    func selectedPreview() async {
        let model = ReceiptDraftRecordSearch()
        let calls = SearchCalls()
        let preview = ReceiptDraftRecord(id: "merchant-1", name: "Corner Shop")

        await model.update(
            query: "   ",
            search: { query in await calls.search(query) },
            wait: {})
        let selected = ReceiptDraftRecordSheet.resultState(
            query: model.trimmedQuery,
            isSearching: model.isSearching,
            results: model.results,
            selectedPreview: preview)
        let unselected = ReceiptDraftRecordSheet.resultState(
            query: model.trimmedQuery,
            isSearching: model.isSearching,
            results: model.results,
            selectedPreview: nil)

        #expect(selected == .records([preview]))
        #expect(unselected == .prompt)
        #expect(await calls.queries.isEmpty)
    }

    @Test("a cancelled slow search cannot replace a newer answer")
    func staleSearch() async {
        let model = ReceiptDraftRecordSearch()
        let oldSearch = SearchGate()
        let old = Task {
            await model.update(
                query: "old",
                search: { _ in
                    await oldSearch.wait()
                    return [ReceiptDraftRecord(id: "old", name: "Old")]
                },
                wait: {})
        }
        await oldSearch.waitUntilEntered()

        old.cancel()
        await model.update(
            query: "new",
            search: { _ in [ReceiptDraftRecord(id: "new", name: "New")] },
            wait: {})
        await oldSearch.open()
        await old.value

        #expect(model.results == [ReceiptDraftRecord(id: "new", name: "New")])
        #expect(!model.isSearching)
    }

    @Test("a freshly pinned record's own name shows against its id")
    func pinnedNameAnswersForItsOwnID() {
        let bunnings = ReceiptDraftRecord(id: "ent-bunnings", name: "Bunnings")

        let name = ReceiptDraftRecordSelect.chosenName(
            resolution: .chosen(id: "ent-bunnings"),
            pinned: bunnings,
            resolvedName: "Woolworths")

        #expect(name == "Bunnings")
    }

    @Test("a pinned record never answers for a different id")
    func pinnedNameNeverAnswersForAnotherID() {
        let woolworths = ReceiptDraftRecord(id: "ent-woolworths", name: "Woolworths")

        let name = ReceiptDraftRecordSelect.chosenName(
            resolution: .chosen(id: "ent-bunnings"),
            pinned: woolworths,
            resolvedName: "Bunnings")

        #expect(name == "Bunnings")
    }

    @Test("with nothing pinned the caller's resolved name is used")
    func noPinFallsBackToResolvedName() {
        let name = ReceiptDraftRecordSelect.chosenName(
            resolution: .matched(id: "ent-kmart"),
            pinned: nil,
            resolvedName: "Kmart")

        #expect(name == "Kmart")
    }

    @Test("a created value wins over any pin or resolved name")
    func createdValueWins() {
        let pinned = ReceiptDraftRecord(id: "ent-x", name: "Somewhere Else")

        let name = ReceiptDraftRecordSelect.chosenName(
            resolution: .created(value: "New Shop"),
            pinned: pinned,
            resolvedName: "Ignored")

        #expect(name == "New Shop")
    }

    @Test("an unresolved field has no name, pin or not")
    func unresolvedHasNoName() {
        let name = ReceiptDraftRecordSelect.chosenName(
            resolution: .unresolved,
            pinned: ReceiptDraftRecord(id: "ent-x", name: "Somewhere"),
            resolvedName: "Somewhere Else")

        #expect(name == nil)
    }

    @Test("address lookup reads the current merchant whenever it runs")
    func addressLookupUsesCurrentMerchant() async {
        let box = DraftBox(ReceiptDraft.blank().attributed(id: "merchant-old"))
        let calls = AddressCalls()
        let binding = Binding(
            get: { box.draft },
            set: { box.draft = $0 })

        _ = await ReceiptDraftForm.addressRecords(
            draft: binding,
            addressesForMerchant: { id in await calls.addresses(id) })
        box.draft.setMerchant(.chosen(id: "merchant-new"))
        let records = await ReceiptDraftForm.addressRecords(
            draft: binding,
            addressesForMerchant: { id in await calls.addresses(id) })

        #expect(await calls.merchantIDs == ["merchant-old", "merchant-new"])
        #expect(records == [ReceiptDraftRecord(id: "address-merchant-new", name: "New Street")])
    }

    @Test("address lookup narrows to addresses matching the typed query")
    func addressLookupNarrowsByQuery() async {
        let box = DraftBox(ReceiptDraft.blank().attributed(id: "merchant-1"))
        let binding = Binding(
            get: { box.draft },
            set: { box.draft = $0 })

        let records = await ReceiptDraftForm.addressRecords(
            draft: binding,
            addressesForMerchant: { _ in
                [
                    ReceiptAddressChoice(id: "a1", value: "12 Bunnings Way"),
                    ReceiptAddressChoice(id: "a2", value: "5 Kmart Lane"),
                ]
            },
            query: "bunnings")

        #expect(records == [ReceiptDraftRecord(id: "a1", name: "12 Bunnings Way")])
    }

    @Test("narrowing by query is case- and diacritic-insensitive and trims whitespace")
    func narrowedIsCaseAndDiacriticInsensitive() {
        let records = [
            ReceiptDraftRecord(id: "a1", name: "Café Street"),
            ReceiptDraftRecord(id: "a2", name: "Other Road"),
        ]

        let matches = ReceiptDraftForm.narrowed(records, byQuery: "  CAFE  ")

        #expect(matches == [ReceiptDraftRecord(id: "a1", name: "Café Street")])
    }

    @Test("an empty query narrows to nothing typed, so it answers with every address")
    func narrowedWithEmptyQueryReturnsAll() {
        let records = [
            ReceiptDraftRecord(id: "a1", name: "Bunnings"),
            ReceiptDraftRecord(id: "a2", name: "Kmart"),
        ]

        let matches = ReceiptDraftForm.narrowed(records, byQuery: "   ")

        #expect(matches == records)
    }
}

@MainActor
private final class DraftBox {
    var draft: ReceiptDraft

    init(_ draft: ReceiptDraft) {
        self.draft = draft
    }
}

private actor AddressCalls {
    private(set) var merchantIDs: [String] = []

    func addresses(_ merchantID: String) -> [ReceiptAddressChoice] {
        merchantIDs.append(merchantID)
        return [ReceiptAddressChoice(id: "address-\(merchantID)", value: "New Street")]
    }
}

private actor SearchCalls {
    private(set) var queries: [String] = []

    func search(_ query: String) -> [ReceiptDraftRecord] {
        queries.append(query)
        return [ReceiptDraftRecord(id: query, name: query)]
    }
}

private actor SearchGate {
    private var entered = false
    private var entryWaiters: [CheckedContinuation<Void, Never>] = []
    private var release: CheckedContinuation<Void, Never>?

    func wait() async {
        entered = true
        let waiters = entryWaiters
        entryWaiters = []
        for waiter in waiters { waiter.resume() }
        await withCheckedContinuation { release = $0 }
    }

    func waitUntilEntered() async {
        guard !entered else { return }
        await withCheckedContinuation { entryWaiters.append($0) }
    }

    func open() {
        release?.resume()
        release = nil
    }
}
