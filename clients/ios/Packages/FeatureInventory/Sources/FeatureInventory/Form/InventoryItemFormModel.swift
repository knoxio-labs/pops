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
    /// The active immutable catalogue used by the protocol-2 field editor.
    internal private(set) var protocol2Catalogue: InventoryCatalogueSnapshot?
    internal var protocol2Draft: InventoryProtocol2Draft?
    internal private(set) var isOffline = false
    /// False until the final action is pressed once: a form that reddens a
    /// field before anybody has typed opens accusing.
    internal private(set) var showsValidation = false
    internal private(set) var isSubmitting = false
    internal var failure: InventoryWriteFailure?
    /// The runner for photo commands already on the item: removing an
    /// attached photo (`item.removePhoto`) and reordering them
    /// (`item.reorderPhotos`) act at once and offer Undo, unlike the rest of
    /// the form, which writes nothing until the final action.
    internal let photoRunner: InventoryCommandRunner

    internal let store: any InventoryStore
    private let suggester: InventoryCodeSuggester
    private var original: InventoryItem?
    private var created = false
    /// What an offer over `photoRunner` reverses: the photo it removed, and
    /// where it stood, so Undo can put it back in place.
    internal var removedPhotos: [InventoryUndoOffer.ID: (photo: InventoryFormPhoto, index: Int)] =
        [:]
    /// Bytes for a photo captured this session, by hash: the source for its
    /// thumbnail before the server has ever seen it, and for a retry after a
    /// failed upload.
    internal var localPhotoData: [String: Data] = [:]
    /// The store's word on the photos it staged, which overrides the form's
    /// own once a photo is handed over.
    internal var photoUploads: [String: InventoryPhotoUpload] = [:]

    internal init(
        request: InventoryItemFormRequest, store: any InventoryStore,
        suggester: InventoryCodeSuggester, mintId: () -> String = { UUID().uuidString.lowercased() }
    ) {
        self.request = request
        self.store = store
        self.suggester = suggester
        photoRunner = InventoryCommandRunner(store: store)
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

    /// A code already worn by something else never blocks Create: the item
    /// is finished without one, the same as it would be with no code typed
    /// at all. Only a missing name does.
    internal var canSubmit: Bool {
        phase == .ready && !isSubmitting && draft.isNamed
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

    internal var protocol2Type: InventoryCatalogueType? {
        guard let draft = protocol2Draft else { return nil }
        return protocol2Catalogue?.types.first(where: { $0.id == draft.typeId })
    }

    internal func selectProtocol2Type(_ typeId: String) {
        guard var draft = protocol2Draft, draft.typeId != typeId else { return }
        draft.typeId = typeId
        draft.values = [:]
        draft.touched = []
        protocol2Draft = draft
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
            if draft.code.normalized == first, draft.code.heldBy == nil {
                draft.code.assist = .accepted
            }
        } catch RepositoryError.unavailable, RepositoryError.transport {
            draft.code.assist = .offline
        } catch {
            draft.code.assist = .unavailable
        }
    }

    /// Writes the draft. Returns true when every command landed and the form
    /// can close; there is no interstitial after a create. A code already
    /// worn by something else never stops this: the store refuses only
    /// `item.setCode`, per `InventoryItemFormSubmission`'s doc, and the rest
    /// of the write still lands.
    internal func submit() async -> Bool {
        showsValidation = true
        await checkCode()
        let blocking = issues.filter {
            if case .codeTaken = $0 { return false }
            return true
        }
        guard blocking.isEmpty, phase == .ready, !isSubmitting else { return false }
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

    private var commands: [InventoryCommand] {
        if let protocol2 = protocol2Draft, let type = protocol2Type {
            switch mode {
            case .create:
                let all = InventoryItemFormSubmission.protocol2Create(draft, protocol2: protocol2, type: type)
                return created ? Array(all.dropFirst()) : all
            case .edit:
                guard let original else { return [] }
                return InventoryItemFormSubmission.protocol2Edit(
                    draft, protocol2: protocol2, type: type, original: original)
            }
        }
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
        protocol2Catalogue = context.protocol2Catalogue
        original = context.item
        photoUploads = context.photoUploads
        followStoreUploads()
        if phase == .loading {
            seed(context)
        }
        setOffline(context.isOffline)
    }

    private func seed(_ context: InventoryItemFormContext) {
        switch request {
        case .create:
            draft.placementName = context.placementName
            if let catalogue = context.protocol2Catalogue, let type = catalogue.types.first {
                protocol2Draft = .init(typeId: type.id, catalogueRevision: catalogue.revision.revision)
            }
            phase = .ready
        case .edit:
            guard let item = context.item else {
                phase = .unavailable
                return
            }
            draft = InventoryItemDraft(editing: item, placementName: context.placementName)
            if let catalogue = context.protocol2Catalogue, let typeId = item.typeId {
                protocol2Draft = .init(
                    typeId: typeId, catalogueRevision: catalogue.revision.revision, item: item)
            }
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
