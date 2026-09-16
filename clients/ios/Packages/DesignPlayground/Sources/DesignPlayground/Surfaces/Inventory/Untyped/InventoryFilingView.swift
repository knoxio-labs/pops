import DesignSystem
import SwiftUI

/// Filing something no type covers, end to end.
///
/// Four moments rather than one screen, because the interesting part is not
/// the form: it is that looking for a type fails, and what the product does
/// with that failure. Each is a state so a reviewer meets them in order.
internal enum InventoryFilingStep: String, CaseIterable, Identifiable {
    case naming
    case typeSearch = "type-search"
    case note
    case filed

    internal var id: String { rawValue }

    internal var title: String {
        switch self {
        case .naming: "Filing it"
        case .typeSearch: "Looking for a type"
        case .note: "What the note took"
        case .filed: "Filed"
        }
    }
}

internal struct InventoryFilingView: View {
    internal let step: InventoryFilingStep

    @ViewBuilder internal var body: some View {
        switch step {
        case .naming: InventoryFilingNamingView()
        case .typeSearch: InventoryFilingTypeSearchView()
        case .note: InventoryFilingNoteView()
        case .filed: InventoryFilingFiledView()
        }
    }
}

/// The add screen, with the type row saying what it cannot say.
///
/// The type row is first rather than last. It is the field that fails, and a
/// form that asks for it after the note has already absorbed everything makes
/// the failure look like the person's fault.
internal struct InventoryFilingNamingView: View {
    @Environment(\.inventoryUntypedStyle) private var style
    @State private var name = "Unlabelled canvas bag"
    @State private var note = ""
    @State private var freeField = ""
    @State private var freeValue = ""
    @State private var quantity = 1

    internal var body: some View {
        List {
            Section("What it is") {
                Label("Add a photo", systemImage: InventorySymbol.photo.system)
                    .font(.popsBody)
                    .foregroundStyle(Color.popsInventory)
                    .frame(minHeight: PopsSize.touchTarget)
                TextField("Name", text: $name)
                    .font(.popsBody)
            }
            typeSection
            Section("Where it goes") {
                LabeledContent("Location", value: "Garage")
                Stepper("Quantity: \(quantity)", value: $quantity, in: 1...99)
                LabeledContent("Inventory code", value: "None")
            }
            noteSection
            freeFieldSection
        }
        .playgroundInsetGroupedList()
        .tint(.popsInventory)
    }

    private var typeSection: some View {
        Section {
            LabeledContent("Type") {
                Text("No type yet").foregroundStyle(Color.popsInventory)
            }
            Button("Look for one") {}
                .frame(minHeight: PopsSize.touchTarget)
        } header: {
            Text("Type")
        } footer: {
            InventoryTypeSourceNote(
                "Seven types exist. None of them is a bag, so this one is filed without a type and "
                    + "counted until an update adds one.")
        }
    }

    @ViewBuilder private var noteSection: some View {
        Section {
            TextField(notePlaceholder, text: $note, axis: .vertical)
                .font(.popsBody)
                .lineLimit(3...5)
            if style.capture == .promptedNote {
                InventoryChipFlow(spacing: PopsSpacing.xs) {
                    ForEach(InventoryFilingNamingView.prompts, id: \.self) { prompt in
                        InventoryPropertyChip(prompt, tone: .popsInventory)
                    }
                }
            }
        } header: {
            Text("Note")
        } footer: {
            Text(noteFooter)
        }
    }

    @ViewBuilder private var freeFieldSection: some View {
        if style.capture == .oneFreeProperty {
            Section {
                TextField("What it is called", text: $freeField)
                TextField("What it says", text: $freeValue)
            } header: {
                Text("One fact of your own")
            } footer: {
                Text(
                    "One only, and no type will ever read it. A second one is the key and value "
                        + "store the type model was chosen over.")
            }
        }
    }

    private var notePlaceholder: String {
        style.capture == .promptedNote
            ? "Answer as many as are worth answering" : "Anything worth knowing"
    }

    private var noteFooter: String {
        switch style.capture {
        case .noteOnly:
            "Everything a type would have asked goes here, as prose. Search reads it."
        case .oneFreeProperty:
            "Prose, plus the one fact above. Search reads both."
        case .promptedNote:
            "The questions a type asks most often, offered as prompts. What is saved is still prose."
        }
    }

    /// The questions the seven existing types ask most often, which is the most
    /// a prompt can honestly be: nothing here knows what a bag is.
    private static let prompts = ["What is it for", "Where it came from", "Size", "Condition"]
}
