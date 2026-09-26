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
/// Nothing is written until the final action. Create performs one
/// `item.create` carrying the code, then attaches photos; if the create lands
/// and a photo does not, a second press sends only what is left, because the
/// item already exists.
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
    internal private(set) var protocol2ReferenceTargets: [InventoryProtocol2ReferenceTarget] = []
    /// Each computed field's current display state, by field ID. See
    /// ``InventoryItemFormContext/computedDisplays``.
    internal private(set) var protocol2ComputedDisplays: [String: InventoryComputedDisplay] = [:]
    /// See ``InventoryItemFormContext/computedMissingInputs``.
    internal private(set) var protocol2ComputedMissingInputs: [String: [InventoryMissingInput]] =
        [:]
    internal private(set) var isOffline = false
    /// False until the final action is pressed once: a form that reddens a
    /// field before anybody has typed opens accusing.
    internal private(set) var showsValidation = false
    internal private(set) var isSubmitting = false
    /// A free code to wear instead, offered while the typed one is held.
    internal var freeCode: String?
    internal var failure: InventoryWriteFailure?
    /// The runner for photo commands already on the item: removing an
    /// attached photo (`item.removePhoto`) and reordering them
    /// (`item.reorderPhotos`) act at once and offer Undo, unlike the rest of
    /// the form, which writes nothing until the final action.
    internal let photoRunner: InventoryCommandRunner

    internal let store: any InventoryStore
    internal let suggester: InventoryCodeSuggester
    internal let mintProtocol2ValueId: () -> String
    /// The item as the store has it; nil for a create.
    internal var original: InventoryItem?
    /// For a `.repair` request: whether the held change was a new item or a
    /// change to one, which decides what saving sends.
    internal var repairMode: InventoryItemFormMode = .edit
    /// For a `.repair` request: the held change's values that no longer fit
    /// the current fields, shown struck through with why.
    internal var notCarried: [InventoryQueuedValue] = []
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
        suggester: InventoryCodeSuggester,
        mintId: () -> String = { UUID().uuidString.lowercased() },
        mintProtocol2ValueId: @escaping () -> String = { UUID().uuidString.lowercased() }
    ) {
        self.request = request
        self.store = store
        self.suggester = suggester
        self.mintProtocol2ValueId = mintProtocol2ValueId
        photoRunner = InventoryCommandRunner(store: store)
        switch request {
        case .create(let placement):
            draft = InventoryItemDraft(id: mintId(), placement: placement ?? .hand)
        case .edit(let id), .labelling(let id):
            draft = InventoryItemDraft(id: id)
        case .repair:
            draft = InventoryItemDraft(id: "")
        }
    }

    internal var issues: [InventoryDraftIssue] {
        InventoryItemFormSubmission.issues(for: draft, catalogue: catalogue)
    }

    /// A missing name blocks the final action, and so does a code another
    /// item already wears (POPS-4063): the create would be refused whole,
    /// so the form offers a free code instead of sending it.
    internal var canSubmit: Bool {
        phase == .ready && !isSubmitting && draft.isNamed && draft.code.heldBy == nil
    }

    /// Whether Cancel has something to lose and so asks first.
    internal var hasStagedWork: Bool {
        mode == .create
            ? draft.hasStagedWork || protocol2Draft?.hasStagedWork == true
            : !commands.isEmpty
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
}

extension InventoryItemFormModel {
    internal func codeChanged(to value: String) {
        let previous = draft.code.value
        draft.code.assist = draft.code.assist.typed(value, previous: previous)
        draft.code.value = value
    }

    internal func suggestCode() async {
        guard draft.code.assist.canSuggest, !isOffline, draft.isNamed else { return }
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
    /// worn by something else stops it, whether this phone's replica knew
    /// (checked first) or only the store found out: the create carries its
    /// code, so it is refused whole and the form offers a free one.
    internal func submit() async -> Bool {
        showsValidation = true
        await checkCode()
        guard issues.isEmpty, protocol2Issues.isEmpty, phase == .ready, !isSubmitting else {
            return false
        }
        isSubmitting = true
        defer { isSubmitting = false }
        if case .repair(let repairId) = request {
            return await submitRepair(repairId, commands: commands)
        }
        for command in commands {
            do {
                _ = try await store.perform(command)
                if case .createItem = command { created = true }
                if case .createProtocol2Item = command { created = true }
            } catch let InventoryCommandError.codeCollision(_, heldByName, suggestedCode) {
                draft.code.heldBy = heldByName
                freeCode = suggestedCode.isEmpty ? nil : suggestedCode
                return false
            } catch {
                record(error)
                return false
            }
        }
        return true
    }

    internal var commands: [InventoryCommand] {
        if let protocol2 = protocol2Draft, let type = protocol2Type {
            switch mode {
            case .create:
                let all = InventoryItemFormSubmission.protocol2Create(
                    draft, protocol2: protocol2, type: type)
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
        protocol2ReferenceTargets = context.protocol2ReferenceTargets
        protocol2ComputedDisplays = context.computedDisplays
        protocol2ComputedMissingInputs = context.computedMissingInputs
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
            if let catalogue = context.protocol2Catalogue {
                guard let type = catalogue.types.first(where: { $0.archivedAt == nil }) else {
                    phase = .unavailable
                    return
                }
                protocol2Draft = .init(
                    type: type, catalogueRevision: catalogue.revision.revision)
            }
            phase = .ready
        case .edit, .labelling:
            guard let item = context.item else {
                phase = .unavailable
                return
            }
            draft = InventoryItemDraft(editing: item, placementName: context.placementName)
            if let catalogue = context.protocol2Catalogue, let typeId = item.typeId {
                guard let type = catalogue.types.first(where: { $0.id == typeId }) else {
                    phase = .unavailable
                    return
                }
                protocol2Draft = .init(
                    type: type, catalogueRevision: catalogue.revision.revision, item: item)
            }
            clampContainerQuantity()
            phase = .ready
        case .repair:
            phase = seedRepair(context)
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

    internal func record(_ error: Error) {
        guard let reported = InventoryWriteFailure.reporting(error) else { return }
        failure = reported
    }
}
