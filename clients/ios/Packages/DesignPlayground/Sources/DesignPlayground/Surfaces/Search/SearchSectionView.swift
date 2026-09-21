import DesignSystem
import SwiftUI

/// What a section's controls do, handed down from the screen.
internal struct SearchSectionActions {
    internal let showAll: (SearchPillar) -> Void
    internal let retry: (SearchPillar) -> Void
    internal let download: () -> Void
}

/// One pillar's answer: a header, then its rows, skeleton rows while it is
/// asking for the first time, or one status row saying why it cannot answer.
///
/// In All the header names the pillar with its tab glyph, and when there is
/// more than fits it ends in the total and a chevron that scopes to the
/// pillar. Scoped, the chip above already names the pillar, so the header is
/// Inventory's own: Results, and the count.
internal struct SearchSectionView: View {
    internal let section: SearchSection
    internal let isScoped: Bool
    internal let staleIDs: Set<String>
    @Binding internal var selection: InventorySelection
    internal let actions: SearchSectionActions

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            header
            content
        }
        .environment(\.inventoryAccent, section.pillar.tint)
        .tint(section.pillar.tint)
        .transition(.opacity)
    }

    @ViewBuilder private var header: some View {
        if isScoped {
            if case .results(_, let total, _, let isRefining) = section.content {
                InventoryLocationSectionHeader(
                    title: "Results", trailing: isRefining ? nil : "\(total)")
            }
        } else {
            SearchPillarHeader(pillar: section.pillar, content: section.content) {
                actions.showAll(section.pillar)
            }
        }
    }

    @ViewBuilder private var content: some View {
        switch section.content {
        case .results(let rows, _, let query, let isRefining):
            InventoryLocationPanel(rows: rows) { row in
                rowView(row, query: query)
            }
            .opacity(isRefining ? 0.45 : 1)
            .inventoryMotion(value: isRefining)
        case .loading:
            InventoryLocationListSkeleton(rows: isScoped ? 6 : UniversalSearchModel.allCap)
        case .failed:
            SearchStatusRow(
                symbol: "exclamationmark.triangle.fill", tone: .popsWarning,
                text: "\(section.pillar.title) didn't answer",
                action: SearchStatusAction(symbol: "arrow.clockwise", label: "Retry") {
                    actions.retry(section.pillar)
                })
        case .offline:
            SearchStatusRow(
                symbol: "wifi.slash", tone: .popsMutedForeground,
                text: "Offline. Searches when you're back.")
        case .notOnPhone:
            SearchStatusRow(
                symbol: section.pillar.symbol, tone: .popsMutedForeground,
                text: "Not on this phone yet",
                action: SearchStatusAction(
                    symbol: InventorySymbol.update.system, label: "Download",
                    perform: actions.download))
        }
    }

    @ViewBuilder private func rowView(_ row: SearchRow, query: String) -> some View {
        switch row {
        case .inventory(let hit):
            InventorySearchHitRow(hit: hit, query: query, staleIDs: staleIDs)
                .inventorySelectable(row.inventoryRecordID, in: $selection)
        case .purchases(let hit):
            PurchaseSearchRow(hit: hit, query: query)
        }
    }
}

/// A pillar's header in All: glyph and name, then the count, which becomes
/// a button to the whole list when the section is capped.
private struct SearchPillarHeader: View {
    let pillar: SearchPillar
    let content: SearchSectionContent
    let showAll: () -> Void

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.sm) {
            Label(pillar.title, systemImage: pillar.symbol)
                .font(.popsSectionLabel)
                .foregroundStyle(Color.popsMutedForeground)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: PopsSpacing.sm)
            trailing
        }
        .padding(.horizontal, PopsSpacing.md)
    }

    @ViewBuilder private var trailing: some View {
        if case .results(let rows, let total, _, let isRefining) = content {
            if isRefining {
                SearchCountShimmer()
            } else if total > rows.count {
                Button(action: showAll) {
                    HStack(spacing: PopsSpacing.xs) {
                        Text("\(total)")
                            .monospacedDigit()
                        Image(systemName: "chevron.forward")
                    }
                    .font(.popsCaption.weight(.semibold))
                    .foregroundStyle(.tint)
                    .frame(minHeight: PopsSize.touchTarget / 2)
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("All \(total) in \(pillar.title)")
            } else {
                Text("\(total)")
                    .font(.popsCaption)
                    .monospacedDigit()
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
    }
}

internal struct SearchStatusAction {
    internal let symbol: String
    internal let label: String
    internal let perform: () -> Void
}

/// One row where a pillar's results would be: its glyph and a few words on
/// why there are none, and the one thing to do about it as a glass circle.
internal struct SearchStatusRow: View {
    internal let symbol: String
    internal let tone: Color
    internal let text: String
    internal var action: SearchStatusAction?
    @ScaledMetric(relativeTo: .body) private var size = PopsSize.touchTarget

    internal var body: some View {
        InventoryGroundedListPanel {
            HStack(spacing: PopsSpacing.md) {
                Image(systemName: symbol)
                    .font(.popsHeadline)
                    .foregroundStyle(tone)
                    .frame(width: size, height: size)
                    .accessibilityHidden(true)
                Text(text)
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsForeground)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: PopsSpacing.sm)
                if let action {
                    Button(action: action.perform) {
                        Image(systemName: action.symbol)
                            .font(.popsBody.weight(.semibold))
                            .foregroundStyle(.tint)
                            .frame(width: size, height: size)
                            .playgroundGlass(in: Circle())
                            .contentShape(Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(action.label)
                }
            }
            .padding(.vertical, PopsSpacing.xs)
        }
        .inventoryFadeIn()
    }
}
