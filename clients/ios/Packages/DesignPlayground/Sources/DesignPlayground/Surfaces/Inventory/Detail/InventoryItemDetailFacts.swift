import DesignSystem
import SwiftUI

/// Where the item is and the fields its type highlights, as one block under
/// the name.
///
/// Not a card and not a section list: the two things a person opens this page
/// to check sit together in the space the HIG's layout guidance asks be given
/// to essential information. The type decides which of its fields belong here;
/// the rest are in Details, under the actions.
internal struct InventoryItemDetailFacts: View {
    internal let detail: InventoryItemDetail
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            placement
            if !highlighted.isEmpty { fields }
        }
        .padding(.horizontal, PopsSpacing.lg)
    }

    private var highlighted: [InventoryDetailField] { detail.highlightedFields }

    private var placement: some View {
        Button {
        } label: {
            HStack(spacing: PopsSpacing.xs) {
                InventoryPlacementPath(placement: detail.item.placement)
                Image(systemName: "chevron.forward")
                    .font(.popsCaption.weight(.semibold))
                    .foregroundStyle(Color.popsMutedForeground)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityHint("Opens where it is")
    }

    @ViewBuilder private var fields: some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                ForEach(highlighted) { cell($0) }
            }
        } else {
            Grid(
                alignment: .topLeading, horizontalSpacing: PopsSpacing.lg,
                verticalSpacing: PopsSpacing.sm
            ) {
                ForEach(pairs, id: \.self) { index in
                    GridRow {
                        cell(highlighted[index])
                        if index + 1 < highlighted.count {
                            cell(highlighted[index + 1])
                        }
                    }
                }
            }
        }
    }

    private var pairs: [Int] {
        Array(stride(from: 0, to: highlighted.count, by: 2))
    }

    private func cell(_ field: InventoryDetailField) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(field.key)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
            Text(field.value)
                .font(.popsBody)
                .foregroundStyle(Color.popsForeground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}
