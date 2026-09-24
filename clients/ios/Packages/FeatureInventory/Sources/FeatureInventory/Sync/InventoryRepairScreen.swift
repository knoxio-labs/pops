import AppCore
import DesignSystem
import SwiftUI

/// One repair: the item's row, what happened in one line, the stacked choice
/// or the field it needs, and its two commits at the bottom. Committing
/// leaves the undo capsule; `unrecognised` (no approved repair kind covers
/// it, ADR-002's open question 1) offers only Let go.
internal struct InventoryRepairScreen: View {
    @State internal var model: InventoryRepairViewModel
    @State private var chosen: InventoryRepairOption.ID?
    @State private var code: String = ""
    @Environment(\.inventoryItemForm) private var itemForm

    internal init(repairId: InventoryRepair.ID, store: any InventoryStore) {
        _model = State(wrappedValue: InventoryRepairViewModel(repairId: repairId, store: store))
    }

    internal var body: some View {
        Group {
            switch model.phase {
            case .loading:
                InventoryRepairSkeleton()
            case .resolvedElsewhere where model.outcome == nil:
                InventoryRepairResolvedElsewhere()
            case .open, .resolvedElsewhere:
                if let row = model.row {
                    content(row)
                } else {
                    InventoryRepairResolvedElsewhere()
                }
            }
        }
        .task { await model.observe() }
        .onChange(of: model.row?.repair.options.first?.id) { _, newValue in
            if chosen == nil { chosen = newValue }
        }
        .onChange(of: model.row?.repair.suggestedCode) { _, newValue in
            if code.isEmpty { code = newValue ?? "" }
        }
        .navigationTitle("Repair")
        .popsTitleDisplay(large: false)
        .tint(.popsInventory)
        .inventoryWriteFailureAlerts($model.failure)
        .alert(
            "That change did not save",
            isPresented: Binding(
                get: { model.refusal != nil }, set: { if !$0 { model.refusal = nil } }),
            presenting: model.refusal
        ) { _ in
            Button("OK", role: .cancel) {}
        } message: {
            Text($0)
        }
    }

    private func content(_ row: InventorySyncRepairRow) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                notice(row)
                details(row)
            }
            .popsMotion(value: model.outcome)
            .popsMotion(value: chosen)
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.xxl)
        }
        .background(Color.popsBackground)
        .safeAreaInset(edge: .bottom) {
            if model.outcome == nil { commits(row) }
        }
    }

    @ViewBuilder private func notice(_ row: InventorySyncRepairRow) -> some View {
        if let outcome = model.outcome {
            Label(outcome, systemImage: InventorySymbol.resolved.system)
                .font(.popsHeadline)
                .foregroundStyle(Color.popsSuccess)
        } else {
            Label(row.problem, systemImage: InventorySymbol.attention.system)
                .font(.popsHeadline)
                .foregroundStyle(Color.popsDestructive)
        }
    }

    @ViewBuilder private func details(_ row: InventorySyncRepairRow) -> some View {
        switch row.repair.kind {
        case .conflict:
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                InventoryGroundedSectionHeader(title: row.repair.field?.capitalized ?? "")
                InventoryGroundedListPanel {
                    VStack(spacing: PopsSpacing.zero) {
                        ForEach(row.repair.options) { option in
                            InventoryConflictChoiceRow(
                                option: option, isChosen: chosen == option.id,
                                isLocked: model.outcome != nil
                            ) { chosen = option.id }
                            if option.id != row.repair.options.last?.id {
                                PopsDivider()
                            }
                        }
                    }
                }
            }
        case .codeCollision:
            codeEntry(row)
        case .catalogueChanged:
            if let detail = row.catalogue {
                InventoryCatalogueRepairDetails(title: detail.title, values: detail.values)
            }
        case .photoFailed, .deletedElsewhere, .unrecognised:
            EmptyView()
        }
    }

    private func codeEntry(_ row: InventorySyncRepairRow) -> some View {
        InventoryGroundedListPanel {
            HStack(spacing: PopsSpacing.sm) {
                TextField("Code", text: $code)
                    .font(.popsMonospaced)
                    .inventoryCodeCapitalization()
                Button {
                    code = row.repair.suggestedCode ?? code
                } label: {
                    InventorySymbol.suggest.image
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("Suggest a code")
            }
            .frame(minHeight: PopsSize.touchTarget)
            .disabled(model.outcome != nil)
        }
    }

    @ViewBuilder private func commits(_ row: InventorySyncRepairRow) -> some View {
        if let detail = row.catalogue {
            InventoryCatalogueRepairCommits(
                detail: detail,
                letGo: { Task { await model.commit(keepingMine: false, code: nil) } },
                retry: { Task { await model.commit(keepingMine: true, code: nil) } },
                editItem: {
                    model.beginEditing()
                    itemForm?(.repair(row.repair.id))
                })
        } else {
            standardCommits(row)
        }
    }

    private func standardCommits(_ row: InventorySyncRepairRow) -> some View {
        HStack(spacing: PopsSpacing.md) {
            Button {
                Task { await model.commit(keepingMine: false, code: nil) }
            } label: {
                Text(row.repair.kind.letGoTitle)
                    .font(.popsHeadline)
                    .frame(maxWidth: .infinity, minHeight: PopsSize.touchTarget)
            }
            .buttonStyle(.bordered)
            if let keepTitle = row.repair.kind.keepTitle {
                Button {
                    Task {
                        await model.commit(
                            keepingMine: true,
                            code: row.repair.kind == .codeCollision ? code : nil)
                    }
                } label: {
                    Text(keepTitle)
                        .font(.popsHeadline)
                        .frame(maxWidth: .infinity, minHeight: PopsSize.touchTarget)
                }
                .popsProminentGlassButton()
                .disabled(row.repair.kind == .codeCollision && code.isEmpty)
            }
        }
        .padding(.horizontal, PopsSpacing.lg)
        .padding(.bottom, PopsSpacing.sm)
        .tint(.popsInventory)
        .background(.bar)
    }
}

private struct InventoryRepairSkeleton: View {
    @ScaledMetric(relativeTo: .body) private var rowHeight = PopsSize.touchTarget * 2

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            RoundedRectangle(cornerRadius: PopsRadius.card, style: .continuous)
                .fill(Color.popsSurface)
                .frame(height: rowHeight)
        }
        .popsShimmer()
        .padding(.horizontal, PopsSpacing.lg)
        .accessibilityLabel("Loading")
    }
}

/// Another device (or this one, before this screen finished loading) already
/// settled this repair. There is nothing left to commit.
private struct InventoryRepairResolvedElsewhere: View {
    internal var body: some View {
        VStack(spacing: PopsSpacing.md) {
            InventorySymbol.resolved.image
                .font(.popsLargeTitle)
                .foregroundStyle(Color.popsMutedForeground)
            Text("This was already resolved")
                .font(.popsHeadline)
                .foregroundStyle(Color.popsMutedForeground)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(PopsSpacing.lg)
        .background(Color.popsBackground)
    }
}
