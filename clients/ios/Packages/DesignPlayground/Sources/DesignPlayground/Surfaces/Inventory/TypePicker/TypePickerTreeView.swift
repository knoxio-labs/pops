import DesignSystem
import SwiftUI

internal struct TypePickerTreeView: View {
    let tree: TypePickerTreeState
    let choose: (String?) -> Void

    var body: some View {
        VStack(spacing: PopsSpacing.zero) {
            ancestry
            Divider()
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: PopsSpacing.zero) {
                        ForEach(tree.rows) { row in
                            TypePickerTreeRowView(
                                row: row, mode: tree.mode,
                                toggle: { tree.toggle(row.id) },
                                focus: { tree.focus(row.id) },
                                choose: { choose(row.id) }
                            )
                            .id(row.id)
                            Divider()
                        }
                    }
                }
                .onChange(of: tree.focusID) {
                    if let first = tree.rows.first {
                        proxy.scrollTo(first.id, anchor: .top)
                    }
                }
            }
        }
    }

    private var ancestry: some View {
        HStack(spacing: PopsSpacing.sm) {
            Button(action: tree.resetFocus) {
                Label("All types", systemImage: "arrow.up.left")
                    .frame(minHeight: PopsSize.touchTarget)
            }
            .disabled(tree.focusID == "item")
            if tree.focusID != "item" {
                Menu {
                    ForEach(tree.breadcrumbs.dropLast()) { ancestor in
                        Button(ancestor.name) { tree.goTo(ancestor.id) }
                    }
                } label: {
                    Text(TypePickerTaxonomy.node(tree.focusID)?.name ?? "")
                        .font(.popsHeadline)
                        .frame(maxWidth: .infinity, minHeight: PopsSize.touchTarget)
                }
                .accessibilityHint("Choose an ancestor to widen the tree")
            } else {
                Spacer(minLength: PopsSpacing.zero)
            }
            Button("Choose") { choose(tree.focusID) }
                .frame(minHeight: PopsSize.touchTarget)
                .accessibilityLabel(
                    "Choose \(TypePickerTaxonomy.node(tree.focusID)?.name ?? "Item")")
        }
        .font(.popsSubheadline)
        .padding(.horizontal, PopsSpacing.lg)
    }
}

internal struct TypePickerTreeRowView: View {
    let row: TypePickerTreeRow
    let mode: TypePickerTreeMode
    let toggle: () -> Void
    let focus: () -> Void
    let choose: () -> Void
    @ScaledMetric(relativeTo: .body) private var indent = PopsSpacing.lg

    var body: some View {
        HStack(spacing: PopsSpacing.zero) {
            if row.hasChildren {
                Button(action: toggle) {
                    Image(systemName: row.isExpanded ? "chevron.down" : "chevron.right")
                        .font(.popsCaption.weight(.semibold))
                        .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
                        .contentShape(.rect)
                }
                .accessibilityLabel("\(row.isExpanded ? "Collapse" : "Expand") \(row.node.name)")
                .accessibilityValue(row.isExpanded ? "Expanded" : "Collapsed")
            } else {
                Color.clear.frame(width: PopsSize.touchTarget, height: PopsSpacing.zero)
                    .accessibilityHidden(true)
            }
            Button(action: choose) {
                Text(row.node.name)
                    .font(.popsBody)
                    .frame(
                        maxWidth: .infinity, minHeight: PopsSize.touchTarget, alignment: .leading
                    )
                    .contentShape(.rect)
            }
            .accessibilityLabel("Choose \(row.node.name)")
            .accessibilityHint(TypePickerTaxonomy.breadcrumb(for: row.id))
            if mode == .manual && row.hasChildren {
                Button(action: focus) {
                    Image(systemName: "scope")
                        .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
                        .contentShape(.rect)
                }
                .accessibilityLabel("Focus on \(row.node.name)")
            }
        }
        .buttonStyle(.plain)
        .padding(.leading, CGFloat(max(0, row.depth - 1)) * indent)
        .padding(.trailing, PopsSpacing.lg)
        .background(row.isExpanded ? Color.popsSurface : Color.popsBackground)
    }
}
