import DesignSystem
import SwiftUI

/// A destination in the dashboard's row idiom: its glyph, its name over where
/// it is, a tick once picked, and a chevron when it has places inside.
internal struct InventoryDestinationRow: View {
    let destination: InventoryDestination
    let isSelected: Bool
    let drillID: String?
    let reservesDrill: Bool
    let onSelect: () -> Void
    @ScaledMetric(relativeTo: .body) private var markSize = PopsSize.touchTarget

    var body: some View {
        HStack(spacing: PopsSpacing.sm) {
            Button(action: onSelect) { label }
                .buttonStyle(.plain)
                .accessibilityAddTraits(isSelected ? .isSelected : [])
            if let drillID {
                NavigationLink(value: drillID) {
                    Image(systemName: "chevron.forward")
                        .font(.popsCaption.weight(.semibold))
                        .foregroundStyle(Color.popsMutedForeground)
                        .frame(width: markSize, height: markSize)
                        .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Inside \(destination.name)")
            } else if reservesDrill {
                Spacer(minLength: PopsSpacing.zero)
                    .frame(width: markSize)
            }
        }
    }

    private var label: some View {
        HStack(spacing: PopsSpacing.md) {
            Image(systemName: destination.symbol)
                .font(.popsHeadline)
                .foregroundStyle(destination.tone)
                .frame(width: markSize, height: markSize)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(destination.name)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                if let detail = destination.detail, !detail.isEmpty {
                    Text(detail)
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
            }
            Spacer(minLength: PopsSpacing.sm)
            if isSelected {
                Image(systemName: "checkmark.circle.fill")
                    .font(.popsTitle)
                    .foregroundStyle(Color.popsInventory)
                    .transition(.scale.combined(with: .opacity))
                    .accessibilityHidden(true)
            } else if let count = destination.count {
                Text("\(count)")
                    .font(.popsHeadline)
                    .monospacedDigit()
                    .foregroundStyle(Color.popsForeground)
            }
        }
        .padding(.vertical, PopsSpacing.xs)
        .frame(minHeight: markSize)
        .contentShape(.rect)
    }
}

/// New place, at the end of a level: a row that becomes a name field.
internal struct InventoryNewPlaceRow: View {
    @Binding var drafting: String?
    let onAdd: (String) -> Void
    @ScaledMetric(relativeTo: .body) private var markSize = PopsSize.touchTarget
    @FocusState private var focused: Bool

    private var trimmed: String {
        (drafting ?? "").trimmingCharacters(in: .whitespaces)
    }

    var body: some View {
        HStack(spacing: PopsSpacing.md) {
            InventorySymbol.addNew.image
                .font(.popsHeadline)
                .foregroundStyle(Color.popsInventory)
                .frame(width: markSize, height: markSize)
            if drafting != nil {
                field
            } else {
                Button("New place") { drafting = "" }
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsInventory)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .frame(minHeight: markSize)
        .padding(.vertical, PopsSpacing.xs)
        .popsMotion(value: drafting == nil)
    }

    private var field: some View {
        HStack(spacing: PopsSpacing.sm) {
            TextField("Place name", text: Binding(get: { drafting ?? "" }, set: { drafting = $0 }))
                .font(.popsBody)
                .focused($focused)
                .submitLabel(.done)
                .onSubmit { add() }
            Button("Add") { add() }
                .font(.popsHeadline)
                .inventoryProminentGlassButton()
                .tint(.popsInventory)
                .disabled(trimmed.isEmpty)
        }
        .transition(.opacity)
    }

    private func add() {
        guard !trimmed.isEmpty else { return }
        onAdd(trimmed)
    }
}
