import AppCore
import DesignSystem
import SwiftUI

/// A titled group of rows in the inset-grouped look, with a hairline between
/// rows. Drawn rather than a `List` section because the page is one scroll
/// view, and an inset-grouped `List` holding the whole page would inset the
/// hero photograph that has to run edge to edge.
internal struct InventoryItemDetailGroup<Content: View>: View {
    private let title: String?
    private let content: Content

    internal init(_ title: String? = nil, @ViewBuilder content: () -> Content) {
        self.title = title
        self.content = content()
    }

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            if let title {
                Text(title)
                    .font(.popsSectionLabel)
                    .foregroundStyle(Color.popsMutedForeground)
                    .padding(.horizontal, PopsSpacing.lg)
                    .accessibilityAddTraits(.isHeader)
            }
            Group(subviews: content) { rows in
                VStack(alignment: .leading, spacing: PopsSpacing.zero) {
                    ForEach(rows) { row in
                        if row.id != rows.first?.id {
                            Divider().padding(.leading, PopsSpacing.lg)
                        }
                        row
                            .frame(
                                maxWidth: .infinity, minHeight: PopsSize.touchTarget,
                                alignment: .leading
                            )
                            .padding(.horizontal, PopsSpacing.lg)
                            .padding(.vertical, PopsSpacing.xs)
                    }
                }
                .background(
                    Color.popsSurface,
                    in: RoundedRectangle(cornerRadius: PopsRadius.card, style: .continuous))
            }
        }
        .padding(.horizontal, PopsSpacing.lg)
    }
}

internal struct InventoryItemDetailDisclosure: View {
    internal var body: some View {
        Image(systemName: "chevron.forward")
            .font(.popsCaption.weight(.semibold))
            .foregroundStyle(Color.popsMutedForeground)
            .accessibilityHidden(true)
    }
}

/// The recorded fields the item's type does not highlight.
internal struct InventoryItemDetailFieldsSection: View {
    internal let fields: [InventoryDetailField]

    @ViewBuilder internal var body: some View {
        if !fields.isEmpty {
            InventoryItemDetailGroup("Details") {
                ForEach(fields) { InventoryPropertyLine(key: $0.label, value: $0.value) }
            }
        }
    }
}

/// The local-state banner: a change the server did not take, or a copy that
/// may be stale. Queued is not here on purpose: the sync mark beside the
/// subtitle already says it quietly.
internal struct InventoryItemDetailSyncBanner: View {
    internal let detail: InventoryItemDetail
    internal let resolve: () -> Void
    internal let retry: () -> Void

    @ViewBuilder internal var body: some View {
        if let conflict = detail.conflict {
            InventoryItemDetailGroup {
                VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                    InventoryItemDetailNotice(
                        symbol: InventorySymbol.attention.system, tint: .popsDestructive,
                        text: conflict.problem)
                    if let resolution = conflict.resolution {
                        Button(resolution, action: resolve)
                            .font(.popsSubheadline.weight(.semibold))
                            .inventoryGlassButton()
                            .tint(.popsInventory)
                    }
                }
                .padding(.vertical, PopsSpacing.xs)
            }
        } else if detail.record.sync == .stale {
            InventoryItemDetailGroup {
                InventoryItemDetailNotice(
                    tone: .warning,
                    text: detail.lastSynced.map { "Last synced \($0)" } ?? "May be out of date"
                ) {
                    InventoryItemDetailRetryButton(retry: retry)
                }
            }
        }
    }
}

/// What a container holds, and the way into it: a row rather than the
/// contents themselves, which are the container's own page.
internal struct InventoryItemDetailContentsSection: View {
    internal let itemId: InventoryItem.ID
    internal let summary: InventoryContainerSummary?

    @ViewBuilder internal var body: some View {
        if let summary {
            InventoryItemDetailGroup("Contents") {
                NavigationLink(value: InventoryRoute.container(itemId)) {
                    HStack {
                        Label {
                            Text(contents(summary))
                        } icon: {
                            InventorySymbol.openContainer.image
                        }
                        .font(.popsBody)
                        .foregroundStyle(Color.popsForeground)
                        Spacer(minLength: PopsSpacing.sm)
                        InventoryItemDetailDisclosure()
                    }
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func contents(_ summary: InventoryContainerSummary) -> String {
        summary.containerCount == 0
            ? "\(summary.itemCount) items"
            : "\(summary.itemCount) items · \(summary.containerCount) containers"
    }
}

/// Identifiers someone else assigned, as distinct from POPS's own inventory
/// code, which the header already shows.
internal struct InventoryItemDetailIdentifiersSection: View {
    internal let identifiers: [InventoryExternalIdentifier]

    @ViewBuilder internal var body: some View {
        if !identifiers.isEmpty {
            InventoryItemDetailGroup("External identifiers") {
                ForEach(identifiers) { InventoryPropertyLine(key: $0.kind, value: $0.value) }
            }
        }
    }
}

/// Anything the type did not ask for.
internal struct InventoryItemDetailNoteSection: View {
    internal let note: String?

    @ViewBuilder internal var body: some View {
        if let note {
            InventoryItemDetailGroup("Note") {
                Text(note)
                    .font(.popsBody)
                    .foregroundStyle(Color.popsForeground)
            }
        }
    }
}
