import DesignSystem
import SwiftUI

/// A row's leading mark: the photograph when there is one, the kind's glyph
/// when there is not, and a small container glyph over a container's photo so
/// the kind still reads.
internal struct InventoryRecordMark: View {
    internal let photo: Data?
    internal let symbol: String
    internal var showsKindBadge = false
    @ScaledMetric(relativeTo: .body) private var size = PopsSize.touchTarget

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: PopsRadius.control, style: .continuous)
    }

    internal var body: some View {
        InventorySelectableMark { picture }
    }

    private var picture: some View {
        Group {
            if let photo {
                Color.popsSurface
                    .overlay {
                        InventoryItemDetailPicture(
                            photo: InventoryPhoto(caption: "", isBroken: false, imageData: photo),
                            symbol: symbol)
                    }
                    .clipShape(shape)
                    .overlay(alignment: .bottomTrailing) {
                        if showsKindBadge { kindBadge }
                    }
            } else {
                Image(systemName: symbol)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    private var kindBadge: some View {
        Image(systemName: symbol)
            .font(.popsCaption.weight(.semibold))
            .foregroundStyle(Color.popsForeground)
            .padding(PopsSpacing.xs)
            .background(Color.popsSurface, in: .circle)
            .offset(x: PopsSpacing.xs, y: PopsSpacing.xs)
    }
}

/// A name with every occurrence of the query drawn in the screen's accent.
internal struct InventoryHighlightedName: View {
    internal let name: String
    internal let query: String
    internal var isMuted = false
    internal var isStruck = false
    @Environment(\.inventoryAccent) private var accent

    internal var body: some View {
        Text(attributed)
            .font(.popsHeadline)
            .strikethrough(isStruck)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var attributed: AttributedString {
        var text = AttributedString(name)
        text.foregroundColor = isMuted ? Color.popsMutedForeground : Color.popsForeground
        for range in InventorySearchRanking.highlights(of: query, in: name) {
            let lower = AttributedString.Index(range.lowerBound, within: text)
            let upper = AttributedString.Index(range.upperBound, within: text)
            if let lower, let upper {
                text[lower..<upper].foregroundColor = accent
            }
        }
        return text
    }
}

/// An item or container in the dashboard's row idiom: mark, name over type
/// and placement, then what the row has to say on its trailing edge.
internal struct InventoryRecordRowLabel: View {
    internal let record: InventorySearchRecord
    internal var query = ""
    internal var showsCode = false
    internal var isStale = false
    internal var showsChevron = true

    internal var body: some View {
        HStack(spacing: PopsSpacing.md) {
            InventoryRecordMark(
                photo: record.photo, symbol: record.item.symbol.system,
                showsKindBadge: record.kind == .container)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                InventoryHighlightedName(
                    name: record.item.name, query: query,
                    isMuted: record.item.lifecycle != .active,
                    isStruck: record.item.lifecycle == .destroyed)
                Text(record.detailLine)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
                badges
            }
            Spacer(minLength: PopsSpacing.sm)
            if let sync = syncMark {
                sync.symbol.image
                    .font(.popsCaption.weight(.semibold))
                    .foregroundStyle(sync.tone)
                    .accessibilityLabel(sync.label)
            }
            InventoryQuantityBadge(quantity: record.item.quantity)
            if showsChevron { InventoryRowChevron() }
        }
        .padding(.vertical, PopsSpacing.xs)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
    }

    private var lifecycleMark: InventoryStateMark? {
        InventoryStateMark.marks(for: record.item).first { $0.id == "lifecycle" }
    }

    @ViewBuilder private var badges: some View {
        let code = showsCode ? record.item.code : nil
        if lifecycleMark != nil || code != nil {
            InventoryChipFlow(spacing: PopsSpacing.xs) {
                if let lifecycleMark { InventoryStateBadge(mark: lifecycleMark) }
                if let code { InventoryCodeBadge(code: code) }
            }
        }
    }

    private var syncMark: InventorySyncMark? {
        if isStale || record.item.sync == .stale {
            return InventorySyncMark(
                symbol: .stale, tone: .popsWarning, label: InventorySync.stale.label)
        }
        if record.item.sync == .needsAttention {
            return InventorySyncMark(
                symbol: .attention, tone: .popsDestructive,
                label: InventorySync.needsAttention.label)
        }
        if record.item.sync.prominence == .quiet {
            return InventorySyncMark(
                symbol: .queued, tone: .popsMutedForeground, label: record.item.sync.label)
        }
        return nil
    }
}

private struct InventorySyncMark {
    let symbol: InventorySymbol
    let tone: Color
    let label: String
}

/// A place, in the same idiom: its kind's glyph, its name, the path above it.
internal struct InventoryPlaceRowLabel: View {
    internal let place: InventoryLocationNode
    internal let tree: InventoryLocationTree
    internal var query = ""
    internal var showsChevron = true

    internal var body: some View {
        HStack(spacing: PopsSpacing.md) {
            InventoryRecordMark(photo: nil, symbol: place.kind.symbol)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                InventoryHighlightedName(name: place.name, query: query)
                Text(detail)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: PopsSpacing.sm)
            if showsChevron { InventoryRowChevron() }
        }
        .padding(.vertical, PopsSpacing.xs)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
    }

    private var detail: String {
        let path = tree.parentPath(of: place.id)
        return path.isEmpty ? place.kind.title : "\(place.kind.title) · \(path)"
    }
}

internal struct InventoryRowChevron: View {
    internal var body: some View {
        Image(systemName: "chevron.forward")
            .font(.popsCaption.weight(.semibold))
            .foregroundStyle(Color.popsMutedForeground)
            .padding(.trailing, PopsSpacing.sm)
            .accessibilityHidden(true)
    }
}

/// One ranked hit, pushed to its own page.
internal struct InventorySearchHitRow: View {
    internal let hit: InventorySearchHit
    internal var query = ""
    internal var staleIDs: Set<String> = []

    internal var body: some View {
        switch hit {
        case .record(let match):
            NavigationLink(value: InventoryRoute.record(match.record)) {
                InventoryRecordRowLabel(
                    record: match.record, query: query, showsCode: hit.matchedCode,
                    isStale: staleIDs.contains(match.id))
            }
            .buttonStyle(.plain)
        case .place(let place):
            NavigationLink(value: InventoryRoute.place(place.id)) {
                InventoryPlaceRowLabel(
                    place: place, tree: InventorySearchFixtures.places, query: query)
            }
            .buttonStyle(.plain)
        }
    }
}
