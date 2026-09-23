import AppCore
import DesignSystem
import SwiftUI

/// The top of the page: the photographs, then the name, the code and the
/// state under them.
///
/// The picture is the header rather than a row inside one. It bleeds to the
/// top edge and the navigation bar's glass sits over it, which is where iOS 26
/// puts the functional layer.
internal struct InventoryItemDetailHeader: View {
    internal let detail: InventoryItemDetail
    internal let load: InventoryPhotoLoader
    internal let manage: InventoryPhotoManagement?
    @ScaledMetric(relativeTo: .largeTitle) private var heroHeight = PopsSize.pageHeight * 1.5

    internal init(
        detail: InventoryItemDetail, load: @escaping InventoryPhotoLoader,
        manage: InventoryPhotoManagement? = nil
    ) {
        self.detail = detail
        self.load = load
        self.manage = manage
    }

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            hero
            identity
                .padding(.horizontal, PopsSpacing.lg)
        }
    }

    private var hero: some View {
        InventoryItemDetailHeroPhotos(
            photos: detail.photos, symbol: detail.record.symbol.system, load: load, manage: manage
        )
        .frame(height: heroHeight)
        .frame(maxWidth: .infinity)
        .clipped()
    }

    private var identity: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(detail.record.name)
                .font(.popsTitle)
                .foregroundStyle(
                    detail.record.lifecycle.countsTowardTotals
                        ? Color.popsForeground : Color.popsMutedForeground
                )
                .strikethrough(detail.record.lifecycle == .destroyed)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: PopsSpacing.sm) {
                Text(detail.subtitle)
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
                    .lineLimit(1)
                if let code = detail.record.code {
                    InventoryCodeBadge(code: code)
                }
                Spacer(minLength: PopsSpacing.xs)
                InventorySyncMarker(sync: detail.record.sync)
            }
            marks
        }
    }

    @ViewBuilder private var marks: some View {
        let marks = InventoryStateMark.marks(for: detail.record)
        if !marks.isEmpty {
            InventoryChipFlow(spacing: PopsSpacing.xs) {
                ForEach(marks) { InventoryStateBadge(mark: $0) }
            }
            .popsFadeIn()
        }
    }
}

/// Where the item is and the fields its type highlights, as one block under
/// the name: the two things a person opens this page to check. The type's
/// descriptor decides which fields belong here; the rest are in Details.
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

    @ViewBuilder private var placement: some View {
        if let holder = detail.record.trail.holder {
            NavigationLink(value: holder) { placementLine }
                .buttonStyle(.plain)
                .accessibilityHint("Opens where it is")
        } else {
            placementLine
        }
    }

    private var placementLine: some View {
        HStack(spacing: PopsSpacing.xs) {
            InventoryPlacementPath(trail: detail.record.trail)
            if detail.record.trail.holder != nil {
                Image(systemName: "chevron.forward")
                    .font(.popsCaption.weight(.semibold))
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(.rect)
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
            Text(field.label)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
            Text(field.value)
                .font(.popsBody)
                .foregroundStyle(field.source.isMuted ? Color.popsMutedForeground : .popsForeground)
            if let caption = field.source.caption {
                Text(caption)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}
