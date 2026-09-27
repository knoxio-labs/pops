import SwiftUI

/// One condition the form has to survive, named once.
///
/// A list rather than a switcher built into the view, so the states a reviewer
/// walks are declared in one place and adding one is a line rather than a
/// branch inside a screen.
internal struct InventoryItemFormCase: Identifiable {
    internal let id: String
    internal let title: String
    internal let draft: InventoryDraft
    internal let mode: InventoryItemFormMode
    internal let showsValidation: Bool
    internal let cancelling: Bool
    internal let notCarried: [InventoryQueuedValue]

    internal init(
        id: String,
        title: String,
        draft: InventoryDraft,
        mode: InventoryItemFormMode = .create,
        showsValidation: Bool = false,
        cancelling: Bool = false,
        notCarried: [InventoryQueuedValue] = []
    ) {
        self.id = id
        self.title = title
        self.draft = draft
        self.mode = mode
        self.showsValidation = showsValidation
        self.cancelling = cancelling
        self.notCarried = notCarried
    }

    @MainActor internal var view: some View {
        let form = InventoryItemFormView(
            draft: draft, mode: mode, showsValidation: showsValidation,
            cancelling: cancelling, notCarried: notCarried
        )
        .id(id)
        return Group {
            if id == "type-tree" {
                form.navigationDestination(isPresented: .constant(true)) {
                    InventoryFormTypePicker(selection: .constant(nil as String?))
                }
            } else if id == "type-tree-search" {
                form.navigationDestination(isPresented: .constant(true)) {
                    InventoryFormTypePicker(
                        selection: .constant("Pillowcase" as String?), query: "pillowcase")
                }
            } else {
                form
            }
        }
    }

    internal static let all: [InventoryItemFormCase] = entry + identity + placement + endings

    private static let entry: [InventoryItemFormCase] = [
        InventoryItemFormCase(
            id: "blank", title: "Nothing entered", draft: InventoryDraftFixtures.blank),
        InventoryItemFormCase(
            id: "named", title: "A name typed", draft: InventoryDraftFixtures.named),
        InventoryItemFormCase(
            id: "photos", title: "Three photos, one still going",
            draft: InventoryDraftFixtures.photographed),
    ]

    private static let identity: [InventoryItemFormCase] = [
        InventoryItemFormCase(
            id: "typed", title: "A type, and the fields it brings",
            draft: InventoryDraftFixtures.typed),
        InventoryItemFormCase(
            id: "untyped", title: "No type yet", draft: InventoryDraftFixtures.untyped),
        InventoryItemFormCase(
            id: "type-tree", title: "Type tree", draft: InventoryDraftFixtures.typed),
        InventoryItemFormCase(
            id: "type-tree-search", title: "Type tree search", draft: InventoryDraftFixtures.typed),
        InventoryItemFormCase(
            id: "type-parent-chosen", title: "Parent type chosen", draft: parentChosen),
        InventoryItemFormCase(
            id: "type-change-in-tree", title: "Type changed in tree", draft: changedType,
            mode: .edit,
            notCarried: [
                InventoryQueuedValue(
                    field: "Fitted", value: "Yes", fit: .changedKind(to: "not kept"))
            ]),
        InventoryItemFormCase(
            id: "code-pending", title: "A code being suggested",
            draft: InventoryDraftFixtures.withCode(.suggesting)),
        InventoryItemFormCase(
            id: "code-accepted", title: "A code accepted",
            draft: InventoryDraftFixtures.withCode(.accepted, value: "CBL-0042")),
        InventoryItemFormCase(
            id: "code-edited", title: "A code typed over",
            draft: InventoryDraftFixtures.withCode(
                .edited(suggested: "CBL-0042"), value: "CBL-0042-A")),
        InventoryItemFormCase(
            id: "code-collision", title: "A code already worn",
            draft: InventoryDraftFixtures.withCode(
                .collision(existing: "USB-C to USB-C cable, 2 m"), value: "CBL-0042")),
    ]

    private static let placement: [InventoryItemFormCase] = [
        InventoryItemFormCase(
            id: "grouped", title: "Ten of one thing", draft: InventoryDraftFixtures.grouped),
        InventoryItemFormCase(
            id: "destination-location", title: "Into a location",
            draft: InventoryDraftFixtures.inLocation),
        InventoryItemFormCase(
            id: "destination-in-hand", title: "In hand for now",
            draft: InventoryDraftFixtures.inHand),
    ]

    private static let endings: [InventoryItemFormCase] = [
        InventoryItemFormCase(
            id: "validation-name", title: "Created with no name",
            draft: InventoryDraftFixtures.unnamed, showsValidation: true),
        InventoryItemFormCase(
            id: "validation-code", title: "Created with a taken code",
            draft: InventoryDraftFixtures.withCode(
                .collision(existing: "USB-C to USB-C cable, 2 m"), value: "CBL-0042"),
            showsValidation: true),
        InventoryItemFormCase(
            id: "cancelling", title: "Leaving with work staged",
            draft: InventoryDraftFixtures.photographed, cancelling: true),
        InventoryItemFormCase(
            id: "edit", title: "Editing an item that exists", draft: InventoryDraftFixtures.rich,
            mode: .edit),
    ]

    private static let parentChosen = InventoryDraft(
        internalID: "itm-type-parent", name: "Linen pillow", typeName: "Pillows")

    private static let changedType = InventoryDraft(
        internalID: "itm-sheet", name: "Linen sheet", typeName: "Quilt cover",
        values: [
            InventoryProperty("Destination", .text("Guest room")),
            InventoryProperty("Material", .text("Cotton")),
            InventoryProperty("Colour", .text("White")),
            InventoryProperty("Pattern", .text("Plain")),
        ], placement: .directLocation("Guest room"))
}
