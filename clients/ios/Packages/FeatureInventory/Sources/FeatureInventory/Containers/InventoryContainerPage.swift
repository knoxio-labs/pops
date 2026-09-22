import AppCore
import DesignSystem
import SwiftUI

/// A container's page: the item page with the container's verbs in its
/// action row and its contents as one more section.
///
/// Everything the item page has, a container has: photographs, facts,
/// fields, provenance, documents, history, the sync banner, Edit, the More
/// menu and Undo. Unpacking is this page's ordinary actions: rows leave by
/// swipe, or several at once once their marks are tapped, and each action
/// leaves an Undo capsule rather than asking first.
internal struct InventoryContainerPage: View {
    @State private var detail: InventoryItemDetailViewModel
    @State private var model: InventoryContainerPageModel
    @State private var generation = 0

    internal init(id: InventoryItem.ID, store: any InventoryStore) {
        let detail = InventoryItemDetailViewModel(itemId: id, store: store)
        _detail = State(initialValue: detail)
        _model = State(initialValue: InventoryContainerPageModel(id: id, runner: detail.runner))
    }

    internal var body: some View {
        Group {
            switch InventoryContainerPagePhase(detail: detail.phase, container: model.content.phase)
            {
            case .loading:
                InventoryContainerPageSkeleton()
            case .unavailable:
                InventoryUnavailableView { generation += 1 }
            case .missing:
                ContentUnavailableView(
                    "Container not found", systemImage: InventorySymbol.openContainer.system)
            case .loaded(let item, let profile):
                page(item, profile)
                    .onChange(of: profile, initial: true) { _, latest in model.note(latest) }
            }
        }
        .task(id: generation) {
            async let container: Void = model.observe()
            async let item: Void = detail.observe()
            _ = await (container, item)
        }
        .inventoryDetailFailureAlert(detail)
    }

    private func page(_ item: InventoryItemDetail, _ profile: InventoryContainerProfile)
        -> some View
    {
        @Bindable var model = model
        return InventoryItemDetailView(
            detail: item.onContainerPage, model: detail,
            actions: InventoryContainerVerb.row(for: profile.item).map(\.action),
            onAction: { action in
                guard let verb = InventoryContainerVerb(action: action) else { return }
                Task { await model.perform(verb, on: profile) }
            },
            capability: { InventoryContainerContentsSection(profile: profile, model: model) }
        )
        .inventorySelectionBar(
            $model.selection, all: profile.contents.entries.map(\.id),
            actions: [
                InventorySelectionAction(title: "Pick up", symbol: .inHand) { ids in
                    Task { await model.pickUp(ids, in: profile) }
                },
                InventorySelectionAction(title: "Move", symbol: .move) { ids in
                    model.move(ids, in: profile)
                },
                InventorySelectionAction(title: "Take out", symbol: .takeOut) { ids in
                    Task { await model.takeOut(ids, in: profile) }
                },
            ]
        )
        .sheet(isPresented: $model.storing) {
            InventoryStoreHereSheet(
                target: .container(id: profile.id, name: profile.name), runner: model.runner)
        }
        .inventoryPlacementPicker($model.moving, runner: model.runner) { model.placed($0) }
    }
}

/// Where the container page is, from its two answers: the item page's and
/// the contents'. It shows once both have answered, and says the container
/// is gone as soon as either says so.
internal enum InventoryContainerPagePhase: Equatable {
    case loading
    case unavailable
    /// The record is absent, deleted, or not a container.
    case missing
    case loaded(InventoryItemDetail, InventoryContainerProfile)

    internal init(
        detail: InventoryItemDetailViewModel.Phase,
        container: InventoryLoadPhase<InventoryContainerProfile?>
    ) {
        switch (detail, container) {
        case (.unavailable, _), (_, .unavailable):
            self = .unavailable
        case (.missing, _), (_, .loaded(nil)):
            self = .missing
        case (.loaded(let item), .loaded(.some(let profile))):
            self = .loaded(item, profile)
        default:
            self = .loading
        }
    }
}

extension InventoryItemDetail {
    /// The record as its own container page draws it. The page's contents
    /// section replaces the summary, which would only link back to the page
    /// it sits on.
    internal var onContainerPage: InventoryItemDetail {
        InventoryItemDetail(
            record: record, photos: photos, externalIdentifiers: externalIdentifiers, note: note,
            highlightedFields: highlightedFields, otherFields: otherFields,
            containerSummary: nil, provenance: provenance, documents: documents,
            activity: activity, conflict: conflict, lastSynced: lastSynced,
            lifecycleChange: lifecycleChange)
    }
}

/// The container page before its record arrives: the item page's blocks,
/// then skeleton rows where the contents go.
internal struct InventoryContainerPageSkeleton: View {
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
        .popsTitleDisplay(large: false)
        .accessibilityLabel("Loading")
    }

    private var blocks: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            Color.popsSurface
                .frame(height: heroHeight)
                .frame(maxWidth: .infinity)
            VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                bar(width: 0.7, height: line)
                bar(width: 0.4, height: line)
                bar(width: 0.55, height: line)
            }
            .padding(.horizontal, PopsSpacing.lg)
            HStack(spacing: PopsSpacing.lg) {
                ForEach(0..<4, id: \.self) { _ in
                    Circle().fill(Color.popsSurface)
                        .frame(width: control, height: control)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, PopsSpacing.sm)
            VStack(spacing: PopsSpacing.sm) {
                ForEach(0..<4, id: \.self) { _ in bar(width: 1, height: control) }
            }
            .padding(.horizontal, PopsSpacing.lg)
        }
    }

    private func bar(width: CGFloat, height: CGFloat) -> some View {
        GeometryReader { proxy in
            RoundedRectangle(cornerRadius: PopsRadius.control, style: .continuous)
                .fill(Color.popsSurface)
                .frame(width: proxy.size.width * width)
        }
        .frame(height: height)
    }
}
