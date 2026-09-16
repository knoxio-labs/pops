import SwiftUI

/// One condition the create flow has to survive, named once.
///
/// The list is shared by every structural variant, so a reviewer switching
/// from the scrolling form to the staged flow is looking at the same fourteen
/// conditions rather than at whichever ones each variant's author thought of.
internal struct InventoryCreateCase {
    internal let id: String
    internal let title: String
    internal let draft: InventoryDraft
    internal let resumed: Bool
    internal let cancelling: Bool
    /// Where in the staged flow this condition is visible. Ignored by the
    /// variants that have no steps.
    internal let step: InventoryCreateStep

    internal init(
        id: String,
        title: String,
        draft: InventoryDraft,
        resumed: Bool = false,
        cancelling: Bool = false,
        step: InventoryCreateStep = .identity
    ) {
        self.id = id
        self.title = title
        self.draft = draft
        self.resumed = resumed
        self.cancelling = cancelling
        self.step = step
    }

    /// A finished draft with no photograph. Photos are encouraged and never
    /// required, so this is a complete item rather than a partial one.
    private static var photoless: InventoryDraft {
        var draft = InventoryDraftFixtures.ready
        draft.photos = []
        return draft
    }

    internal static let all: [InventoryCreateCase] = [
        InventoryCreateCase(
            id: "partial", title: "Part way in", draft: InventoryDraftFixtures.partial),
        InventoryCreateCase(
            id: "blank", title: "Nothing entered", draft: InventoryDraftFixtures.blank),
        InventoryCreateCase(
            id: "photoless", title: "Finished, no photo", draft: photoless, step: .review),
        InventoryCreateCase(
            id: "multi-photo", title: "Four photos", draft: InventoryDraftFixtures.multiPhoto,
            step: .photos),
        InventoryCreateCase(
            id: "grouped", title: "A group of 48", draft: InventoryDraftFixtures.grouped,
            step: .placement),
        InventoryCreateCase(
            id: "duplicate", title: "Copied from another item",
            draft: InventoryDraftFixtures.duplicate),
        InventoryCreateCase(
            id: "resumed", title: "Found again after a relaunch",
            draft: InventoryDraftFixtures.resumable, resumed: true),
        InventoryCreateCase(
            id: "cancelling", title: "Leaving with work staged",
            draft: InventoryDraftFixtures.multiPhoto, cancelling: true),
        InventoryCreateCase(
            id: "ready", title: "Ready to create", draft: InventoryDraftFixtures.ready,
            step: .review),
        InventoryCreateCase(
            id: "photos-partial", title: "One photo would not send",
            draft: InventoryDraftFixtures.partialUpload, step: .photos),
    ]
}

/// The four shapes the create flow could have.
internal enum InventoryCreateStructure: String, CaseIterable, Identifiable {
    case form
    case photoLed
    case steps
    case sheets

    internal var id: String { rawValue }

    @MainActor @ViewBuilder
    internal func view(for entry: InventoryCreateCase) -> some View {
        switch self {
        case .form, .photoLed:
            InventoryCreateFormView(
                draft: entry.draft, photoLed: self == .photoLed, resumed: entry.resumed,
                cancelling: entry.cancelling)
        case .steps:
            InventoryCreateStepsView(draft: entry.draft, step: entry.step)
        case .sheets:
            InventoryCreateSheetsView(draft: entry.draft)
        }
    }
}

/// One state the code suggestion can leave the field in.
internal struct InventoryCodeCase {
    internal let id: String
    internal let title: String
    internal let assist: InventoryCodeAssist
    internal let value: String

    internal static let all: [InventoryCodeCase] = [
        InventoryCodeCase(
            id: "offered", title: "Offered, with alternatives",
            assist: .offered(alternatives: ["BREW-0043", "KIT-0118"]), value: "BREW-0042"),
        InventoryCodeCase(id: "idle", title: "Nothing asked", assist: .idle, value: ""),
        InventoryCodeCase(id: "pending", title: "Looking", assist: .suggesting, value: ""),
        InventoryCodeCase(id: "accepted", title: "Accepted", assist: .accepted, value: "BREW-0042"),
        InventoryCodeCase(id: "rejected", title: "Dismissed", assist: .rejected, value: ""),
        InventoryCodeCase(
            id: "edited", title: "Accepted, then changed",
            assist: .edited(suggested: "BREW-0042"), value: "BREW-0042-A"),
        InventoryCodeCase(
            id: "collision", title: "Already worn by something else",
            assist: .collision(existing: "Espresso machine"), value: "BREW-0042"),
        InventoryCodeCase(id: "offline", title: "Offline", assist: .offline, value: ""),
        InventoryCodeCase(
            id: "unavailable", title: "Refused",
            assist: .unavailable(reason: "Code suggestions are turned off for this catalogue."),
            value: ""),
    ]
}
