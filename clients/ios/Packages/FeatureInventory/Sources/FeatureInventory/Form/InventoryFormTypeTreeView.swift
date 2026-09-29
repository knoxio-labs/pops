import DesignSystem
import SwiftUI

internal struct InventoryFormTypeTreeView: View {
    let tree: InventoryTypePickerTreeState
    let selection: String?
    let choose: (String) -> Void

    var body: some View {
        VStack(spacing: PopsSpacing.zero) {
            focusHeader
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: PopsSpacing.zero) {
                        ForEach(tree.rows) { row in
                            rowView(row)
                                .id(row.id)
                                .transition(.opacity)
                            if row.id != tree.rows.last?.id {
                                Divider().padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
                            }
                        }
                    }
                    .padding(.horizontal, PopsSpacing.sm)
                    .padding(.bottom, PopsSpacing.xl)
                    .popsMotion(value: tree.rows)
                }
                .onAppear {
                    if let selection { proxy.scrollTo(selection, anchor: .center) }
                }
                .onChange(of: tree.focusID) {
                    if let first = tree.rows.first { proxy.scrollTo(first.id, anchor: .top) }
                }
            }
        }
    }

    private var focusHeader: some View {
        let focused = tree.focusID.flatMap { id in tree.options.first { $0.id == id } }
        return VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            if tree.focusID != nil {
                Menu {
                    Button("All types") { tree.resetFocus() }
                    ForEach(tree.breadcrumbs.dropLast()) { ancestor in
                        Button(ancestor.label) { tree.goTo(ancestor.id) }
                    }
                } label: {
                    Label(
                        "All types / \(tree.breadcrumbs.dropLast().last?.label ?? "Item")",
                        systemImage: "arrow.up.left"
                    )
                    .font(.popsCaption)
                    .frame(minHeight: PopsSize.touchTarget)
                }
                .accessibilityHint("Choose an ancestor to widen the tree")
            }
            HStack(spacing: PopsSpacing.sm) {
                Label(
                    focused?.label ?? "All types",
                    systemImage: focused?.symbol.system ?? InventorySymbol.item.system
                )
                .font(.popsHeadline)
                .foregroundStyle(Color.popsForeground)
                Spacer(minLength: PopsSpacing.sm)
                if let focusID = tree.focusID {
                    Button {
                        choose(focusID)
                    } label: {
                        Label(
                            selection == focusID
                                ? tree.options.first { $0.id == focusID }?.label ?? "Selected"
                                : "Use \(tree.options.first { $0.id == focusID }?.label ?? "type")",
                            systemImage: selection == focusID ? "checkmark.circle.fill" : "circle"
                        )
                        .font(.popsCaption)
                        .frame(minHeight: PopsSize.touchTarget)
                    }
                    .accessibilityAddTraits(selection == focusID ? .isSelected : [])
                }
            }
        }
        .padding(.horizontal, PopsSpacing.lg)
        .padding(.vertical, PopsSpacing.sm)
        .popsMotion(value: tree.focusID)
    }

    private func rowView(_ row: InventoryTypePickerTreeRow) -> some View {
        HStack(spacing: PopsSpacing.zero) {
            leadingControl(for: row)
            selectionButton(for: row)
            focusButton(for: row)
        }
        .buttonStyle(.plain)
        .padding(.leading, CGFloat(row.depth) * PopsSpacing.md)
        .padding(.trailing, PopsSpacing.sm)
        .background(
            selection == row.id
                ? Color.popsInventory.opacity(0.12)
                : Color.popsBackground.opacity(0),
            in: .rect(cornerRadius: PopsRadius.control)
        )
        .popsMotion(value: row.isExpanded)
    }

    @ViewBuilder private func leadingControl(for row: InventoryTypePickerTreeRow) -> some View {
        if row.hasChildren {
            Button {
                tree.toggle(row.id)
            } label: {
                Image(systemName: "chevron.right")
                    .font(.popsCaption.weight(.semibold))
                    .rotationEffect(.degrees(row.isExpanded ? 90 : 0))
                    .foregroundStyle(Color.popsMutedForeground)
                    .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
                    .contentShape(.rect)
            }
            .accessibilityLabel("\(row.isExpanded ? "Collapse" : "Expand") (\(row.option.label))")
            .accessibilityValue(row.isExpanded ? "Expanded" : "Collapsed")
        } else {
            Color.popsBackground.opacity(0)
                .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
                .accessibilityHidden(true)
        }
    }

    private func selectionButton(for row: InventoryTypePickerTreeRow) -> some View {
        Button {
            choose(row.id)
        } label: {
            HStack(spacing: PopsSpacing.sm) {
                row.option.symbol.image.foregroundStyle(Color.popsInventory)
                Text(row.option.label)
                    .font(.popsBody.weight(selection == row.id ? .semibold : .regular))
                    .foregroundStyle(
                        row.option.isArchived
                            ? Color.popsMutedForeground : Color.popsForeground
                    )
                    .frame(maxWidth: .infinity, alignment: .leading)
                if selection == row.id {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(Color.popsInventory)
                }
            }
            .frame(minHeight: PopsSize.touchTarget)
            .contentShape(.rect)
        }
        .disabled(row.option.isArchived)
        .accessibilityIdentifier(row.option.accessibilityIdentifier)
        .accessibilityLabel(
            selection == row.id ? "Selected \(row.option.label)" : "Choose \(row.option.label)"
        )
        .accessibilityHint(row.option.path)
        .accessibilityAddTraits(selection == row.id ? .isSelected : [])
    }

    @ViewBuilder private func focusButton(for row: InventoryTypePickerTreeRow) -> some View {
        if row.hasChildren {
            Button {
                tree.focus(row.id)
            } label: {
                Image(systemName: "arrow.down.right.and.arrow.up.left")
                    .foregroundStyle(Color.popsMutedForeground)
                    .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
                    .contentShape(.rect)
            }
            .accessibilityLabel("Focus on \(row.option.label)")
        }
    }
}
