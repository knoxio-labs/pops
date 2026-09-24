import DesignSystem
import SwiftUI

/// One repair: the item's row, what happened in one line, the stacked choice
/// or the field it needs, and its two commits at the bottom. Committing
/// leaves the undo capsule.
internal struct InventoryRepairView: View {
    internal let repair: InventoryRepair
    private let lingers: Bool
    @State private var chosen: InventoryRepairOption.ID?
    @State private var code: String
    @State private var outcome: String?
    @State private var offer: InventoryUndoOffer?
    @State private var failure: String?
    /// Whether the commit kept this phone's change, which is then queued.
    @State private var keptMine: Bool
    /// Edit item's form, up over the repair.
    @State private var editing: Bool

    /// `resolved` stages the page just after a commit, with the capsule held
    /// up: Keep's by default, Let go's when `keepingMine` is false. `failure`
    /// stages it with the write-failure alert up.
    internal init(
        repair: InventoryRepair, resolved: Bool = false, keepingMine: Bool = true,
        failure: String? = nil, editing: Bool = false
    ) {
        self.repair = repair
        lingers = resolved
        _editing = State(initialValue: editing)
        _chosen = State(initialValue: repair.options.first?.id)
        _code = State(initialValue: repair.suggestedCode ?? "")
        _failure = State(initialValue: failure)
        _keptMine = State(initialValue: resolved && keepingMine)
        let outcome = resolved ? repair.outcome(keepingMine: keepingMine) : nil
        _outcome = State(initialValue: outcome)
        _offer = State(
            initialValue: outcome.map {
                InventoryUndoOffer(message: $0, symbol: .resolved, id: repair.id)
            })
    }

    private var record: InventorySearchRecord? {
        guard let record = InventorySearchFixtures.record(id: repair.recordID) else { return nil }
        guard outcome != nil, keptMine else { return record }
        var item = record.item
        item.sync = .queued
        return InventorySearchRecord(
            item: item, externalIdentifier: record.externalIdentifier, note: record.note,
            capabilities: record.capabilities, photo: record.photo,
            addedDaysAgo: record.addedDaysAgo)
    }

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                if let record {
                    InventoryGroundedListPanel {
                        NavigationLink(value: InventoryRoute.item(record.id)) {
                            InventoryRecordRowLabel(record: record, showsCode: true)
                        }
                        .buttonStyle(.plain)
                    }
                }
                notice
                    .padding(.horizontal, PopsSpacing.md)
                details
            }
            .inventoryMotion(value: outcome)
            .inventoryMotion(value: chosen)
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.xxl)
        }
        .scrollBounceBehavior(.basedOnSize)
        .background(Color.popsBackground)
        .navigationTitle("Repair")
        .playgroundTitleDisplay(large: false)
        .tint(.popsInventory)
        .safeAreaInset(edge: .bottom) {
            if outcome == nil {
                if let change = repair.catalogue {
                    InventoryCatalogueCommits(
                        change: change, letGo: repair.kind.letGo,
                        commit: { commit(keepingMine: $0) }, editItem: { editing = true })
                } else {
                    commits
                }
            }
        }
        .sheet(isPresented: $editing) {
            if let change = repair.catalogue,
                let draft = InventoryCatalogueFixtures.editDraft(for: repair)
            {
                NavigationStack {
                    InventoryItemFormView(
                        draft: draft, mode: .edit,
                        notCarried: change.values.filter(\.fit.blocks))
                }
            }
        }
        .inventoryUndoCapsule($offer, lingers: lingers) { _ in outcome = nil }
        .alert(
            "That change did not save",
            isPresented: Binding(get: { failure != nil }, set: { if !$0 { failure = nil } }),
            presenting: failure
        ) { _ in
            Button("OK", role: .cancel) {}
        } message: {
            Text($0)
        }
    }

    @ViewBuilder private var notice: some View {
        if let outcome {
            InventoryItemDetailNotice(
                symbol: InventorySymbol.resolved.system, tint: .popsSuccess, text: outcome)
        } else {
            InventoryItemDetailNotice(
                symbol: InventorySymbol.attention.system, tint: .popsDestructive,
                text: repair.problem)
        }
    }

    @ViewBuilder private var details: some View {
        switch repair.kind {
        case .conflict:
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                InventoryLocationSectionHeader(title: repair.field ?? "")
                InventoryLocationPanel(rows: repair.options) { option in
                    InventoryConflictChoice(
                        option: option, isChosen: chosen == option.id,
                        isLocked: outcome != nil
                    ) { chosen = option.id }
                }
            }
        case .codeCollision:
            InventoryGroundedListPanel {
                InventoryFormTextRow(
                    "New code", placeholder: "Code", text: $code, monospaced: true
                ) {
                    Button {
                        code = repair.suggestedCode ?? code
                    } label: {
                        InventorySymbol.suggest.image
                    }
                    .buttonStyle(.borderless)
                    .accessibilityLabel("Suggest a code")
                }
                .frame(minHeight: PopsSize.touchTarget)
                .disabled(outcome != nil)
            }
        case .photoFailed:
            if let photo = record?.photo {
                InventoryRepairPhoto(photo: photo, symbol: record?.item.symbol.system ?? "")
            }
        case .catalogueChanged:
            if let change = repair.catalogue { InventoryCatalogueRepairDetails(change: change) }
        case .deletedElsewhere:
            EmptyView()
        }
    }

    private var commits: some View {
        PlaygroundGlassGroup(spacing: PopsSpacing.md) {
            HStack(spacing: PopsSpacing.md) {
                Button {
                    commit(keepingMine: false)
                } label: {
                    Text(repair.kind.letGo)
                        .font(.popsHeadline)
                        .frame(maxWidth: .infinity, minHeight: PopsSize.touchTarget)
                }
                .playgroundGlassButton()
                Button {
                    commit(keepingMine: true)
                } label: {
                    Text(repair.kind.keep)
                        .font(.popsHeadline)
                        .frame(maxWidth: .infinity, minHeight: PopsSize.touchTarget)
                }
                .playgroundProminentGlassButton()
                .disabled(repair.kind == .codeCollision && code.isEmpty)
            }
        }
        .padding(.horizontal, PopsSpacing.lg)
        .padding(.bottom, PopsSpacing.sm)
        .tint(.popsInventory)
    }

    private func commit(keepingMine: Bool) {
        if keepingMine, let refusal = repair.catalogue?.retry.refusal {
            failure = refusal
            return
        }
        let keepsMine =
            repair.kind == .conflict
            ? chosen == repair.options.first?.id && keepingMine : keepingMine
        if repair.kind == .conflict, !keepingMine { chosen = repair.options.last?.id }
        let next = repair.outcome(keepingMine: keepsMine, code: code)
        keptMine = keepsMine
        outcome = next
        offer = InventoryUndoOffer(message: next, symbol: .resolved, id: repair.id)
    }
}

/// One side of a conflict as a row to pick: its value over where it came from
/// and when, with the selection mark trailing.
internal struct InventoryConflictChoice: View {
    internal let option: InventoryRepairOption
    internal let isChosen: Bool
    internal let isLocked: Bool
    internal let onChoose: () -> Void

    internal var body: some View {
        Button(action: onChoose) {
            HStack(spacing: PopsSpacing.md) {
                Image(systemName: option.source.symbol)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsMutedForeground)
                    .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text(option.value)
                        .font(.popsHeadline)
                        .foregroundStyle(Color.popsForeground)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("\(option.source.title) · \(option.when)")
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
}

/// The photo that did not upload, at the width of the page and no wider.
private struct InventoryRepairPhoto: View {
    let photo: Data
    let symbol: String
    @ScaledMetric(relativeTo: .body) private var height = PopsSize.touchTarget * 4

    var body: some View {
        Color.popsSurface
            .frame(maxWidth: .infinity)
            .frame(height: height)
            .overlay {
                InventoryItemDetailPicture(
                    photo: InventoryPhoto(caption: "", isBroken: false, imageData: photo),
                    symbol: symbol)
            }
            .clipShape(RoundedRectangle(cornerRadius: PopsRadius.card, style: .continuous))
            .accessibilityLabel("Photo")
    }
}
