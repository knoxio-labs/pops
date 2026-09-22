import DesignSystem
import SwiftUI

/// A place's page: its name over the path to it, what it amounts to, its
/// verbs, then the places inside it, what sits directly in it, and what sits
/// in it only inside containers.
internal struct InventoryLocationPage: View {
    @State private var model: InventoryLocationPageModel
    @State private var generation = 0
    @State private var newName = ""

    internal init(model: InventoryLocationPageModel) {
        _model = State(initialValue: model)
    }

    internal var body: some View {
        Group {
            switch model.tree.phase {
            case .loading:
                InventoryLocationPageSkeleton()
            case .unavailable:
                InventoryUnavailableView { generation += 1 }
            case .loaded(let tree):
                if let place = tree.node(model.id) {
                    page(tree, place)
                        .onChange(of: place, initial: true) { _, latest in model.note(latest) }
                } else {
                    ContentUnavailableView(
                        "Place not found", systemImage: InventorySymbol.location.system)
                }
            }
        }
        .navigationTitle(placeName)
        .inventoryTitleDisplay(large: false)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Label {
                    Text(placeName)
                        .foregroundStyle(Color.popsForeground)
                } icon: {
                    InventorySymbol.location.image
                        .foregroundStyle(Color.popsInventory)
                        .accessibilityHidden(true)
                }
                .labelStyle(.titleAndIcon)
                .font(.popsHeadline)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("inventory-place-title")
            }
        }
        .task(id: generation) { await model.observe() }
        .inventoryRunnerChrome(model.runner)
    }

    private var placeName: String {
        guard case .loaded(let tree) = model.tree.phase else { return "Place" }
        return tree.node(model.id)?.name ?? "Place not found"
    }

    private func page(_ tree: InventoryLocationTree, _ place: InventoryLocationNode) -> some View {
        @Bindable var model = model
        return ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                InventoryLocationHeader(tree: tree, place: place)
                actions(place)
                noticeLine
                InventoryLocationSections(tree: tree, place: place, model: model)
            }
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.xxl)
            .popsMotion(value: model.shownNotice)
        }
        .popsCollapsingTitle(place.name)
        .background(Color.popsBackground)
        .tint(.popsInventory)
        .pageChrome(tree, place, model: model, newName: $newName)
    }

    @ViewBuilder private var noticeLine: some View {
        switch model.shownNotice {
        case .queuedMove(let destination):
            InventoryLocationNoticeLine(
                symbol: InventorySymbol.queued.system, tint: .popsMutedForeground,
                text: "Moving to \(destination) when online")
        case .conflictingMove(_, let mine, let theirs, let device):
            InventoryLocationConflict(mine: mine, theirs: theirs, device: device) { keepingMine in
                Task { await model.resolveMove(keepingMine: keepingMine) }
            }
        case nil:
            EmptyView()
        }
    }

    private func actions(_ place: InventoryLocationNode) -> some View {
        InventoryGlassGroup(spacing: PopsSpacing.lg) {
            HStack(spacing: PopsSpacing.lg) {
                actionButton("New place inside", symbol: .addNew) { model.creating = true }
                actionButton("Store here", symbol: .storeHere) { model.storing = true }
                actionButton("Move", symbol: .move) { model.moveThisPlace(place) }
                moreMenu(place)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, PopsSpacing.xs)
    }

    private func actionButton(
        _ title: String, symbol: InventorySymbol, action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            InventoryLocationActionFace(symbol: symbol)
        }
        .inventoryGlassButton()
        .accessibilityLabel(title)
    }

    private func moreMenu(_ place: InventoryLocationNode) -> some View {
        Menu {
            Button {
                newName = place.name
                model.renaming = true
            } label: {
                Label("Rename", systemImage: InventorySymbol.rename.system)
            }
            Button {
                model.moveThisPlace(place)
            } label: {
                Label("Move", systemImage: InventorySymbol.move.system)
            }
            Divider()
            Button(role: .destructive) {
                model.deleting = true
            } label: {
                Label("Delete", systemImage: InventorySymbol.discard.system)
            }
        } label: {
            InventoryLocationActionFace(symbol: .manage)
        }
        .menuStyle(.button)
        .inventoryGlassButton()
        .accessibilityLabel("More")
    }
}

extension View {
    fileprivate func pageChrome(
        _ tree: InventoryLocationTree, _ place: InventoryLocationNode,
        model: InventoryLocationPageModel, newName: Binding<String>
    ) -> some View {
        modifier(
            InventoryLocationPageChrome(tree: tree, place: place, model: model, newName: newName))
    }
}

/// The sheets, the selection bar, the placement picker and the two dialogs
/// every state of the page can show, kept apart from the page's own layout
/// so `page(_:_:)` reads as what a place's page looks like rather than what
/// it can also pop up.
private struct InventoryLocationPageChrome: ViewModifier {
    let tree: InventoryLocationTree
    let place: InventoryLocationNode
    @Bindable var model: InventoryLocationPageModel
    @Binding var newName: String

    func body(content: Content) -> some View {
        content
            .sheet(isPresented: $model.creating) {
                InventoryLocationCreateSheet(tree: tree, runner: model.runner, parentID: place.id)
            }
            .sheet(isPresented: $model.storing) {
                InventoryStoreHereSheet(
                    target: .location(id: place.id, name: place.name), runner: model.runner)
            }
            .inventorySelectionBar(
                $model.selection,
                all: InventoryLocationDirectRow.rows(of: place).map(\.id),
                actions: [
                    InventorySelectionAction(title: "Pick up", symbol: .inHand) { ids in
                        Task { await model.pickUp(ids, subject: model.title(ids, in: place)) }
                    },
                    InventorySelectionAction(title: "Move", symbol: .move) { ids in
                        model.move(ids, title: model.title(ids, in: place))
                    },
                ]
            )
            .inventoryPlacementPicker($model.moving, runner: model.runner)
            .alert("Rename", isPresented: $model.renaming) {
                TextField("Name", text: $newName)
                Button("Save") { Task { await model.rename(newName) } }
                Button("Cancel", role: .cancel) {}
            }
            .confirmationDialog(
                "Delete \(place.name)?", isPresented: $model.deleting, titleVisibility: .visible
            ) {
                Button("Delete", role: .destructive) { Task { await model.delete(place) } }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text(tree.deletion(of: place.id)?.confirmation ?? "")
            }
    }
}

/// A place's page before its record arrives.
internal struct InventoryLocationPageSkeleton: View {
    @ScaledMetric(relativeTo: .largeTitle) private var titleLine = PopsSize.touchTarget
    @ScaledMetric(relativeTo: .body) private var line = PopsSpacing.lg
    @ScaledMetric(relativeTo: .body) private var control = PopsSize.touchTarget

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                    bar(width: 0.6, height: titleLine)
                    bar(width: 0.45, height: line)
                    bar(width: 0.3, height: line)
                }
                HStack(spacing: PopsSpacing.lg) {
                    ForEach(0..<4, id: \.self) { _ in
                        Circle().fill(Color.popsSurface)
                            .frame(width: control, height: control)
                    }
                }
                .frame(maxWidth: .infinity)
            }
            .popsShimmer()
            .padding(.horizontal, PopsSpacing.lg)
            PopsListSkeleton(rows: 5)
                .padding(.horizontal, PopsSpacing.lg)
                .padding(.top, PopsSpacing.lg)
        }
        .scrollDisabled(true)
        .background(Color.popsBackground)
        .navigationTitle("")
        .popsTitleDisplay(large: false)
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
