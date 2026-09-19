import AppCore
import Foundation
import Testing

@testable import FeatureInventory

/// Photo capture and online upload (A22): the media `PUT` a captured photo
/// takes before its `item.attachPhoto`, and what a failed upload does and
/// does not block.
@MainActor
@Suite("Item form: photo capture and upload")
internal struct InventoryFormPhotoTests {
    private func model(
        _ store: RecordingFormStore, request: InventoryItemFormRequest = .create(placement: nil)
    ) -> InventoryItemFormModel {
        InventoryItemFormModel(
            request: request, store: store, suggester: .unbound, mintId: { "new-1" })
    }

    @Test("the hash is stable for the same bytes, so a retry addresses the same photo")
    func hashIsStable() {
        let bytes = Data("a real photo".utf8)
        #expect(InventoryPhotoHashing.sha256(of: bytes) == InventoryPhotoHashing.sha256(of: bytes))
        #expect(InventoryPhotoHashing.sha256(of: bytes).count == 64)
        #expect(
            InventoryPhotoHashing.sha256(of: Data("different".utf8))
                != InventoryPhotoHashing.sha256(of: bytes))
    }

    @Test("a captured photo uploads before it is ever attached")
    func uploadsBeforeAttach() async throws {
        let store = RecordingFormStore(FormFixtureSource(catalogue: FormFixture.catalogue))
        let form = model(store)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }
        form.draft.name = "Lamp"

        let bytes = Data("a photo".utf8)
        await form.photoCaptured(bytes)
        let sha256 = InventoryPhotoHashing.sha256(of: bytes)

        #expect(store.uploaded.map(\.sha256) == [sha256])
        #expect(form.draft.photos.first?.upload == .uploaded)

        #expect(await form.submit())
        guard store.performed.count == 2,
            case .attachPhoto(let itemId, let attachedSha, let position) = store.performed[1]
        else {
            Issue.record("expected create then attach, got \(store.performed)")
            return
        }
        #expect(itemId == "new-1")
        #expect(attachedSha == sha256)
        #expect(position == 0)
        #expect(
            store.uploaded.map(\.sha256) == [sha256], "upload happened once, ahead of the attach")
    }

    @Test("a failed upload marks the photo failed but never blocks the create")
    func failedUploadStillCreates() async throws {
        let store = RecordingFormStore(FormFixtureSource(catalogue: FormFixture.catalogue))
        store.failUploads(
            with: RepositoryError.transport("mobileInventory.putMedia: payload too large"))
        let form = model(store)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }
        form.draft.name = "Lamp"

        await form.photoCaptured(Data("too big to fit".utf8))

        guard case .failed(let message) = form.draft.photos.first?.upload else {
            Issue.record(
                "expected a failed photo, got \(String(describing: form.draft.photos.first?.upload))"
            )
            return
        }
        #expect(!message.isEmpty)

        #expect(await form.submit())
        #expect(store.performed.count == 1)
        guard case .createItem = store.performed.first else {
            Issue.record("expected the create to still land, got \(store.performed)")
            return
        }
    }

    @Test("retrying a failed photo re-sends the same bytes and can succeed")
    func retrySucceeds() async throws {
        let store = RecordingFormStore(FormFixtureSource(catalogue: FormFixture.catalogue))
        store.failUploads(with: RepositoryError.transport("offline"))
        let form = model(store)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }
        form.draft.name = "Lamp"
        let bytes = Data("a photo".utf8)
        await form.photoCaptured(bytes)
        #expect(form.draft.photos.first?.upload.isFailed == true)

        store.failUploads(with: nil)
        let sha256 = InventoryPhotoHashing.sha256(of: bytes)
        await form.retryUpload(sha256: sha256)

        #expect(form.draft.photos.first?.upload == .uploaded)
        #expect(store.uploaded.map(\.sha256) == [sha256, sha256])
    }

    @Test("removing a failed photo drops it from the draft without touching the store")
    func removeFailedPhoto() async throws {
        let store = RecordingFormStore(FormFixtureSource(catalogue: FormFixture.catalogue))
        store.failUploads(with: RepositoryError.transport("offline"))
        let form = model(store)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }
        let bytes = Data("a photo".utf8)
        await form.photoCaptured(bytes)
        let sha256 = InventoryPhotoHashing.sha256(of: bytes)

        form.removeFailedPhoto(sha256: sha256)

        #expect(form.draft.photos.isEmpty)
    }

    @Test("re-capturing the same bytes twice keeps one photo, not two")
    func duplicateCaptureIsIgnored() async throws {
        let store = RecordingFormStore(FormFixtureSource(catalogue: FormFixture.catalogue))
        let form = model(store)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }
        let bytes = Data("a photo".utf8)

        await form.photoCaptured(bytes)
        await form.photoCaptured(bytes)

        #expect(form.draft.photos.count == 1)
    }
}

extension InventoryFormPhoto.Upload {
    fileprivate var isFailed: Bool {
        if case .failed = self { return true }
        return false
    }
}
