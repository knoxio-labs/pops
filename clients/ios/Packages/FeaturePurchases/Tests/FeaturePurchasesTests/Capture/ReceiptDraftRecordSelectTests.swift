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
