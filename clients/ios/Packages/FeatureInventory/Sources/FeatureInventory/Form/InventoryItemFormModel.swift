import AppCore
import Foundation
import Observation

/// Which screen of the New item / Edit item pair is drawn. One screen: the
/// rows are identical, and what changes is the title and the final action.
internal enum InventoryItemFormMode: Equatable, Sendable {
    case create
    case edit

    internal var title: String {
        switch self {
        case .create: "New item"
        case .edit: "Edit item"
        }
    }

    internal var actionTitle: String {
        switch self {
        case .create: "Create"
        case .edit: "Save"
        }
    }
}

/// The form's state and the writes it issues, over `InventoryStore`.
///
/// Nothing is written until the final action. Create performs `item.create`
/// and then, when there is a code, `item.setCode`; the store orders the
/// second after the first. If the create lands and the code does not, a
/// second press sends only the code, because the item already exists.
@MainActor @Observable
internal final class InventoryItemFormModel {
    internal enum Phase: Equatable {
        case loading
        case ready
        /// The store ended without answering, or the item being edited is
        /// gone.
        case unavailable
    }

    internal let request: InventoryItemFormRequest
    internal private(set) var phase: Phase = .loading
    internal var draft: InventoryItemDraft
    internal private(set) var catalogue = InventoryCatalogue(version: "", units: [], types: [])
    internal private(set) var isOffline = false
    /// False until the final action is pressed once: a form that reddens a
    /// field before anybody has typed opens accusing.
    internal private(set) var showsValidation = false
    internal private(set) var isSubmitting = false
    internal var failure: InventoryWriteFailure?

    private let store: any InventoryStore
    private let suggester: InventoryCodeSuggester
    private var original: InventoryItem?
    private var created = false
    /// Bytes for a photo captured this session, by hash: the source for its
    /// thumbnail before the server has ever seen it, and for a retry after a
    /// failed upload.
    private var localPhotoData: [String: Data] = [:]

    internal init(
        request: InventoryItemFormRequest, store: any InventoryStore,
        suggester: InventoryCodeSuggester, mintId: () -> String = { UUID().uuidString.lowercased() }
    ) {
        self.request = request
        self.store = store
        self.suggester = suggester
        switch request {
        case .create(let placement):
            draft = InventoryItemDraft(id: mintId(), placement: placement ?? .hand)
        case .edit(let id):
            draft = InventoryItemDraft(id: id)
        }
    }

    internal var mode: InventoryItemFormMode {
        if case .edit = request { return .edit }
        return .create
    }

    internal var issues: [InventoryDraftIssue] {
        InventoryItemFormSubmission.issues(for: draft, catalogue: catalogue)
    }

    internal var canSubmit: Bool {
        phase == .ready && !isSubmitting && draft.isNamed && draft.code.heldBy == nil
    }

    /// Whether Cancel has something to lose and so asks first.
    internal var hasStagedWork: Bool {
        mode == .create ? draft.hasStagedWork : !commands.isEmpty
    }

    /// "No type yet" is offered to a new item and to one stored untyped;
    /// nothing takes a type away once an item has one.
    internal var offersNoType: Bool {
        mode == .create || original?.typeKey == nil
    }

    internal var fields: [InventoryFieldDefinition] {
        InventoryItemFormSubmission.declaredFields(of: draft, in: catalogue)
    }

    /// Follows the store for as long as the form is open.
    internal func load() async {
        if phase == .unavailable { phase = .loading }
        for await context in store.observe(InventoryItemFormContext.query(for: request)) {
            apply(context)
        }
        if phase == .loading && !Task.isCancelled { phase = .unavailable }
    }

    internal func codeChanged(to value: String) {
        let previous = draft.code.value
        draft.code.assist = draft.code.assist.typed(value, previous: previous)
        draft.code.value = value
    }

    /// Looks the current code up in the replica. Works offline, which is the
    /// only check an offline create gets.
    internal func checkCode() async {
        guard let code = draft.code.normalized else {
            draft.code.heldBy = nil
            return
        }
        var holder: InventoryItem?
        for await found in store.observe(
            InventoryItemFormContext.holder(of: code, excluding: draft.id))
        {
            holder = found
            break
        }
        guard draft.code.normalized == code, !Task.isCancelled else { return }
        draft.code.heldBy = holder?.name
    }

    internal func suggestCode() async {
        guard draft.code.assist.canSuggest, !isOffline else { return }
        draft.code.assist = .suggesting
        do {
            let suggestions = try await suggester.suggest(
                draft.trimmedName, draft.typeKey, draft.code.normalized)
            guard let first = suggestions.first else {
                draft.code.assist = .unavailable
                return
            }
            draft.code.value = first
            draft.code.assist = .offered(alternatives: Array(suggestions.dropFirst()))
            await checkCode()
        } catch RepositoryError.unavailable, RepositoryError.transport {
            draft.code.assist = .offline
        } catch {
            draft.code.assist = .unavailable
        }
    }

    /// Writes the draft. Returns true when every command landed and the form
    /// can close; there is no interstitial after a create.
    internal func submit() async -> Bool {
        showsValidation = true
        await checkCode()
        guard issues.isEmpty, phase == .ready, !isSubmitting else { return false }
        isSubmitting = true
        defer { isSubmitting = false }
        for command in commands {
            do {
                _ = try await store.perform(command)
                if case .createItem = command { created = true }
            } catch {
                record(error)
                return false
            }
        }
        return true
    }

    internal func thumbnail(_ sha256: String) async -> Data? {
        if let local = localPhotoData[sha256] { return local }
        return try? await store.photo(sha256, variant: .thumb)
    }

    /// Encodes, hashes and uploads a freshly captured photo (A22): the tile
    /// stages it as `.uploading` immediately, so the strip shows something
    /// the instant a picture is taken, then flips to `.uploaded` or
    /// `.failed` once the media `PUT` answers. A failure never touches
    /// `draft.photos` beyond that one entry — the create or edit this form
    /// performs is never blocked by a photo that could not be sent.
    internal func photoCaptured(_ jpegData: Data) async {
        let sha256 = InventoryPhotoHashing.sha256(of: jpegData)
        localPhotoData[sha256] = jpegData
        guard !draft.photos.contains(where: { $0.sha256 == sha256 }) else { return }
        draft.photos.append(InventoryFormPhoto(sha256: sha256, upload: .uploading))
        await upload(sha256: sha256, data: jpegData)
    }

    /// Retries a photo whose upload failed, reusing the bytes captured
    /// earlier this session (never re-encoded, since JPEG encoding is
    /// deterministic on the same source and the failure was never about the
    /// bytes changing).
    internal func retryUpload(sha256: String) async {
        guard let data = localPhotoData[sha256] else { return }
        setUpload(.uploading, for: sha256)
        await upload(sha256: sha256, data: data)
    }

    /// Drops a photo that never reached the server. Only a `.failed` photo
    /// is ever removed this way: one already `.attached` or `.uploaded`
    /// needs `item.removePhoto` instead, outside this slice's scope.
    internal func removeFailedPhoto(sha256: String) {
        draft.photos = draft.photos.removing(sha256: sha256)
        localPhotoData.removeValue(forKey: sha256)
    }

    private func upload(sha256: String, data: Data) async {
        do {
            _ = try await store.uploadPhoto(sha256: sha256, data: data, contentType: .jpeg)
            setUpload(.uploaded, for: sha256)
        } catch let error as RepositoryError {
            setUpload(.failed(InventoryCopy.message(for: error)), for: sha256)
        } catch {
            setUpload(.failed("Couldn't upload this photo."), for: sha256)
        }
    }

    private func setUpload(_ upload: InventoryFormPhoto.Upload, for sha256: String) {
        guard let index = draft.photos.firstIndex(where: { $0.sha256 == sha256 }) else { return }
        draft.photos[index].upload = upload
    }

    private var commands: [InventoryCommand] {
        switch mode {
        case .create:
            let all = InventoryItemFormSubmission.create(draft, catalogue: catalogue)
            return created ? Array(all.dropFirst()) : all
        case .edit:
            guard let original else { return [] }
            return InventoryItemFormSubmission.edit(draft, original: original, catalogue: catalogue)
        }
    }

    private func apply(_ context: InventoryItemFormContext) {
        catalogue = context.catalogue
        original = context.item
        if phase == .loading {
            seed(context)
        }
        setOffline(context.isOffline)
    }

    private func seed(_ context: InventoryItemFormContext) {
        switch request {
        case .create:
            draft.placementName = context.placementName
            phase = .ready
        case .edit:
            guard let item = context.item else {
                phase = .unavailable
                return
            }
            draft = InventoryItemDraft(editing: item, placementName: context.placementName)
            phase = .ready
        }
    }

    private func setOffline(_ offline: Bool) {
        isOffline = offline
        switch (offline, draft.code.assist) {
        case (true, .idle), (true, .rejected), (true, .unavailable):
            draft.code.assist = .offline
        case (false, .offline):
            draft.code.assist = .idle
        default:
            break
        }
    }

    private func record(_ error: Error) {
        guard let reported = InventoryWriteFailure.reporting(error) else { return }
        failure = reported
    }
}
