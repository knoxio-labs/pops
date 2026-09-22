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
        case .photoFailed, .deletedElsewhere, .unrecognised:
            EmptyView()
        }
    }

    @ViewBuilder private func commits(_ row: InventorySyncRepairRow) -> some View {
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

/// One side of a conflict as a row to pick: its value over where it came
/// from and when, with the selection mark trailing.
internal struct InventoryConflictChoiceRow: View {
    internal let option: InventoryRepairOption
    internal let isChosen: Bool
    internal let isLocked: Bool
    internal let onChoose: () -> Void

    internal var body: some View {
        Button(action: onChoose) {
            HStack(spacing: PopsSpacing.md) {
                Image(systemName: sourceSymbol)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsMutedForeground)
                    .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text(option.value)
                        .font(.popsHeadline)
                        .foregroundStyle(Color.popsForeground)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("\(sourceTitle) · \(InventoryRelativeTime.text(option.at))")
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
                Spacer(minLength: PopsSpacing.sm)
                Image(systemName: isChosen ? "checkmark.circle.fill" : "circle")
                    .font(.popsTitle)
                    .foregroundStyle(isChosen ? Color.popsInventory : Color.popsMutedForeground)
                    .contentTransition(.symbolEffect(.replace))
                    .opacity(isLocked && !isChosen ? 0 : 1)
            }
            .padding(.vertical, PopsSpacing.xs)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .disabled(isLocked)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(isChosen ? .isSelected : [])
    }

    private var sourceTitle: String {
        switch option.source {
        case .thisDevice: "This phone"
        case .otherDevice(let label): label
        case .web: "Web"
        case .service(let account): account
        case .unrecognised(_, let label): label
        }
    }

    private var sourceSymbol: String {
        switch option.source {
        case .thisDevice: "iphone"
        case .otherDevice: "ipad"
        case .web, .service: "server.rack"
        case .unrecognised: "questionmark.circle"
        }
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
