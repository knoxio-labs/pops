import AppCore
import Foundation
import Testing

@testable import FeatureInventory

/// Photos under a local-first store (B7): the store stages the bytes and
/// reports how far each got, and the form's tiles follow that report.
@MainActor
@Suite("Item form: photos staged by the store")
internal struct InventoryFormStagedPhotoTests {
    private static let bytes = Data("a photo".utf8)
    private static let sha256 = InventoryPhotoHashing.sha256(of: bytes)

    private func capturedForm(_ store: RecordingFormStore) async
        -> (InventoryItemFormModel, Task<Void, Never>)
    {
        let form = InventoryItemFormModel(
            request: .create(placement: nil), store: store, suggester: .unbound,
            mintId: { "new-1" })
        let loading = await form.startAndAwaitReady()
        form.draft.name = "Lamp"
        await form.photoCaptured(Self.bytes)
        return (form, loading)
    }

    @Test("a staged photo shows waiting, then uploaded, as the store reports it")
    func followsTheStore() async throws {
        let store = RecordingFormStore(FormFixtureSource(catalogue: FormFixture.catalogue))
        let (form, loading) = await capturedForm(store)
        defer { loading.cancel() }

        store.setPhotoUploads([Self.sha256: .waiting])
        #expect(await form.await { form.draft.photos.first?.upload == .waiting })

        store.setPhotoUploads([Self.sha256: .uploading])
        #expect(await form.await { form.draft.photos.first?.upload == .uploading })

        store.setPhotoUploads([Self.sha256: .uploaded])
        #expect(await form.await { form.draft.photos.first?.upload == .uploaded })
    }

    @Test("a photo still waiting for the network is attached by the final action")
    func waitingPhotoIsAttached() async throws {
        let store = RecordingFormStore(FormFixtureSource(catalogue: FormFixture.catalogue))
        let (form, loading) = await capturedForm(store)
        defer { loading.cancel() }
        store.setPhotoUploads([Self.sha256: .waiting])
        #expect(await form.await { form.draft.photos.first?.upload == .waiting })

        #expect(await form.submit())

        #expect(store.performed.count == 2)
        #expect(
            store.performed.last == .attachPhoto(itemId: "new-1", sha256: Self.sha256, position: 0))
    }

    @Test("a photo the store reports refused shows why, and is not attached")
    func refusedPhotoIsNotAttached() async throws {
        let store = RecordingFormStore(FormFixtureSource(catalogue: FormFixture.catalogue))
        let (form, loading) = await capturedForm(store)
        defer { loading.cancel() }

        store.setPhotoUploads([Self.sha256: .failed(.tooLarge)])
        #expect(
            await form.await {
                form.draft.photos.first?.upload == .failed("This photo is too large to upload.")
            })

        #expect(await form.submit())
        #expect(store.performed.count == 1)
    }

    @Test("Retry on a refused photo hands the same bytes to the store again")
    func retryHandsOverAgain() async throws {
        let store = RecordingFormStore(FormFixtureSource(catalogue: FormFixture.catalogue))
        let (form, loading) = await capturedForm(store)
        defer { loading.cancel() }
        store.setPhotoUploads([Self.sha256: .failed(.tooLarge)])
        #expect(await form.await { form.draft.photos.first?.hasFailed == true })
        store.setPhotoUploads([Self.sha256: .waiting])

        await form.retryUpload(sha256: Self.sha256)

        #expect(store.uploaded.map(\.data) == [Self.bytes, Self.bytes])
        #expect(await form.await { form.draft.photos.first?.upload == .waiting })
    }

    @Test("a photo the store never took ignores what the store reports for its hash")
    func notHandedOverIgnoresTheStore() async throws {
        let store = RecordingFormStore(FormFixtureSource(catalogue: FormFixture.catalogue))
        store.failUploads(with: RepositoryError.transport("offline"))
        let (form, loading) = await capturedForm(store)
        defer { loading.cancel() }

        store.setPhotoUploads([Self.sha256: .uploaded])
        store.setStatus(.offline(lastRefreshAt: nil))
        #expect(await form.await { form.isOffline })

        #expect(form.draft.photos.first?.hasFailed == true)
        #expect(await form.submit())
        #expect(store.performed.count == 1)
    }

    @Test("no room to stage the photo shows storage full on the tile, and the create still lands")
    func storageFull() async throws {
        let store = RecordingFormStore(FormFixtureSource(catalogue: FormFixture.catalogue))
        store.failUploads(with: InventoryStorageError.full)
        let (form, loading) = await capturedForm(store)
        defer { loading.cancel() }

        #expect(form.draft.photos.first?.upload == .failed(InventoryCopy.photoStorageFull))
        #expect(await form.submit())
        #expect(store.performed.count == 1)
    }
}
