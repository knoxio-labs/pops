import DesignSystem
import SwiftUI

/// The four placements as one control, because they are one answer.
///
/// A segmented control rather than four rows: exactly one of them is true of
/// an object, and four rows with one of them filled in is a layout that lets a
/// person answer twice.
internal struct InventoryPlacementField: View {
    internal let choice: InventoryPlacementChoice
    internal let origin: InventoryCreationOrigin
    @State private var kind: InventoryPlacementKind

    internal init(choice: InventoryPlacementChoice, origin: InventoryCreationOrigin) {
        self.choice = choice
        self.origin = origin
        _kind = State(initialValue: choice.kind)
    }

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            Picker("Where it goes", selection: $kind) {
                ForEach(InventoryPlacementKind.offered(for: origin)) { kind in
                    Text(kind.label).tag(kind)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            if let placement = choice.placement {
                InventoryPlacementPath(placement: placement)
            } else {
                Button(choice.summary) {}
                    .font(.popsSubheadline.weight(.semibold))
                    .playgroundGlassButton()
                    .tint(.popsInventory)
            }
        }
        .padding(.vertical, PopsSpacing.xs)
    }
}

/// How many identical things this one record stands for.
///
/// One is not a field. The row says "One" and offers to make it more, and only
/// then does a count appear with what a group actually means beside it, since
/// the consequence (it is one placement, and splitting is how part of it
/// leaves) is the part people get wrong.
internal struct InventoryQuantityField: View {
    internal let draft: InventoryDraft
    @State private var count: String

    internal init(draft: InventoryDraft) {
        self.draft = draft
        _count = State(initialValue: String(draft.quantity))
    }

    @ViewBuilder internal var body: some View {
        if draft.isGrouped {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                PopsTextField(
                    "How many", placeholder: "1", text: $count, keyboard: .number)
                Text(
                    "One record for \(draft.quantity) identical things in one place. Some of them "
                        + "moving elsewhere is a split, not a second location."
                )
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
            }
            .padding(.vertical, PopsSpacing.xs)
        } else {
            PopsRow(title: "One of these") {
                Button("More than one") {}
                    .font(.popsSubheadline.weight(.semibold))
                    .playgroundGlassButton()
                    .tint(.popsInventory)
            }
        }
    }
}

/// Identifiers somebody else assigned, as many as the object carries.
internal struct InventoryIdentifierFields: View {
    internal let identifiers: [InventoryExternalIdentifier]

    internal var body: some View {
        Group {
            ForEach(identifiers) { identifier in
                InventoryIdentifierRow(identifier: identifier)
            }
            Button {
            } label: {
                Label(
                    identifiers.isEmpty ? "Add a serial or model" : "Add another",
                    systemImage: InventorySymbol.externalIdentifier.system
                )
                .font(.popsSubheadline)
            }
            .buttonStyle(.plain)
            .foregroundStyle(Color.popsAccent)
        }
    }
}

internal struct InventoryIdentifierRow: View {
    internal let identifier: InventoryExternalIdentifier
    @State private var value: String
    @State private var label: String

    internal init(identifier: InventoryExternalIdentifier) {
        self.identifier = identifier
        _value = State(initialValue: identifier.value)
        _label = State(initialValue: identifier.label)
    }

    internal var body: some View {
        HStack(alignment: .bottom, spacing: PopsSpacing.md) {
            Picker("Kind", selection: $label) {
                ForEach(InventoryExternalIdentifier.labels, id: \.self) { Text($0).tag($0) }
            }
            .labelsHidden()
            PopsTextField(
                placeholder: "As printed on it", text: $value, font: .popsMonospaced,
                note: identifier.isComplete ? nil : .hint("Nothing entered yet."))
        }
    }
}

/// Where it came from, offered once and never insisted on.
///
/// A link rather than a field, because most of a catalogue is built long after
/// the receipt is gone and a form that asks for one on every item teaches
/// people to skip the whole screen.
internal struct InventoryProvenanceField: View {
    internal let provenance: String?

    internal var body: some View {
        Button {
        } label: {
            Label(
                provenance ?? "Link a purchase or document",
                systemImage: InventorySymbol.provenance.system
            )
            .font(.popsSubheadline)
        }
        .buttonStyle(.plain)
        .foregroundStyle(provenance == nil ? Color.popsAccent : Color.popsForeground)
    }
}
