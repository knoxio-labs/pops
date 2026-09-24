import AppCore
import AppCoreFakes
import Testing

@testable import FeatureInventory

/// The rehearsal defect (POPS-3580): creating an item with a photo did not
/// dismiss the sheet, and showed no error either. `InventoryItemFormView`'s
/// submit button is `Task { if await model.submit() { dismiss() } }` — a
/// plain, unstructured task, not a child of the view — so `submit()` always
/// runs to completion whether or not the sheet is still on screen. What
/// mattered was what `submit()` reported when it failed: `record(_:)` used to
/// treat any `CancellationError` as "nobody is left to tell", regardless of
/// whether *this* task was the one cancelled. A photo's `attachPhoto` command
/// can throw one for reasons that have nothing to do with the view going
/// away, and when that happened, `submit()` returned `false` with `failure`
/// left `nil` — the sheet stayed open, showing nothing.
@MainActor
@Suite("Item form: create-with-a-photo dismissal")
internal struct InventoryFormDismissalTests {
    private func model(
        _ store: some InventoryStore, request: InventoryItemFormRequest = .create(placement: nil),
        suggester: InventoryCodeSuggester = .unbound
    ) -> InventoryItemFormModel {
        InventoryItemFormModel(
            request: request, store: store, suggester: suggester, mintId: { "new-1" })
    }

    private func formWithReadyPhoto(_ store: RecordingFormStore) async -> InventoryItemFormModel {
        let form = model(store)
        let loading = await form.startAndAwaitReady()
        loading.cancel()
        form.draft.name = "Drill"
        form.draft.photos.append(
            InventoryFormPhoto(sha256: "photo-1", upload: .uploaded, handedOver: true))
        return form
    }

    @Test("a photo command cancelled independently of the submitting task still reports a failure")
    func cancelledPhotoCommandStillReportsFailure() async {
        let store = RecordingFormStore(FormFixtureSource(catalogue: FormFixture.catalogue))
        store.fail("attachPhoto", with: CancellationError())
        let form = await formWithReadyPhoto(store)

        let succeeded = await form.submit()

        #expect(succeeded == false, "a cancelled attach must block the sheet from closing")
        #expect(
            form.failure != nil,
            Comment(
                rawValue: "a blocking failure with nothing shown for it is a sheet stuck open "
                    + "for no visible reason — the exact rehearsal defect")
        )
    }

    @Test("a genuinely cancelled submit (the task itself, not just an inner error) reports nothing")
    func trulyCancelledSubmitReportsNothing() async {
        let store = RecordingFormStore(FormFixtureSource(catalogue: FormFixture.catalogue))
        store.fail("attachPhoto", with: CancellationError())
        let form = await formWithReadyPhoto(store)

        let task = Task { await form.submit() }
        task.cancel()
        _ = await task.value

        #expect(
            form.failure == nil,
            Comment(
                rawValue: "a submit whose own task is cancelled has nobody left to tell — the "
                    + "view is already gone")
        )
    }
}
