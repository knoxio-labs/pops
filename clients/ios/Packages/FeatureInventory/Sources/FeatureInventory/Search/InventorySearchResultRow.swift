import AppCore
import DesignSystem
import SwiftUI

/// A name with every occurrence of the query drawn in amber.
internal struct InventoryHighlightedName: View {
    internal let name: String
    internal let query: String
    internal var isMuted = false
    internal var isStruck = false

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
                text[lower..<upper].foregroundColor = Color.popsInventory
            }
        }
        return text
    }
}

/// An item or container in the dashboard's row idiom: mark, name over type
/// and placement, then what the row has to say on its trailing edge.
internal struct InventoryRecordRowLabel: View {
    internal let record: InventoryRecord
    internal var query = ""
    internal var showsCode = false
    internal var showsChevron = true
    internal let loadPhoto: @MainActor (String) async -> Data?

    internal var body: some View {
        HStack(spacing: PopsSpacing.md) {
            InventoryRecordMark(
                photo: record.photo, symbol: .record(access: record.access),
                showsKindBadge: record.isContainer, load: loadPhoto)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                InventoryHighlightedName(
                    name: record.name, query: query, isMuted: !record.isActive,
                    isStruck: record.lifecycle == .destroyed)
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
            InventoryQuantityBadge(quantity: record.quantity)
            if showsChevron { InventoryRowChevron() }
        }
        .padding(.vertical, PopsSpacing.xs)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var badges: some View {
        let code = showsCode ? record.code : nil
        let lifecycle = record.isActive ? nil : record.lifecycle.badgeLabel
        if lifecycle != nil || code != nil {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: PopsSpacing.xs) { chips(lifecycle: lifecycle, code: code) }
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    chips(lifecycle: lifecycle, code: code)
                }
            }
        }
    }

    @ViewBuilder private func chips(lifecycle: String?, code: String?) -> some View {
        if let lifecycle { InventoryLifecycleChip(label: lifecycle) }
        if let code { InventoryRecordCodeBadge(code: code) }
    }

    private var syncMark: InventoryRecordSyncMark? {
        switch record.sync {
        case .stale:
            InventoryRecordSyncMark(symbol: .stale, tone: .popsWarning, label: record.sync.label)
        case .needsAttention:
            InventoryRecordSyncMark(
                symbol: .attention, tone: .popsDestructive, label: record.sync.label)
        case .queued, .synchronizing:
            InventoryRecordSyncMark(
                symbol: .queued, tone: .popsMutedForeground, label: record.sync.label)
        case .saved, .synchronized:
            nil
        }
    }
}

private struct InventoryRecordSyncMark {
    let symbol: InventorySymbol
    let tone: Color
    let label: String
}

/// A lifecycle that is not active, drawn as a quiet chip. The badge is the
/// lifecycle word; why it was discarded lives on its history.
private struct InventoryLifecycleChip: View {
    let label: String

    var body: some View {
        Text(label)
            .font(.popsCaption.weight(.semibold))
            .foregroundStyle(Color.popsMutedForeground)
            .padding(.horizontal, PopsSpacing.sm)
            .padding(.vertical, PopsSpacing.xs)
            .background(Color.popsMutedForeground.opacity(0.14), in: .capsule)
    }
}

/// An item's inventory code: monospaced because it is read character by
/// character against a sticker, and never truncated, because a code with
/// characters missing matches nothing.
private struct InventoryRecordCodeBadge: View {
    let code: String

    var body: some View {
        HStack(spacing: PopsSpacing.xs) {
            InventorySymbol.code.image
                .font(.popsCaption)
            Text(code)
                .font(.popsMonospacedCaption)
                .lineLimit(1)
                .fixedSize()
        }
        .foregroundStyle(Color.popsMutedForeground)
        .padding(.horizontal, PopsSpacing.sm)
        .padding(.vertical, PopsSpacing.xs)
        .background(Color.popsMutedForeground.opacity(0.12), in: .capsule)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Inventory code \(code)")
    }
}

extension InventoryLifecycle {
    /// The badge's word. A value this build has never heard of is shown as
    /// the server sent it rather than guessed at.
    fileprivate var badgeLabel: String {
        switch self {
        case .active: "Active"
        case .retired: "Retired"
        case .discarded: "Discarded"
        case .lost: "Lost"
        case .destroyed: "Destroyed"
        case .unrecognised(let wire): wire.capitalized
        }
    }
}

/// A place, in the same idiom: the place glyph, its name, the path above it.
internal struct InventoryPlaceRowLabel: View {
    internal let place: InventorySearchPlace
    internal var query = ""
    @ScaledMetric(relativeTo: .body) private var markSize = PopsSize.touchTarget

    internal var body: some View {
        HStack(spacing: PopsSpacing.md) {
            InventorySymbol.location.image
                .font(.popsHeadline)
                .foregroundStyle(Color.popsMutedForeground)
                .frame(width: markSize, height: markSize)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                InventoryHighlightedName(name: place.name, query: query)
                Text(detail)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: PopsSpacing.sm)
            InventoryRowChevron()
        }
        .padding(.vertical, PopsSpacing.xs)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
    }

    private var detail: String {
        place.parents.isEmpty
            ? "Location" : "Location · \(place.parents.joined(separator: " › "))"
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
    internal let loadPhoto: @MainActor (String) async -> Data?

    internal var body: some View {
        switch hit {
        case .record(let record):
            NavigationLink(
                value: InventoryRoute.record(id: record.id, isContainer: record.isContainer)
            ) {
                InventoryRecordRowLabel(
                    record: record, query: query,
                    showsCode: InventorySearchRanking.matchedCode(query, in: record),
                    loadPhoto: loadPhoto)
            }
            .buttonStyle(.plain)
        case .place(let place):
            NavigationLink(value: InventoryRoute.place(place.id)) {
                InventoryPlaceRowLabel(place: place, query: query)
            }
            .buttonStyle(.plain)
        }
    }
}
