import AppCore
import DesignSystem
import SwiftUI

/// A container's page: who it is and where, the container's verbs in its
/// action row, and its contents as one more section.
///
/// The approved page is the item page with these parts added. That page
/// moves into this package separately (POPS-4062); until it lands, the
/// container draws its own name, path and state marks above the verbs, and
/// the contents section is written to drop into the item page as its
/// capability section unchanged.
internal struct InventoryContainerPage: View {
    @State private var model: InventoryContainerPageModel
    @State private var generation = 0

    internal init(model: InventoryContainerPageModel) {
        _model = State(initialValue: model)
    }

    internal var body: some View {
        Group {
            switch model.content.phase {
            case .loading:
                InventoryContainerPageSkeleton()
            case .unavailable:
                InventoryUnavailableView { generation += 1 }
            case .loaded(nil):
                ContentUnavailableView(
                    "Container not found", systemImage: InventorySymbol.openContainer.system)
            case .loaded(.some(let profile)):
                page(profile)
                    .onChange(of: profile, initial: true) { _, latest in model.note(latest) }
            }
        }
        .task(id: generation) { await model.observe() }
        .inventoryRunnerChrome(model.runner)
    }

    private func page(_ profile: InventoryContainerProfile) -> some View {
        @Bindable var model = model
        return ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.md) {
                InventoryContainerHeader(profile: profile)
                InventoryContainerActionRow(
                    verbs: InventoryContainerVerb.row(for: profile.item)
                ) { verb in
                    Task { await model.perform(verb, on: profile) }
                }
                InventoryContainerContentsSection(profile: profile, model: model)
            }
            .padding(.bottom, PopsSpacing.xl)
        }
        .background(Color.popsBackground)
        .tint(.popsInventory)
        .navigationTitle(profile.name)
        .inventoryTitleDisplay(large: false)
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

/// The name, what it is and its code, where it is, and its state marks.
internal struct InventoryContainerHeader: View {
    internal let profile: InventoryContainerProfile

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(profile.name)
                .font(.popsTitle)
                .foregroundStyle(
                    profile.isActive ? Color.popsForeground : Color.popsMutedForeground
                )
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityAddTraits(.isHeader)
            Text(subtitle)
                .font(.popsSubheadline)
                .foregroundStyle(Color.popsMutedForeground)
                .lineLimit(1)
            InventoryPlacementPath(
                crumbs: profile.crumbs, isInHand: profile.item.placement == .hand)
            let marks = InventoryStateMark.marks(for: profile.item)
            if !marks.isEmpty {
                HStack(spacing: PopsSpacing.xs) {
                    ForEach(marks) { InventoryStateBadge(mark: $0) }
                }
                .inventoryFadeIn()
            }
        }
        .padding(.horizontal, PopsSpacing.lg)
        .padding(.top, PopsSpacing.md)
    }

    private var subtitle: String {
        [profile.typeName ?? "No type yet", profile.item.code].compactMap(\.self)
            .joined(separator: " · ")
    }
}

/// The container page before its record arrives: the page's blocks, then
/// skeleton rows where the contents go.
internal struct InventoryContainerPageSkeleton: View {
    @ScaledMetric(relativeTo: .body) private var line = PopsSpacing.lg
    @ScaledMetric(relativeTo: .body) private var control = PopsSize.touchTarget

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
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
            Spacer(minLength: PopsSpacing.zero)
        }
        .popsShimmer()
        .padding(.top, PopsSpacing.md)
        .background(Color.popsBackground)
        .navigationTitle("")
        .inventoryTitleDisplay(large: false)
        .accessibilityLabel("Loading")
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
