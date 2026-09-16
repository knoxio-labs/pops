import AppCore
import Testing

@testable import DesignPlayground

/// The staging grid groups by dragging, so every rearrangement is one of these
/// four and none of them is reachable from a unit test through the gesture.
/// Tested here instead, where the cases that a finger reaches by accident —
/// dropping a page on itself, emptying a receipt, putting a loose page back
/// where it already was — can be stated.
@Suite("Staged receipts")
internal struct StagedReceiptsTests {
    private func page(_ id: String) -> StagedPage {
        StagedPage(id: id, label: "\(id).HEIC", media: .jpeg, bytes: nil)
    }

    private func staged(_ groups: [String: [String]]) -> StagedReceipts {
        StagedReceipts(
            groups.keys.sorted().map { id in
                StagedReceipt(id: id, pages: (groups[id] ?? []).map(page))
            })
    }

    private func shape(_ receipts: StagedReceipts) -> [[String]] {
        receipts.receipts.map { $0.pages.map(\.id) }
    }

    @Test("dropping one page on another makes them one receipt")
    func combineMakesAReceipt() {
        var receipts = staged(["r1": ["a"], "r2": ["b"]])

        receipts.combine(["a"], with: "b")

        #expect(shape(receipts) == [["b", "a"]])
        #expect(receipts.loose.isEmpty)
        #expect(receipts.groups.count == 1)
    }

    /// A finger lands on the thing it started from more often than anywhere
    /// else. It must not produce a receipt, and must not lose the page.
    @Test("dropping a page on itself changes nothing")
    func combineWithSelfIsInert() {
        var receipts = staged(["r1": ["a"], "r2": ["b"]])

        receipts.combine(["a"], with: "a")

        #expect(shape(receipts) == [["a"], ["b"]])
    }

    @Test("a page dropped on a receipt joins it, in last position")
    func moveAppends() {
        var receipts = staged(["r1": ["a", "b"], "r2": ["c"]])

        receipts.move(["c"], into: "r1")

        #expect(shape(receipts) == [["a", "b", "c"]])
    }

    /// The case the view cannot assume away: taking every page out of a
    /// receipt deletes it, so the receipt being dropped onto may not exist by
    /// the time the pages land.
    @Test("a receipt emptied by its own drop is rebuilt, not lost")
    func moveOntoAnEmptiedReceipt() {
        var receipts = staged(["r1": ["a", "b"]])

        receipts.move(["a", "b"], into: "r1")

        #expect(shape(receipts) == [["a", "b"]])
        #expect(receipts.count == 1)
    }

    @Test("dragging a page to the loose area takes it out of its receipt")
    func separateUngroups() {
        var receipts = staged(["r1": ["a", "b", "c"]])

        receipts.separate(["b"])

        #expect(shape(receipts) == [["a", "c"], ["b"]])
        #expect(receipts.groups.count == 1)
        #expect(receipts.loose.map(\.id) == ["b"])
    }

    /// Ungrouping the second-to-last page leaves a one-page receipt, which is
    /// a loose page — not a group of one.
    @Test("a two-page receipt ungroups into two loose pages")
    func separateDissolvesAPair() {
        var receipts = staged(["r1": ["a", "b"]])

        receipts.separate(["a"])

        #expect(receipts.groups.isEmpty)
        #expect(Set(receipts.loose.map(\.id)) == ["a", "b"])
    }

    @Test("a loose page dropped back on the loose area stays where it was")
    func separateALoosePage() {
        var receipts = staged(["r1": ["a"], "r2": ["b"]])

        receipts.separate(["a"])

        #expect(Set(receipts.loose.map(\.id)) == ["a", "b"])
        #expect(receipts.count == 2)
    }

    @Test("deleting the last page of a receipt removes the receipt")
    func deleteEmptiesTheReceipt() {
        var receipts = staged(["r1": ["a"], "r2": ["b", "c"]])

        receipts.delete("a")

        #expect(shape(receipts) == [["b", "c"]])
        #expect(receipts.count == 1)
    }

    @Test("deleting one page of a group leaves the rest grouped")
    func deleteKeepsTheGroup() {
        var receipts = staged(["r1": ["a", "b", "c"]])

        receipts.delete("b")

        #expect(shape(receipts) == [["a", "c"]])
    }

    @Test("every page is reported once, whatever it is grouped into")
    func everyPageIsComplete() {
        var receipts = staged(["r1": ["a", "b"], "r2": ["c"]])
        receipts.combine(["c"], with: "a")

        #expect(Set(receipts.everyPage.map(\.id)) == ["a", "b", "c"])
        #expect(receipts.everyPage.count == 3)
    }
}
