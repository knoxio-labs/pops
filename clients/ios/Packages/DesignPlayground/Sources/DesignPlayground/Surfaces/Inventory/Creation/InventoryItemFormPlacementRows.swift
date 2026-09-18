import DesignSystem
import SwiftUI

/// The destinations this phone has been putting things into, in the words the
/// dashboard uses for the same three containers.
internal enum InventoryFormDestinations {
    internal static let containers = [
        InventoryDestination(id: "kitchen-12", name: "Kitchen 12", kind: .container),
        InventoryDestination(id: "office-04", name: "Office 04", kind: .container),
        InventoryDestination(id: "garage-tools", name: "Garage tools", kind: .container),
    ]

    internal static let locations = [
        InventoryDestination(id: "kitchen", name: "Kitchen", kind: .location),
        InventoryDestination(id: "study", name: "Study", kind: .location),
        InventoryDestination(id: "garage", name: "Garage", kind: .location),
        InventoryDestination(id: "hall-cupboard", name: "Hall cupboard", kind: .location),
    ]

    internal static let recent = [containers[0], locations[0], containers[1]]
}

/// Where the item goes, as one row that opens the shared destination picker.
///
/// One row rather than four segments: an item is in exactly one place, and the
/// four answers, the container in front of you, another container, a location
/// and in hand, are four rows of one list rather than a control of their own.
/// The glyph and its colour are the dashboard's, so an open container offered
/// here is the same orange object it is over there.
internal struct InventoryFormDestinationRow: View {
    internal let choice: InventoryPlacementChoice
    internal let name: String
    @State private var choosing = false

    internal var body: some View {
        Button {
            choosing = true
        } label: {
            HStack(spacing: PopsSpacing.sm) {
                Image(systemName: choice.destinationSymbol)
                    .foregroundStyle(choice.destinationTone)
                    .accessibilityHidden(true)
                Text(choice.summary)
                    .font(.popsBody)
                    .foregroundStyle(Color.popsForeground)
                Spacer(minLength: PopsSpacing.sm)
                Image(systemName: "chevron.forward")
                    .font(.popsCaption.weight(.semibold))
                    .foregroundStyle(Color.popsMutedForeground)
                    .accessibilityHidden(true)
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Where it goes, \(choice.summary)")
        .sheet(isPresented: $choosing) {
            InventoryDestinationPickerSheet(
                itemName: name.isEmpty ? "this item" : name,
                recent: InventoryFormDestinations.recent,
                containers: InventoryFormDestinations.containers,
                locations: InventoryFormDestinations.locations,
                onChoose: { _ in choosing = false })
        }
    }
}

/// Identifiers somebody else assigned: one row per identifier the item
/// carries, then an empty row whose plus adds another.
internal struct InventoryFormIdentifierRows: View {
    internal let identifiers: [InventoryExternalIdentifier]

    internal var body: some View {
        ForEach(identifiers) { InventoryFormIdentifierRow(identifier: $0) }
        InventoryFormNewIdentifierRow()
    }
}

internal struct InventoryFormIdentifierRow: View {
    @State private var value: String
    @State private var label: String

    internal init(identifier: InventoryExternalIdentifier) {
        _value = State(initialValue: identifier.value)
        _label = State(initialValue: identifier.label)
    }

    internal var body: some View {
        HStack {
            InventoryFormCompactMenu(
                title: "Kind", options: InventoryExternalIdentifier.labels, selection: $label)
            TextField("Serial or model", text: $value)
                .font(value.isEmpty ? .popsBody : .popsMonospaced)
                .multilineTextAlignment(.trailing)
                .lineLimit(1)
        }
    }
}

internal struct InventoryFormNewIdentifierRow: View {
    @State private var value = ""

    internal var body: some View {
        InventoryFormTextRow(
            "Serial / model", placeholder: "Optional", text: $value, monospaced: true
        ) {
            Button {
            } label: {
                InventorySymbol.add.image
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Add another serial or model")
        }
    }
}
