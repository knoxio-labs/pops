import DesignSystem
import SwiftUI

/// The empty search: past queries as a compact list that swipes away, each
/// with its pillar's glyph when it was searched in one, and, while Inventory
/// is in scope, what was scanned lately as small photo tiles.
internal struct SearchRecents: View {
    @Binding internal var recents: [SearchRecent]
    internal let scope: SearchScope
    internal let scanned: [InventorySearchRecord]
    internal let onSelect: (SearchRecent) -> Void
    @State private var swiping: String?

    private var shown: [SearchRecent] {
        recents.filter { $0.shows(in: scope) }
    }

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            if !shown.isEmpty {
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    InventoryLocationSectionHeader(title: "Recent")
                    InventoryLocationPanel(rows: shown) { row($0) }
                }
                .transition(.opacity)
            }
            if !scanned.isEmpty {
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    InventoryLocationSectionHeader(title: "Recently scanned")
                    HStack(alignment: .top, spacing: PopsSpacing.sm) {
                        ForEach(scanned) { InventoryScannedTile(record: $0) }
                    }
                }
                .transition(.opacity)
            }
        }
        .inventoryMotion(value: shown)
    }

    private func row(_ recent: SearchRecent) -> some View {
        Button {
            onSelect(recent)
        } label: {
            HStack(spacing: PopsSpacing.md) {
                InventorySymbol.activity.image
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
                Text(recent.query)
                    .font(.popsBody)
                    .foregroundStyle(Color.popsForeground)
                Spacer(minLength: PopsSpacing.sm)
                if case .pillar(let pillar) = recent.scope {
                    Image(systemName: pillar.symbol)
                        .font(.popsSubheadline)
                        .foregroundStyle(Color.popsMutedForeground)
                        .accessibilityLabel("In \(pillar.title)")
                }
            }
            .padding(.vertical, PopsSpacing.sm)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .inventoryGroundedSwipeRow(isActive: swiping == recent.id)
        .inventoryGroundedSwipeActions(
            edge: .trailing,
            onPresentationChanged: { swiping = $0 ? recent.id : nil },
            actions: {
                Button(role: .destructive) {
                    recents.removeAll { $0.id == recent.id }
                } label: {
                    Label("Remove", systemImage: InventorySymbol.discard.system)
                }
            })
    }
}

/// One recently scanned thing: its photo, and its name under it.
internal struct InventoryScannedTile: View {
    internal let record: InventorySearchRecord

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: PopsRadius.card, style: .continuous)
    }

    internal var body: some View {
        NavigationLink(value: InventoryRoute.record(record)) {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Color.popsSurface
                    .aspectRatio(1, contentMode: .fit)
                    .overlay {
                        InventoryItemDetailPicture(
                            photo: record.photo.map {
                                InventoryPhoto(caption: "", isBroken: false, imageData: $0)
                            },
                            symbol: record.item.symbol.system)
                    }
                    .clipShape(shape)
                Text(record.item.name)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(record.item.name)
    }
}
