import DesignSystem
import SwiftUI

/// The item detail page: the photographs, who it is, where it is, the fields
/// its type highlights, the verbs, and then whatever else is recorded.
///
/// One scroll view for the whole page, with the photograph running under the
/// navigation bar. The top of the page answers "is this the thing in my hand,
/// and where does it live" before any scrolling; everything under the verbs is
/// compact grouped rows that follow it up the screen.
///
/// A capability's own section arrives through `capability`, and its verbs
/// through `actions` and `onAction`; without them the page is exactly the
/// plain item page.
internal struct InventoryItemDetailView<Capability: View>: View {
    internal let detail: InventoryItemDetail
    private let actions: [InventoryAction]?
    private let onAction: (InventoryAction) -> Void
    private let capability: Capability
    private let lingers: Bool
    @State private var editing = false
    @State private var record: InventoryLifecycleRecord
    @State private var offer: InventoryUndoOffer?
    @State private var destroying: Bool
    @State private var quantitySheet: InventoryLifecycleSheet?

    internal init(
        detail: InventoryItemDetail,
        actions: [InventoryAction]? = nil,
        onAction: @escaping (InventoryAction) -> Void = { _ in },
        stage: InventoryItemDetailStage = InventoryItemDetailStage(),
        @ViewBuilder capability: () -> Capability
    ) {
        self.detail = detail
        self.actions = actions
        self.onAction = onAction
        self.capability = capability()
        var record = InventoryLifecycleRecord(item: detail.item, change: detail.lifecycleChange)
        let offer = stage.performing.flatMap { record.perform($0) }
        lingers = offer != nil
        _record = State(initialValue: record)
        _offer = State(initialValue: offer)
        _destroying = State(initialValue: stage.isConfirmingDestroy)
        _quantitySheet = State(initialValue: stage.sheet)
    }

    private var shown: InventoryItemDetail {
        var shown = detail
        shown.item = record.item
        shown.lifecycleChange = record.change
        return shown
    }

    internal var body: some View {
        let shown = shown
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.md) {
                InventoryItemDetailHeader(detail: shown)
                InventoryItemDetailFacts(detail: shown)
                InventoryItemDetailLifecycleNotice(detail: shown)
                InventoryItemDetailActionRow(
                    detail: shown, actions: actions, onAction: act)
                sections(shown)
            }
            .inventoryMotion(value: record)
            .padding(.bottom, PopsSpacing.xl)
        }
        .background(Color.popsBackground)
        .ignoresSafeArea(edges: .top)
        .tint(.popsInventory)
        .navigationTitle("")
        .playgroundTitleDisplay(large: false)
        .toolbar {
            InventoryItemDetailToolbar(
                detail: shown, editing: $editing, destroying: $destroying, perform: perform
            ) {
                record.destroy()
                offer = nil
            }
        }
        .navigationDestination(for: InventoryItemHistoryRoute.self) { route in
            InventoryItemHistoryView(name: route.name, entries: route.entries)
        }
        .sheet(isPresented: $editing) {
            NavigationStack {
                InventoryItemFormView(draft: .editing(shown.item), mode: .edit)
            }
        }
        .sheet(item: $quantitySheet) { sheet in
            switch sheet {
            case .split:
                InventorySplitSheet(item: record.item) { offer = record.split(off: $0) }
            case .changeQuantity:
                InventoryChangeQuantitySheet(item: record.item) {
                    offer = record.renumber(to: $0)
                }
            }
        }
        .inventoryUndoCapsule($offer, lingers: lingers) { record.undo($0) }
    }

    private func act(_ action: InventoryAction) {
        if action.id == "restore" {
            perform(.restore)
        } else {
            onAction(action)
        }
    }

    private func perform(_ command: InventoryLifecycleCommand) {
        switch command {
        case .destroy: destroying = true
        case .split: quantitySheet = .split
        case .changeQuantity: quantitySheet = .changeQuantity
        case .discard, .markLost, .retire, .restore:
            if let next = record.perform(command) { offer = next }
        }
    }

    private func sections(_ shown: InventoryItemDetail) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            InventoryItemDetailSyncBanner(detail: shown)
            InventoryItemDetailConnectionsSection(connections: shown.connections)
            InventoryItemDetailContentsSection(summary: shown.containerSummary)
            capability
            InventoryItemDetailFieldsSection(fields: shown.otherFields)
            InventoryItemDetailProvenanceSection(provenance: shown.provenance)
            InventoryItemDetailDocumentsSection(documents: shown.documents)
            InventoryItemDetailIdentifiersSection(identifiers: shown.externalIdentifiers)
            InventoryItemDetailNoteSection(description: shown.description)
            InventoryItemDetailHistorySection(name: shown.item.name, activity: shown.activity)
        }
    }
}

/// What a staged Item detail opens with beyond its record: a command just
/// performed, its undo capsule held up, the Destroy confirmation, or a
/// quantity sheet.
internal struct InventoryItemDetailStage {
    internal var performing: InventoryLifecycleCommand?
    internal var isConfirmingDestroy = false
    internal var sheet: InventoryLifecycleSheet?
}

/// An inactive item's one line under the facts: the lifecycle word, when,
/// and the reason a discard gave.
internal struct InventoryItemDetailLifecycleNotice: View {
    internal let detail: InventoryItemDetail

    @ViewBuilder internal var body: some View {
        if let change = detail.lifecycleChange, detail.item.lifecycle != .active {
            InventoryItemDetailNotice(
                symbol: change.lifecycle.symbol.system,
                tint: change.lifecycle == .destroyed ? .popsDestructive : .popsMutedForeground,
                text: change.notice
            )
            .padding(.horizontal, PopsSpacing.lg)
        }
    }
}

extension InventoryItemDetailView where Capability == EmptyView {
    internal init(
        detail: InventoryItemDetail, stage: InventoryItemDetailStage = InventoryItemDetailStage()
    ) {
        self.init(detail: detail, stage: stage) { EmptyView() }
    }
}

/// The page before its record has arrived: the same blocks, at the same sizes,
/// with nothing in them. Skeletons rather than a spinner, so the layout does
/// not jump when the answer lands (ADR-001).
internal struct InventoryItemDetailSkeleton: View {
    @ScaledMetric(relativeTo: .largeTitle) private var heroHeight = PopsSize.pageHeight * 1.5
    @ScaledMetric(relativeTo: .body) private var line = PopsSpacing.lg
    @ScaledMetric(relativeTo: .body) private var control = PopsSize.touchTarget

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            blocks
                .popsShimmer()
            Spacer(minLength: PopsSpacing.zero)
        }
        .background(Color.popsBackground)
        .ignoresSafeArea(edges: .top)
        .navigationTitle("")
        .playgroundTitleDisplay(large: false)
        .accessibilityLabel("Loading")
    }

    private var blocks: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            Color.popsSurface
                .frame(height: heroHeight)
                .frame(maxWidth: .infinity)
            VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                bar(widthFraction: 0.7)
                bar(widthFraction: 0.4)
                bar(widthFraction: 0.55)
            }
            .padding(.horizontal, PopsSpacing.lg)
            HStack(spacing: PopsSpacing.lg) {
                ForEach(0..<3, id: \.self) { _ in
                    Circle().fill(Color.popsSurface)
                        .frame(width: control, height: control)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.vertical, PopsSpacing.sm)
        }
    }

    private func bar(widthFraction: CGFloat) -> some View {
        GeometryReader { proxy in
            RoundedRectangle(cornerRadius: PopsRadius.control, style: .continuous)
                .fill(Color.popsSurface)
                .frame(width: proxy.size.width * widthFraction)
        }
        .frame(height: line)
    }
}
