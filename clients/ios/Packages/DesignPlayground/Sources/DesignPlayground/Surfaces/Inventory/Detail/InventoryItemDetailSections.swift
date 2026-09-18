import DesignSystem
import SwiftUI

/// A titled group of rows in the inset-grouped look, with a hairline between
/// rows.
///
/// Drawn rather than a `List` section because the page is one scroll view: a
/// `List` cannot sit inside one, and an inset-grouped `List` holding the whole
/// page would inset the hero photograph that has to run edge to edge.
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
                .inventorySelectionHighlights(
                    rowOutset: PopsSpacing.xs,
                    in: RoundedRectangle(cornerRadius: PopsRadius.card, style: .continuous)
                )
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
                ForEach(fields) { InventoryPropertyLine(key: $0.key, value: $0.value) }
            }
        }
    }
}

/// The local-state banner: a change the server rejected, or a copy that may be
/// stale. Queued is not here on purpose, the sync mark beside the subtitle
/// already says it quietly, and ADR-001 asks for quiet rather than a panel.
internal struct InventoryItemDetailSyncBanner: View {
    internal let detail: InventoryItemDetail

    @ViewBuilder internal var body: some View {
        if let conflict = detail.conflict {
            InventoryItemDetailGroup {
                VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                    InventoryItemDetailNotice(
                        symbol: InventorySymbol.attention.system, tint: .popsDestructive,
                        text: conflict.problem)
                    Button(conflict.resolution) {}
                        .font(.popsSubheadline.weight(.semibold))
                        .playgroundGlassButton()
                        .tint(.popsInventory)
                }
                .padding(.vertical, PopsSpacing.xs)
            }
        } else if detail.item.sync == .stale {
            InventoryItemDetailGroup {
                InventoryItemDetailNotice(
                    tone: .warning,
                    text: detail.lastSynced.map { "Last synced \($0)" } ?? "May be out of date"
                ) {
                    InventoryItemDetailRetryButton()
                }
            }
        }
    }
}

/// What a cable is plugged into, one line per end.
internal struct InventoryItemDetailConnectionsSection: View {
    internal let connections: [InventoryConnection]

    @ViewBuilder internal var body: some View {
        if !connections.isEmpty {
            InventoryItemDetailGroup("Connections") {
                ForEach(connections) { connection in
                    InventoryPropertyLine(
                        key: connection.port,
                        value: connection.attachedTo ?? "Not connected",
                        tone: connection.isConnected ? .popsForeground : .popsMutedForeground)
                }
            }
        }
    }
}

/// What a container holds, and the way into it.
///
/// A row rather than the contents themselves: a container's page is this page
/// with its contents appended, and that list is the container surface's own
/// (POPS-3982). This is where it attaches.
internal struct InventoryItemDetailContentsSection: View {
    internal let summary: InventoryContainerSummary?

    @ViewBuilder internal var body: some View {
        if let summary {
            InventoryItemDetailGroup("Contents") {
                Button {
                } label: {
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

/// Identifiers someone else assigned, ADR-001's distinction from POPS's own
/// inventory code, which the header already shows.
internal struct InventoryItemDetailIdentifiersSection: View {
    internal let identifiers: [InventoryDetailExternalIdentifier]

    @ViewBuilder internal var body: some View {
        if !identifiers.isEmpty {
            InventoryItemDetailGroup("External identifiers") {
                ForEach(identifiers) { InventoryPropertyLine(key: $0.kind, value: $0.value) }
            }
        }
    }
}

/// Anything the type did not ask for (ADR-001).
internal struct InventoryItemDetailNoteSection: View {
    internal let description: String?

    @ViewBuilder internal var body: some View {
        if let description {
            InventoryItemDetailGroup("Note") {
                Text(description)
                    .font(.popsBody)
                    .foregroundStyle(Color.popsForeground)
            }
        }
    }
}
