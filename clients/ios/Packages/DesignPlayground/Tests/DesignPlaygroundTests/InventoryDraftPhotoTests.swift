import Testing

@testable import DesignPlayground

/// Reordering, deleting and reporting on photographs that are staged rather
/// than uploaded.
///
/// The reorder is driven by a drag, so it is asked for out of range routinely,
/// and a version of it that trapped would crash on an ordinary gesture.
@Suite("Inventory draft photos")
internal struct InventoryDraftPhotoTests {
    private let photos = [
        InventoryDraftPhoto(id: "a"), InventoryDraftPhoto(id: "b"), InventoryDraftPhoto(id: "c"),
    ]

    @Test("moving one later puts it after the one it passed")
    func movingForward() {
        #expect(photos.moved(from: 0, to: 2).map(\.id) == ["b", "a", "c"])
        #expect(photos.moved(from: 0, to: 3).map(\.id) == ["b", "c", "a"])
    }

    @Test("moving one earlier puts it at the index asked for")
    func movingBackward() {
        #expect(photos.moved(from: 2, to: 0).map(\.id) == ["c", "a", "b"])
    }

    @Test("a drag that ends nowhere leaves the order alone")
    func movingOutOfRange() {
        #expect(photos.moved(from: 1, to: 1).map(\.id) == ["a", "b", "c"])
        #expect(photos.moved(from: 7, to: 0).map(\.id) == ["a", "b", "c"])
        #expect(photos.moved(from: 0, to: -1).map(\.id) == ["a", "b", "c"])
        #expect(photos.moved(from: 0, to: 9).map(\.id) == ["a", "b", "c"])
    }

    @Test("deleting takes one and only one")
    func removing() {
        #expect(photos.removing(id: "b").map(\.id) == ["a", "c"])
        #expect(photos.removing(id: "z").count == photos.count)
    }

    @Test("no photographs is not a state worth a sentence")
    func emptyIsSilent() {
        #expect([InventoryDraftPhoto]().progress == .none)
        #expect([InventoryDraftPhoto]().progress.message == nil)
    }

    @Test("staged photographs say they are held here, not that they failed")
    func stagedProgress() {
        #expect(photos.progress == .staged(3))
        #expect(!photos.progress.isFailed)
    }

    @Test("all sent says nothing further")
    func completeProgress() {
        let sent = photos.map { InventoryDraftPhoto(id: $0.id, upload: .uploaded) }

        #expect(sent.progress == .complete(3))
        #expect(sent.progress.message == nil)
    }

    @Test("part sent counts what is through, and does not read as a failure")
    func partialProgress() {
        let mixed = [
            InventoryDraftPhoto(id: "a", upload: .uploaded),
            InventoryDraftPhoto(id: "b", upload: .uploading),
            InventoryDraftPhoto(id: "c", upload: .staged),
        ]

        #expect(mixed.progress == .partial(done: 1, total: 3))
        #expect(!mixed.progress.isFailed)
    }

    @Test("one refusal is reported as a failure, with the ones that did arrive")
    func failedProgress() {
        let mixed = [
            InventoryDraftPhoto(id: "a", upload: .uploaded),
            InventoryDraftPhoto(id: "b", upload: .uploading),
            InventoryDraftPhoto(id: "c", upload: .failed("Too large.")),
        ]

        #expect(mixed.progress == .failed(done: 1, total: 3, reason: "Too large."))
        #expect(mixed.progress.isFailed)
    }
}

/// An identifier is a pair, and half of one is not worth recording.
@Suite("Inventory external identifiers")
internal struct InventoryExternalIdentifierTests {
    @Test("a value is what makes a row complete; a label alone is not")
    func completeness() {
        let empty = InventoryExternalIdentifier(id: "i", label: "Serial", value: "  ")
        let filled = InventoryExternalIdentifier(id: "i", label: "Serial", value: "C02X")

        #expect(!empty.isComplete)
        #expect(filled.isComplete)
    }

    @Test("the labels offered are a closed list, so one fact gets one word")
    func labelsAreClosed() {
        #expect(InventoryExternalIdentifier.labels.contains("Serial"))
        #expect(
            Set(InventoryExternalIdentifier.labels).count
                == InventoryExternalIdentifier.labels.count)
    }
}
