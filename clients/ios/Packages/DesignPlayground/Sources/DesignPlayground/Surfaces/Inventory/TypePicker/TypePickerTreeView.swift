import DesignSystem
import SwiftUI

internal struct TypePickerTreeView: View {
    let tree: TypePickerTreeState
    let selectedID: String?
    let choose: (String?) -> Void

    var body: some View {
        VStack(spacing: PopsSpacing.zero) {
            ancestry
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: PopsSpacing.zero) {
                        ForEach(tree.rows) { row in
                            TypePickerTreeRowView(
                                row: row, mode: tree.mode, selected: row.id == selectedID,
                                toggle: { tree.toggle(row.id) },
                                focus: { tree.focus(row.id) },
                                choose: { choose(row.id) }
                            )
                            .id(row.id)
                            .transition(.opacity)
                        }
                    }
                    .padding(.horizontal, PopsSpacing.sm)
                    .padding(.bottom, PopsSpacing.lg)
                    .popsMotion(value: tree.rows)
                }
                .onAppear {
                    if let selectedID { proxy.scrollTo(selectedID, anchor: .center) }
                }
                .onChange(of: tree.focusID) {
                    if let first = tree.rows.first { proxy.scrollTo(first.id, anchor: .top) }
                }
            }
        }
    }

    private var ancestry: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.zero) {
            if tree.focusID != "item" {
                Menu {
                    Button("All types", action: tree.resetFocus)
                    ForEach(tree.breadcrumbs.dropFirst().dropLast()) { ancestor in
                        Button(ancestor.name) { tree.goTo(ancestor.id) }
                    }
                } label: {
                    Label(
                        "All types / \(tree.breadcrumbs.dropLast().last?.name ?? "Item")",
                        systemImage: "arrow.up.left"
                    )
                    .font(.popsCaption)
                    .frame(minHeight: PopsSize.touchTarget)
                }
                .accessibilityHint("Choose an ancestor to widen the tree")
            }
            HStack(spacing: PopsSpacing.sm) {
                Text(
                    tree.focusID == "item"
                        ? "All types" : TypePickerTaxonomy.node(tree.focusID)?.name ?? "Types"
                )
                .font(.popsHeadline)
                .foregroundStyle(Color.popsForeground)
                Spacer(minLength: PopsSpacing.sm)
                Button {
                    choose(tree.focusID)
                } label: {
                    Label(
                        TypePickerTaxonomy.node(tree.focusID)?.name ?? "Item",
                        systemImage: selectedID == tree.focusID
                            ? "checkmark.circle.fill" : "circle"
                    )
                    .font(.popsCaption)
                    .frame(minHeight: PopsSize.touchTarget)
                }
                .accessibilityLabel(
                    "Choose \(TypePickerTaxonomy.node(tree.focusID)?.name ?? "Item")"
                )
                .accessibilityAddTraits(selectedID == tree.focusID ? .isSelected : [])
            }
        }
        .padding(.horizontal, PopsSpacing.lg)
        .popsMotion(value: tree.focusID)
    }
}

internal struct TypePickerTreeRowView: View {
    let row: TypePickerTreeRow
    let mode: TypePickerTreeMode
    let selected: Bool
    let toggle: () -> Void
    let focus: () -> Void
    let choose: () -> Void
    @ScaledMetric(relativeTo: .body) private var indent = PopsSpacing.md

    var body: some View {
        HStack(spacing: PopsSpacing.zero) {
            if row.hasChildren {
                Button(action: toggle) {
                    Image(systemName: "chevron.right")
                        .font(.popsCaption.weight(.semibold))
                        .rotationEffect(.degrees(row.isExpanded ? 90 : 0))
                        .foregroundStyle(Color.popsMutedForeground)
                        .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
                        .contentShape(.rect)
                }
                .accessibilityLabel("\(row.isExpanded ? "Collapse" : "Expand") \(row.node.name)")
                .accessibilityValue(row.isExpanded ? "Expanded" : "Collapsed")
            } else {
                Image(systemName: row.node.symbol)
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
                    .frame(width: PopsSize.touchTarget)
                    .accessibilityHidden(true)
            }
            Button(action: choose) {
                HStack(spacing: PopsSpacing.sm) {
                    Text(row.node.name)
                        .font(.popsBody.weight(selected ? .semibold : .regular))
                        .foregroundStyle(Color.popsForeground)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if selected {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(Color.popsInventory)
                    }
                }
                .padding(.vertical, PopsSpacing.xs)
                .frame(minHeight: PopsSize.touchTarget)
                .contentShape(.rect)
            }
            .accessibilityLabel("Choose \(row.node.name)")
            .accessibilityHint(TypePickerTaxonomy.breadcrumb(for: row.id))
            .accessibilityAddTraits(selected ? .isSelected : [])
            if mode == .manual && row.hasChildren {
                Button(action: focus) {
                    Image(systemName: "arrow.down.right.and.arrow.up.left")
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                        .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
                        .contentShape(.rect)
                }
                .accessibilityLabel("Focus on \(row.node.name)")
            }
        }
        .buttonStyle(.plain)
        .padding(.leading, CGFloat(max(0, row.depth - 1)) * indent)
        .padding(.trailing, PopsSpacing.sm)
        .background(
            selected ? Color.popsInventory.opacity(0.12) : Color.clear,
            in: .rect(cornerRadius: PopsRadius.control)
        )
        .popsMotion(value: row.isExpanded)
    }
}
