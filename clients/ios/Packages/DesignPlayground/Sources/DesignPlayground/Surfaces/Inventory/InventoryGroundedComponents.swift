import DesignSystem
import SwiftUI

extension View {
    @ViewBuilder internal func inventoryGroundedListStyle() -> some View {
        #if os(iOS)
            listStyle(.insetGrouped)
                .listSectionSpacing(PopsSpacing.md)
        #else
            listStyle(.inset)
        #endif
    }

    internal func inventoryGroundedDataRow() -> some View {
        listRowInsets(
            EdgeInsets(
                top: PopsSpacing.xs,
                leading: PopsSpacing.md,
                bottom: PopsSpacing.xs,
                trailing: PopsSpacing.md
            ))
    }
}

internal struct InventoryGroundedSectionHeader: View {
    internal let title: String
    internal let status: String?
    internal let destination: InventoryRoute?

    internal init(
        title: String,
        status: String? = nil,
        destination: InventoryRoute? = nil
    ) {
        self.title = title
        self.status = status
        self.destination = destination
    }

    internal var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.sm) {
            Text(title)
                .font(.popsTitle)
                .foregroundStyle(Color.popsForeground)
            Spacer(minLength: PopsSpacing.sm)
            if let status, let destination {
                NavigationLink(value: destination) {
                    Text(status)
                        .font(.popsSubheadline.weight(.semibold))
                        .frame(minHeight: PopsSize.touchTarget)
                }
            } else if let status {
                Text(status)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
    }
}

internal struct InventoryGroundedRowLabel: View {
    internal let title: String
    internal let detail: String
    internal let symbol: String
    internal let value: String?
    internal let tone: Color
    @ScaledMetric(relativeTo: .body) private var markSize = PopsSize.touchTarget

    internal init(
        title: String,
        detail: String,
        symbol: String,
        value: String? = nil,
        tone: Color = .popsMutedForeground
    ) {
        self.title = title
        self.detail = detail
        self.symbol = symbol
        self.value = value
        self.tone = tone
    }

    internal var body: some View {
        HStack(spacing: PopsSpacing.md) {
            Image(systemName: symbol)
                .font(.popsHeadline)
                .foregroundStyle(tone)
                .frame(width: markSize, height: markSize)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(title)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                Text(detail)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            Spacer(minLength: PopsSpacing.sm)
            if let value {
                Text(value)
                    .font(.popsHeadline)
                    .monospacedDigit()
                    .foregroundStyle(Color.popsForeground)
            }
            Image(systemName: "chevron.forward")
                .font(.popsCaption.weight(.semibold))
                .foregroundStyle(Color.popsMutedForeground)
                .accessibilityHidden(true)
        }
        .padding(.vertical, PopsSpacing.xs)
        .contentShape(.rect)
    }
}

internal enum InventoryGroundedBrowseProminence: Equatable {
    case wide, compact
}

internal struct InventoryGroundedBrowseTile: View {
    internal let title: String
    internal let count: String
    internal let symbol: String
    internal let action: () -> Void
    internal let prominence: InventoryGroundedBrowseProminence
    @ScaledMetric(relativeTo: .body) private var markSize = PopsSize.touchTarget

    internal var body: some View {
        Button(action: action) {
            Group {
                if prominence == .wide {
                    horizontalContent
                } else {
                    ViewThatFits(in: .horizontal) {
                        horizontalContent
                        VStack(spacing: PopsSpacing.sm) {
                            symbolView
                            VStack(spacing: PopsSpacing.xs) {
                                titleView
                                compactCount
                            }
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(PopsSpacing.md)
            .background(Color.popsSurface, in: RoundedRectangle(cornerRadius: PopsRadius.card))
            .overlay(
                RoundedRectangle(cornerRadius: PopsRadius.card)
                    .stroke(Color.popsSeparator, lineWidth: PopsBorder.hairline)
            )
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }

    private var symbolView: some View {
        Image(systemName: symbol)
            .font(.popsHeadline)
            .foregroundStyle(Color.popsAccent)
            .frame(width: markSize, height: markSize)
            .background(Color.popsAccent.opacity(0.14), in: .circle)
    }

    private var titleView: some View {
        Text(title)
            .font(.popsHeadline)
            .foregroundStyle(Color.popsForeground)
    }

    private var compactTitle: some View {
        titleView
            .fixedSize(horizontal: true, vertical: false)
    }

    private var horizontalContent: some View {
        HStack(spacing: PopsSpacing.sm) {
            symbolView
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                compactTitle
                compactCount
            }
        }
    }

    private var compactCount: some View {
        Text(count)
            .font(.popsCaption.weight(.semibold))
            .monospacedDigit()
            .foregroundStyle(Color.popsMutedForeground)
    }

}

internal struct InventoryGroundedListPanel<Content: View>: View {
    private let content: Content

    internal init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    internal var body: some View {
        content
            .padding(.horizontal, PopsSpacing.md)
            .padding(.vertical, PopsSpacing.sm)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.popsSurface, in: RoundedRectangle(cornerRadius: PopsRadius.card))
            .overlay(
                RoundedRectangle(cornerRadius: PopsRadius.card)
                    .stroke(Color.popsSeparator, lineWidth: PopsBorder.hairline)
            )
    }
}

internal struct InventoryGroundedSyncStatus: View {
    internal let state: InventorySyncState

    @ViewBuilder internal var body: some View {
        if state != .current {
            InventorySyncCapsule(state: state)
        }
    }
}

internal struct InventoryMoveDestinationSheet: View {
    internal let item: InventoryItem
    internal let containers: [InventoryContainer]
    internal let onMove: () -> Void
    @Environment(\.dismiss) private var dismiss

    internal var body: some View {
        NavigationStack {
            List {
                if !containers.isEmpty {
                    Section("Open containers") {
                        ForEach(containers) { container in
                            Button {
                                onMove()
                            } label: {
                                Label(container.name, systemImage: "shippingbox")
                            }
                        }
                    }
                }

                Section("Locations") {
                    Button {
                        onMove()
                    } label: {
                        Label("Choose a location", systemImage: "house")
                    }
                }
            }
            .navigationTitle("Move \(item.name)")
            .playgroundTitleDisplay(large: false)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
        }
    }
}
